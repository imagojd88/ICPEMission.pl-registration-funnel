import {
  BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentPlanService, summarize } from '../registrations/payment-plan.service';
import { manageRegistrationLink, mailLang, titleFor } from '../registrations/registrations.service';
import { planRefund, PricingConfig, RefundPlan, toGrosze } from '../shared';
import { tpayConfig } from './tpay-config';
import { TpayRefundResult, TpayService } from './tpay.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Kto zleca zwrot — z JWT pełnego admina. */
export interface RefundActor {
  id: string | null;
  email: string;
}

/** Zlecenie PENDING starsze niż to uznajemy za przerwane (np. restart serwera w trakcie) → „do wyjaśnienia”. */
export const REFUND_STALE_MS = 2 * 60_000;

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const zl = (n: number) => `${n.toFixed(2).replace('.', ',')} zł`;
const roomIdsOf = (roomsJson: unknown): string[] =>
  (Array.isArray(roomsJson) ? roomsJson : []).map((r) => String((r as { roomId?: unknown })?.roomId ?? '')).filter(Boolean);

/** Kody błędów Tpay (docs-api.tpay.com ▸ Error Codes) → komunikat dla admina. */
const TPAY_REFUND_ERRORS: Record<string, string> = {
  already_refunded: 'Tpay: ta transakcja została już zwrócona.',
  cannot_create_refund: 'Tpay: tej transakcji nie można zwrócić (kanał płatności nie obsługuje zwrotów albo minął termin).',
  cannot_refund_collect_transaction: 'Tpay: tego rodzaju transakcji nie można zwrócić.',
  cannot_refund_marketplace_transaction: 'Tpay: tego rodzaju transakcji nie można zwrócić.',
  no_sufficient_funds_or_refund_limit_reached: 'Tpay: brak środków na saldzie do zwrotu albo osiągnięty limit zwrotów. Zasil saldo w panelu Tpay i spróbuj ponownie.',
  refund_failed: 'Tpay: zwrot nie został utworzony.',
  refund_period_expired: 'Tpay: minął termin, w którym można zwrócić tę transakcję.',
  auth_failed: 'Tpay odrzucił autoryzację (klucze API). Zwrot NIE został zlecony.',
  not_configured: 'Płatności online (Tpay) nie są skonfigurowane.',
  bad_transaction_id: 'Brak poprawnego identyfikatora transakcji Tpay dla tej wpłaty — zwróć ją w panelu Tpay.',
};

function tpayRejectionMessage(codes: string[], httpStatus: number | null): string {
  for (const c of codes) if (TPAY_REFUND_ERRORS[c]) return `${TPAY_REFUND_ERRORS[c]} Nic nie zostało zwrócone.`;
  const shown = codes.filter((c) => /^[a-z0-9_]+$/.test(c)).join(', ');
  return `Tpay odrzucił zlecenie zwrotu${shown ? ` (${shown})` : httpStatus ? ` (HTTP ${httpStatus})` : ''}. Nic nie zostało zwrócone.`;
}

const isUniqueViolation = (e: unknown) => (e as { code?: unknown } | null)?.code === 'P2002';

/**
 * Zwroty wpłat Tpay zlecane z panelu admina.
 *
 * Kolejność: (1) walidacja na serwerze, (2) „zajęcie” wpłaty wierszem PENDING z unikalnym `lockKey`
 * (drugie równoległe zlecenie dostaje 409 — Tpay nie zobaczy dwóch zleceń), (3) JEDNO wywołanie Tpay,
 * (4) księgowanie w jednej transakcji bazy dopiero po sukcesie. Odpowiedź niejednoznaczna → wiersz
 * UNCERTAIN (blokada zostaje), mail do organizatora, żadnego automatycznego ponowienia.
 * W logach: identyfikatory, kwota, kto zlecił. Bez sekretów i bez odpowiedzi Tpay.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger('Refunds');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tpay: TpayService,
    private readonly paymentPlan: PaymentPlanService,
    private readonly mail: NotificationsService,
  ) {}

  private get db(): Db {
    return this.prisma as Db;
  }

  private planError(plan: Extract<RefundPlan, { ok: false }>): never {
    switch (plan.reason) {
      case 'NOT_PAID':
        throw new BadRequestException('Zwrócić można tylko zaksięgowaną wpłatę (ta jest już zwrócona w całości albo anulowana).');
      case 'IN_FLIGHT':
        throw new ConflictException('Zwrot tej wpłaty jest już w toku albo czeka na wyjaśnienie. Sprawdź listę zwrotów pod wpłatą.');
      case 'NOTHING_LEFT':
        throw new BadRequestException('Ta wpłata została już zwrócona w całości.');
      case 'ABOVE_MAX':
        throw new BadRequestException(`Kwota zwrotu nie może być większa niż ${zl(plan.max)} (tyle zostało z tej wpłaty).`);
      default:
        throw new BadRequestException(`Podaj poprawną kwotę zwrotu: większą od zera, najwyżej ${zl(plan.max)}, z dokładnością do grosza.`);
    }
  }

  /** `POST /admin/payments/:paymentId/refund` */
  async refund(paymentId: string, dto: { amount?: unknown; reason?: unknown; notifyGuest?: unknown }, actor: RefundActor) {
    if (!tpayConfig().ready) throw new HttpException('Płatności online (Tpay) nie są skonfigurowane — zwrot z panelu jest niedostępny.', HttpStatus.SERVICE_UNAVAILABLE);
    if (!paymentId || paymentId.length > 60) throw new NotFoundException('Payment not found');
    const p = (await this.db.payment.findUnique({ where: { id: paymentId } })) as
      | { id: string; registrationId: string; provider: string; amount: unknown; currency: string; status: string; externalId: string | null; raw: unknown }
      | null;
    if (!p) throw new NotFoundException('Payment not found');
    if (p.provider !== 'tpay') throw new BadRequestException('Z panelu można zwrócić tylko wpłatę online (Tpay). Wpłatę ręczną można cofnąć przyciskiem „cofnij”.');
    if (String(p.currency || 'PLN').toUpperCase() !== 'PLN') throw new BadRequestException('Zwrot z panelu działa tylko dla wpłat w złotych.');
    const reason = typeof dto?.reason === 'string' ? dto.reason.trim().slice(0, 300) || null : null;
    const notifyGuest = dto?.notifyGuest !== false && dto?.notifyGuest !== 'false';
    const requested = dto?.amount === undefined || dto?.amount === null || dto?.amount === '' ? undefined : dto.amount;

    const loadRefunds = async (exceptId?: string) =>
      ((await this.db.paymentRefund.findMany({
        where: { paymentId, ...(exceptId ? { id: { not: exceptId } } : {}) },
        select: { amount: true, status: true },
      })) as Array<{ amount: unknown; status: string }>).map((r) => ({ amount: num(r.amount), status: r.status }));

    const plan = planRefund({ amount: num(p.amount), status: p.status }, await loadRefunds(), requested);
    if (!plan.ok) this.planError(plan);

    // Identyfikator transakcji z API Tpay jest w próbie płatności (`OnlinePayment.externalId`);
    // `Payment.externalId` to tytuł `TR-…`, którego ścieżka zwrotu nie przyjmuje.
    const rawOf = (p.raw ?? {}) as { onlinePaymentId?: unknown; testMode?: unknown; title?: unknown };
    const attempt = ((await this.db.onlinePayment.findFirst({ where: { paymentId }, select: { id: true, externalId: true, testMode: true } })) ??
      (typeof rawOf.onlinePaymentId === 'string'
        ? await this.db.onlinePayment.findUnique({ where: { id: rawOf.onlinePaymentId }, select: { id: true, externalId: true, testMode: true } })
        : null)) as { id: string; externalId: string | null; testMode: boolean } | null;
    if (!attempt?.externalId) throw new BadRequestException('Ta wpłata nie ma identyfikatora transakcji Tpay — zwróć ją w panelu Tpay.');
    const testMode = !!attempt.testMode || !!rawOf.testMode;

    // (2) Zajęcie wpłaty. Unikalny `lockKey` = jedno zlecenie naraz, także przy podwójnym kliknięciu i dwóch adminach.
    let refundId: string;
    try {
      const row = (await this.db.paymentRefund.create({
        data: {
          paymentId,
          registrationId: p.registrationId,
          amount: plan.amount,
          currency: 'PLN',
          reason,
          status: 'PENDING',
          source: 'panel',
          lockKey: paymentId,
          createdBy: actor.email.slice(0, 190),
          createdById: actor.id,
          testMode,
          raw: { full: plan.sendFull, notifyGuest },
        },
        select: { id: true },
      })) as { id: string };
      refundId = row.id;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Zwrot tej wpłaty jest już w toku albo czeka na wyjaśnienie. Sprawdź listę zwrotów pod wpłatą.');
      throw e;
    }

    // Stan mógł się zmienić między odczytem a zajęciem (inny zwrot właśnie się zakończył, przyszło powiadomienie
    // o zwrocie) — liczymy jeszcze raz, już pod blokadą. Kwota musi wyjść identyczna.
    const fresh = (await this.db.payment.findUnique({ where: { id: paymentId }, select: { amount: true, status: true } })) as { amount: unknown; status: string } | null;
    const again = planRefund({ amount: num(fresh?.amount), status: fresh?.status ?? '' }, await loadRefunds(refundId), requested);
    if (!again.ok || toGrosze(again.amount) !== toGrosze(plan.amount) || again.sendFull !== plan.sendFull) {
      await this.db.paymentRefund.updateMany({ where: { id: refundId, status: 'PENDING' }, data: { status: 'FAILED', lockKey: null, raw: { cancelled: 'state-changed' } } });
      throw new ConflictException('Stan wpłaty zmienił się w trakcie zlecania zwrotu. Odśwież listę i spróbuj ponownie. Nic nie zostało zwrócone.');
    }

    this.logger.log(`Zwrot Tpay: zlecenie ${refundId} (wpłata ${paymentId}, zgłoszenie ${p.registrationId}, ${plan.amount.toFixed(2)} PLN, ${plan.sendFull ? 'pełny' : 'częściowy'}${testMode ? ', TEST' : ''}) — zleca ${actor.email}`);

    // (3) Jedno wywołanie Tpay. Zwrot pełny = puste ciało; częściowy (także „reszta” po wcześniejszych zwrotach) = kwota.
    let result: TpayRefundResult;
    try {
      result = await this.tpay.refund(attempt.externalId, plan.sendFull ? undefined : plan.amount);
    } catch {
      result = { outcome: 'uncertain', why: 'błąd wewnętrzny w trakcie wywołania', httpStatus: null };
    }

    if (result.outcome === 'rejected') {
      await this.db.paymentRefund.updateMany({
        where: { id: refundId, status: 'PENDING' },
        data: { status: 'FAILED', lockKey: null, raw: { full: plan.sendFull, codes: result.codes, http: result.httpStatus } },
      });
      this.logger.warn(`Zwrot Tpay: zlecenie ${refundId} odrzucone (${result.codes.join(',') || 'bez kodu'})`);
      throw new BadRequestException(tpayRejectionMessage(result.codes, result.httpStatus));
    }

    if (result.outcome === 'uncertain') {
      await this.db.paymentRefund
        .updateMany({ where: { id: refundId, status: 'PENDING' }, data: { status: 'UNCERTAIN', raw: { full: plan.sendFull, why: result.why, http: result.httpStatus } } })
        .catch((e: Error) => this.logger.error(`Zwrot ${refundId}: zapis stanu „do wyjaśnienia” nieudany: ${e.message}`));
      this.logger.error(`Zwrot Tpay: zlecenie ${refundId} — odpowiedź niejednoznaczna (${result.why}). Nie ponawiamy.`);
      await this.alertOrganizer('REFUND_UNCERTAIN', p.registrationId, String(rawOf.title ?? p.externalId ?? ''), plan.amount, testMode);
      return { ok: false, uncertain: true, refundId, amount: plan.amount, ...(await this.paymentPlan.paymentsOf(p.registrationId)) };
    }

    // (4) Sukces → księgowanie w jednej transakcji bazy.
    try {
      await this.book(refundId, paymentId, plan.closes, { tpayStatus: result.status, http: result.httpStatus, full: plan.sendFull }, result.refundId);
    } catch (e) {
      // Tpay przyjął zwrot, a zapis się nie udał: wiersz zostaje PENDING / UNCERTAIN z blokadą — do wyjaśnienia.
      this.logger.error(`Zwrot Tpay: zlecenie ${refundId} PRZYJĘTE przez Tpay, ale zapis w bazie nieudany: ${(e as Error).message}`);
      await this.db.paymentRefund
        .updateMany({ where: { id: refundId, status: 'PENDING' }, data: { status: 'UNCERTAIN', raw: { full: plan.sendFull, why: 'tpay-ok-zapis-nieudany' } } })
        .catch(() => undefined);
      await this.alertOrganizer('REFUND_BOOKING_FAILED', p.registrationId, String(rawOf.title ?? p.externalId ?? ''), plan.amount, testMode);
      throw new HttpException(
        'Tpay PRZYJĄŁ zwrot, ale nie udało się go zapisać w systemie. NIE zlecaj go ponownie — odśwież listę i oznacz zwrot jako wykonany.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    this.logger.log(`Zwrot Tpay: zlecenie ${refundId} wykonane (${plan.amount.toFixed(2)} PLN${plan.closes ? ', wpłata zwrócona w całości' : ''})`);
    const guestMail = await this.afterRefund(p.registrationId, plan.amount, String(rawOf.title ?? p.externalId ?? ''), notifyGuest);
    return { ok: true, uncertain: false, refundId, amount: plan.amount, guestMail, ...(await this.paymentPlan.paymentsOf(p.registrationId)) };
  }

  /**
   * Zaksięgowanie zwrotu przyjętego przez Tpay. Idempotentne: gdy powiadomienie `chargeback` zdążyło
   * już rozstrzygnąć ten wiersz, nic się nie zmienia (wpłata nie pomniejsza się drugi raz).
   */
  private async book(refundId: string, paymentId: string, closes: boolean, raw: Record<string, unknown>, externalId: string | null, extra: Record<string, unknown> = {}) {
    await this.prisma.$transaction(async (txc: unknown) => {
      const tx = txc as Db;
      const done = (await tx.paymentRefund.updateMany({
        where: { id: refundId, status: { in: ['PENDING', 'UNCERTAIN'] } },
        data: { status: 'DONE', lockKey: null, externalId, raw: { ...raw, ...extra } },
      })) as { count: number };
      if (done.count === 0) return;
      if (closes) {
        await tx.payment.updateMany({ where: { id: paymentId, status: 'PAID' }, data: { status: 'REFUNDED' } });
        // Próba płatności → REFUNDED: późniejsze powiadomienie `chargeback` trafi w „już zwrócone” i nic nie zrobi.
        await tx.onlinePayment.updateMany({ where: { paymentId, status: { not: 'REFUNDED' } }, data: { status: 'REFUNDED' } });
      }
    });
  }

  /**
   * `POST /admin/payments/refunds/:refundId/resolve` — admin rozstrzyga zwrot „do wyjaśnienia”
   * po sprawdzeniu w panelu Tpay: `done` (zwrot został wykonany) albo `failed` (nie został).
   * Niczego nie wysyła do Tpay.
   */
  async resolve(refundId: string, dto: { outcome?: unknown; notifyGuest?: unknown }, actor: RefundActor) {
    const outcome = dto?.outcome === 'done' ? 'done' : dto?.outcome === 'failed' ? 'failed' : null;
    if (!outcome) throw new BadRequestException('Podaj wynik: „done” (zwrot wykonany) albo „failed” (zwrot niewykonany).');
    const r = (await this.db.paymentRefund.findUnique({ where: { id: refundId } })) as
      | { id: string; paymentId: string; registrationId: string; amount: unknown; status: string; raw: unknown; createdAt: Date }
      | null;
    if (!r) throw new NotFoundException('Refund not found');
    const stale = r.status === 'PENDING' && Date.now() - r.createdAt.getTime() > REFUND_STALE_MS;
    if (r.status !== 'UNCERTAIN' && !stale) throw new BadRequestException('Ten zwrot nie czeka na wyjaśnienie.');
    const stamp = { resolvedBy: actor.email.slice(0, 190), resolvedAt: new Date().toISOString(), resolved: outcome };
    const prevRaw = (r.raw ?? {}) as Record<string, unknown>;
    const p = (await this.db.payment.findUnique({ where: { id: r.paymentId }, select: { amount: true, status: true, externalId: true, raw: true } })) as
      | { amount: unknown; status: string; externalId: string | null; raw: unknown }
      | null;
    if (outcome === 'failed') {
      await this.db.paymentRefund.updateMany({ where: { id: refundId, status: { in: ['PENDING', 'UNCERTAIN'] } }, data: { status: 'FAILED', lockKey: null, raw: { ...prevRaw, ...stamp } } });
      this.logger.log(`Zwrot ${refundId}: oznaczony jako NIEWYKONANY przez ${actor.email}`);
      return { ok: true, ...(await this.paymentPlan.paymentsOf(r.registrationId)) };
    }
    const others = ((await this.db.paymentRefund.findMany({ where: { paymentId: r.paymentId, id: { not: refundId }, status: 'DONE' }, select: { amount: true } })) as Array<{ amount: unknown }>)
      .reduce((s, x) => s + toGrosze(num(x.amount)), 0);
    const left = toGrosze(num(p?.amount)) - others;
    if (p?.status === 'PAID' && toGrosze(num(r.amount)) > left) throw new BadRequestException('Kwota tego zwrotu przekracza to, co zostało z wpłaty — sprawdź zwroty w panelu Tpay.');
    await this.book(refundId, r.paymentId, toGrosze(num(r.amount)) === left, prevRaw, null, stamp);
    this.logger.log(`Zwrot ${refundId}: potwierdzony jako WYKONANY przez ${actor.email}`);
    const title = String((p?.raw as { title?: unknown } | null)?.title ?? p?.externalId ?? '');
    const notify = dto?.notifyGuest === undefined ? prevRaw.notifyGuest !== false : dto.notifyGuest !== false && dto.notifyGuest !== 'false';
    const guestMail = await this.afterRefund(r.registrationId, num(r.amount), title, notify);
    return { ok: true, guestMail, ...(await this.paymentPlan.paymentsOf(r.registrationId)) };
  }

  private async alertOrganizer(reason: string, registrationId: string, transactionTitle: string, amount: number, testMode: boolean) {
    const reg = (await this.db.registration
      .findUnique({ where: { id: registrationId }, select: { contact: true, instance: { select: { title: true } } } })
      .catch(() => null)) as { contact: unknown; instance: { title: unknown } | null } | null;
    const c = (reg?.contact ?? {}) as { firstName?: string; lastName?: string };
    await this.mail
      .sendOnlinePaymentAlert({
        reason,
        registrationId,
        eventTitle: titleFor(reg?.instance?.title, 'pl') || undefined,
        guestName: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || undefined,
        transactionTitle: transactionTitle || undefined,
        refundAmount: amount,
        currency: 'PLN',
        testMode,
      })
      .catch((e: Error) => this.logger.error(`Mail do organizatora (${reason}): ${e.message}`));
  }

  /**
   * Po zaksięgowanym zwrocie: `syncStatus` (nigdy nie cofa statusu zgłoszenia — decyzja z planu) i mail
   * „Zwróciliśmy wpłatę” do gościa. Błąd maila nie cofa zwrotu. Zwraca: 'sent' | 'skipped' | 'failed'.
   */
  private async afterRefund(registrationId: string, amount: number, transactionTitle: string, notifyGuest: boolean): Promise<'sent' | 'skipped' | 'failed'> {
    try {
      await this.paymentPlan.syncStatus(registrationId);
    } catch (e) {
      this.logger.error(`syncStatus po zwrocie (${registrationId}): ${(e as Error).message}`);
    }
    if (!notifyGuest) return 'skipped';
    try {
      const reg = (await this.db.registration.findUnique({
        where: { id: registrationId },
        include: { instance: { select: { title: true, pricingConfig: true } } },
      })) as
        | { id: string; locale: string; contact: unknown; totalPrice: unknown; currency: string; createdAt: Date; roomsJson: unknown; editToken: string; instance: { title: unknown; pricingConfig?: unknown } | null }
        | null;
      const email = String(((reg?.contact ?? {}) as { email?: string }).email ?? '').trim();
      if (!reg || !email) return 'skipped';
      const paid = (await this.paymentPlan.paidMap({ id: registrationId })).get(registrationId)?.paid ?? 0;
      const s = summarize((reg.instance?.pricingConfig ?? null) as PricingConfig | null, { totalPrice: reg.totalPrice, createdAt: reg.createdAt, roomIds: roomIdsOf(reg.roomsJson) }, paid);
      const sent = await this.mail.sendPaymentRefunded({
        to: email,
        locale: reg.locale,
        registrationId,
        eventTitle: titleFor(reg.instance?.title, mailLang(reg.locale)) || undefined,
        amount,
        paid: s.paid,
        total: s.total,
        remaining: s.remaining,
        currency: reg.currency || 'PLN',
        transactionTitle: transactionTitle || undefined,
        manageLink: manageRegistrationLink(reg.editToken),
      });
      return sent === 'FAILED' ? 'failed' : 'sent';
    } catch (e) {
      this.logger.error(`Mail „Zwróciliśmy wpłatę” (${registrationId}): ${(e as Error).message}`);
      return 'failed';
    }
  }
}
