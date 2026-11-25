import {
  BadGatewayException, BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentPlanService, PaymentSummary, summarize } from '../registrations/payment-plan.service';
import { manageRegistrationLink, mailLang, titleFor } from '../registrations/registrations.service';
import {
  contactCountry, onlinePayAmount, onlinePayBounds, onlineProviderFor, warsawDate,
  OnlinePayBounds, OnlinePayMode, PricingConfig,
} from '../shared';
import { configuredOnlineProviders, tpayConfig } from './tpay-config';
import { TpayError, TpayService } from './tpay.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Dlaczego zgłoszenie nie może zapłacić online (null = może). */
export type OnlineUnavailable =
  | 'NOT_CONFIGURED' // tryb mock albo brak kluczy
  | 'EVENT_DISABLED' // event nie ma metody ONLINE
  | 'CURRENCY' // Tpay tylko w PLN
  | 'NOT_ELIGIBLE' // reguła kraj / język nie daje Tpay
  | 'CANCELLED'
  | 'NOTHING_TO_PAY';

/** Świeża, nieopłacona próba na tę samą kwotę jest używana ponownie (ten sam link Tpay). */
const REUSE_WINDOW_MS = 15 * 60_000;
/** Próby starsze niż doba bez wpłaty → EXPIRED. */
const EXPIRE_AFTER_MS = 24 * 60 * 60_000;
/** Limit nowych prób na zgłoszenie na dobę. */
const MAX_ATTEMPTS_PER_DAY = 12;

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const roomIdsOf = (roomsJson: unknown): string[] =>
  (Array.isArray(roomsJson) ? roomsJson : []).map((r) => String((r as { roomId?: unknown })?.roomId ?? '')).filter(Boolean);

interface RegRow {
  id: string;
  status: string;
  locale: string;
  contact: unknown;
  totalPrice: unknown;
  currency: string;
  createdAt: Date;
  roomsJson: unknown;
  editToken: string;
  instance: { title: unknown; paymentMethods?: string[]; pricingConfig?: unknown } | null;
}

/**
 * Płatności online gościa: stan rozliczenia, utworzenie płatności (kwotę ZAWSZE liczy serwer)
 * i księgowanie wpłat z podpisanych powiadomień operatora.
 */
@Injectable()
export class OnlinePaymentsService {
  private readonly logger = new Logger('OnlinePayments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tpay: TpayService,
    private readonly paymentPlan: PaymentPlanService,
    private readonly mail: NotificationsService,
  ) {}

  private get db(): Db {
    return this.prisma as Db;
  }

  /** `GET /payments/config` — publiczne, bez sekretów. W trybie `mock` pusta lista. */
  publicConfig(): { providers: string[] } {
    return { providers: configuredOnlineProviders() };
  }

  /** Kafel „Płatności online” w Ustawieniach panelu — wyłącznie tak / nie, żadnych wartości kluczy. */
  adminStatus() {
    const cfg = tpayConfig();
    return {
      mode: cfg.mode,
      env: cfg.env,
      ready: cfg.ready,
      missing: cfg.missing,
      keys: {
        clientId: !!cfg.clientId,
        clientSecret: !!cfg.clientSecret,
        merchantId: !!cfg.merchantId,
        securityCode: !!cfg.securityCode,
        apiPublicUrl: !!cfg.apiPublicUrl,
      },
      // Flaga TPAY_ALLOW_TEST_MODE i ostrzeżenie: na produkcji testowe wpłaty potwierdzają zgłoszenia bez pieniędzy.
      allowTestMode: cfg.allowTestMode,
      testModeOnProduction: cfg.mode === 'tpay' && cfg.env === 'production' && cfg.allowTestMode,
      rootCa: this.tpay.rootCaSource(),
      notificationUrl: cfg.notificationUrl || null,
      providers: configuredOnlineProviders(),
    };
  }

  private async loadByToken(token: string): Promise<RegRow> {
    if (!token || token.length > 100) throw new NotFoundException('Registration not found');
    const reg = (await this.db.registration.findUnique({
      where: { editToken: token },
      include: { instance: { select: { title: true, paymentMethods: true, pricingConfig: true } } },
    })) as RegRow | null;
    if (!reg) throw new NotFoundException('Registration not found');
    return reg;
  }

  private async summaryOf(reg: RegRow): Promise<PaymentSummary> {
    const paid = (await this.paymentPlan.paidMap({ id: reg.id })).get(reg.id)?.paid ?? 0;
    const cfg = (reg.instance?.pricingConfig ?? null) as PricingConfig | null;
    return summarize(cfg, { totalPrice: reg.totalPrice, createdAt: reg.createdAt, roomIds: roomIdsOf(reg.roomsJson) }, paid);
  }

  /**
   * Czy to zgłoszenie może zapłacić online. Jedyna reguła „kto” to `onlineProviderFor`
   * (kraj zamieszkania → dopiero potem język zgłoszenia) — ta sama co we frontendzie i w mailach.
   */
  private unavailable(reg: RegRow, bounds: OnlinePayBounds): OnlineUnavailable | null {
    const providers = configuredOnlineProviders();
    if (providers.length === 0) return 'NOT_CONFIGURED';
    if (!(reg.instance?.paymentMethods ?? []).includes('ONLINE')) return 'EVENT_DISABLED';
    if (String(reg.currency || 'PLN').toUpperCase() !== 'PLN') return 'CURRENCY';
    if (onlineProviderFor(contactCountry(reg.contact), reg.locale, providers) !== 'tpay') return 'NOT_ELIGIBLE';
    if (reg.status === 'CANCELLED') return 'CANCELLED';
    if (!(bounds.max > 0)) return 'NOTHING_TO_PAY';
    return null;
  }

  /** Porzucone próby (bez wpłaty od ponad doby) → EXPIRED. Gość po prostu płaci ponownie. */
  private async expireStale(registrationId: string) {
    await this.db.onlinePayment.updateMany({
      where: { registrationId, status: { in: ['CREATED', 'PENDING'] }, createdAt: { lt: new Date(Date.now() - EXPIRE_AFTER_MS) } },
      data: { status: 'EXPIRED' },
    });
  }

  /** `GET /registrations/manage/:token/payments` — rozliczenie, granice kwot, wpłaty, ostatnia próba. */
  async overview(token: string) {
    const reg = await this.loadByToken(token);
    await this.expireStale(reg.id).catch(() => undefined);
    const summary = await this.summaryOf(reg);
    const bounds = onlinePayBounds(summary);
    const reason = this.unavailable(reg, bounds);
    const rows = (await this.db.payment.findMany({
      where: { registrationId: reg.id, status: { in: ['PAID', 'REFUNDED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amount: true, currency: true, status: true, provider: true, method: true, raw: true, createdAt: true },
    })) as Array<{ id: string; amount: unknown; currency: string; status: string; provider: string; method: string; raw: unknown; createdAt: Date }>;
    const last = (await this.db.onlinePayment.findFirst({
      where: { registrationId: reg.id },
      orderBy: { createdAt: 'desc' },
      select: { status: true, amount: true, paidAmount: true, createdAt: true, paidAt: true },
    })) as { status: string; amount: unknown; paidAmount: unknown; createdAt: Date; paidAt: Date | null } | null;
    return {
      registrationId: reg.id,
      status: reg.status,
      currency: reg.currency || 'PLN',
      summary,
      bounds,
      // Gość widzi tylko: kwotę, dzień, sposób i stan — bez notatek organizatora i danych nadawcy przelewu.
      payments: rows.map((p) => ({
        id: p.id,
        amount: num(p.amount),
        currency: p.currency,
        status: p.status,
        source: p.provider === 'tpay' ? 'online' : p.method === 'CASH' ? 'cash' : p.method === 'ONLINE' ? 'online' : 'transfer',
        paidAt: String((p.raw as { paidAt?: unknown } | null)?.paidAt ?? '') || p.createdAt.toISOString().slice(0, 10),
      })),
      lastAttempt: last
        ? { status: last.status, amount: num(last.amount), paidAmount: last.paidAmount == null ? null : num(last.paidAmount), createdAt: last.createdAt.toISOString() }
        : null,
      online: { available: reason === null, provider: reason === null ? 'tpay' : null, reason },
    };
  }

  /**
   * `POST /registrations/manage/:token/pay` — tworzy płatność Tpay i zwraca adres przekierowania.
   * Kwota z żądania jest brana pod uwagę wyłącznie w trybie `custom` i zawsze sprawdzana
   * względem granic policzonych na serwerze (od wymaganej teraz do pozostałej).
   */
  async pay(token: string, dto: { mode?: unknown; amount?: unknown }): Promise<{ redirectUrl: string; amount: number; currency: string }> {
    const reg = await this.loadByToken(token);
    const mode = String(dto?.mode ?? 'due') as OnlinePayMode;
    if (!['due', 'remaining', 'custom'].includes(mode)) throw new BadRequestException('Nieznany tryb płatności.');
    const summary = await this.summaryOf(reg);
    const bounds = onlinePayBounds(summary);
    const reason = this.unavailable(reg, bounds);
    if (reason) {
      const msg: Record<OnlineUnavailable, string> = {
        NOT_CONFIGURED: 'Płatność online nie jest teraz dostępna.',
        EVENT_DISABLED: 'To wydarzenie nie przyjmuje płatności online.',
        CURRENCY: 'Płatność online jest dostępna tylko dla kwot w złotych.',
        NOT_ELIGIBLE: 'Płatność online (Tpay) jest dostępna tylko dla zgłoszeń z Polski. Prosimy o przelew na konto.',
        CANCELLED: 'Zgłoszenie jest anulowane — skontaktuj się z organizatorem.',
        NOTHING_TO_PAY: 'To zgłoszenie jest już opłacone.',
      };
      if (reason === 'NOT_CONFIGURED') throw new HttpException(msg[reason], HttpStatus.SERVICE_UNAVAILABLE);
      if (reason === 'NOTHING_TO_PAY') throw new BadRequestException(msg[reason]);
      throw new ForbiddenException(msg[reason]);
    }
    const picked = onlinePayAmount(mode, dto?.amount, bounds);
    if (!picked.ok) {
      const msg = {
        NOTHING_TO_PAY: 'To zgłoszenie jest już opłacone.',
        INVALID: 'Podaj poprawną kwotę.',
        BELOW_MIN: `Kwota nie może być mniejsza niż ${bounds.min.toFixed(2)} zł.`,
        ABOVE_MAX: `Kwota nie może być większa niż ${bounds.max.toFixed(2)} zł (tyle pozostało do zapłaty).`,
      }[picked.reason];
      throw new BadRequestException(msg);
    }
    const amount = picked.amount;
    const contact = (reg.contact ?? {}) as { firstName?: string; lastName?: string; email?: string };
    const email = String(contact.email ?? '').trim();
    if (!email) throw new BadRequestException('Zgłoszenie nie ma adresu e-mail — skontaktuj się z organizatorem.');

    await this.expireStale(reg.id).catch(() => undefined);

    // Świeża próba na tę samą kwotę → ten sam link (odświeżenie strony, podwójne kliknięcie).
    const fresh = (await this.db.onlinePayment.findFirst({
      where: { registrationId: reg.id, provider: 'tpay', status: 'PENDING', amount, paymentUrl: { not: null }, createdAt: { gt: new Date(Date.now() - REUSE_WINDOW_MS) } },
      orderBy: { createdAt: 'desc' },
      select: { paymentUrl: true },
    })) as { paymentUrl: string | null } | null;
    if (fresh?.paymentUrl) return { redirectUrl: fresh.paymentUrl, amount, currency: 'PLN' };

    const recent = (await this.db.onlinePayment.count({
      where: { registrationId: reg.id, createdAt: { gt: new Date(Date.now() - EXPIRE_AFTER_MS) } },
    })) as number;
    if (recent >= MAX_ATTEMPTS_PER_DAY) {
      throw new HttpException('Zbyt wiele prób płatności. Spróbuj ponownie jutro albo skontaktuj się z organizatorem.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const crc = `icpe-${randomUUID().replace(/-/g, '')}`;
    const attempt = (await this.db.onlinePayment.create({
      data: { registrationId: reg.id, provider: 'tpay', crc, amount, currency: 'PLN', purpose: mode, status: 'CREATED' },
      select: { id: true },
    })) as { id: string };

    const back = manageRegistrationLink(reg.editToken);
    const eventTitle = titleFor(reg.instance?.title, 'pl') || 'ICPE Mission';
    try {
      const tx = await this.tpay.createTransaction({
        amount,
        description: `${eventTitle}`.slice(0, 80) + ` — zgłoszenie ${reg.id}`,
        crc,
        payerEmail: email,
        payerName: `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim(),
        successUrl: `${back}?pay=return`,
        errorUrl: `${back}?pay=error`,
      });
      await this.db.onlinePayment.update({
        where: { id: attempt.id },
        data: { externalId: tx.transactionId, title: tx.title || null, paymentUrl: tx.paymentUrl, status: 'PENDING' },
      });
      return { redirectUrl: tx.paymentUrl, amount, currency: 'PLN' };
    } catch (e) {
      await this.db.onlinePayment.update({ where: { id: attempt.id }, data: { status: 'FAILED' } }).catch(() => undefined);
      // W logu tylko nasz identyfikator próby i ogólny powód (bez danych płatnika i odpowiedzi operatora).
      this.logger.error(`Utworzenie płatności Tpay nieudane (próba ${attempt.id}): ${e instanceof TpayError ? e.message : 'błąd wewnętrzny'}`);
      throw new BadGatewayException('Nie udało się rozpocząć płatności online. Spróbuj ponownie za chwilę.');
    }
  }

  /**
   * Powiadomienie Tpay. Zwraca `true`, gdy mamy odpowiedzieć `TRUE` (zaksięgowane, już zaksięgowane
   * albo świadomie pominięte); `false` = weryfikacja nie przeszła → HTTP 400 `FALSE`, bez zmian w bazie.
   * Błąd bazy rzuca wyjątek (HTTP 500) — Tpay ponowi powiadomienie.
   */
  async handleTpayNotification(rawBody: Buffer | undefined, jws: string | undefined): Promise<boolean> {
    const v = await this.tpay.verifyNotification(rawBody, jws);
    if (!v.ok) {
      // Tylko kod powodu — bez ciała, podpisu i pól powiadomienia.
      this.logger.warn(`Powiadomienie Tpay odrzucone: ${v.reason}`);
      return false;
    }
    const f = v.fields;
    const crc = String(f.tr_crc ?? '');
    const trId = String(f.tr_id ?? '').slice(0, 190);
    const status = String(f.tr_status ?? '').trim().toLowerCase();
    const attempt = crc
      ? ((await this.db.onlinePayment.findUnique({ where: { crc } })) as
          | { id: string; registrationId: string; amount: unknown; status: string; paymentId: string | null }
          | null)
      : null;

    if (!attempt) {
      this.logger.warn(`Powiadomienie Tpay o nieznanej transakcji (${trId || 'bez tytułu'}) — nie księgujemy.`);
      await this.alert({ reason: 'UNKNOWN_CRC', transactionTitle: trId, paidAmount: num(f.tr_paid), currency: f.tr_currency || 'PLN', testMode: v.testMode });
      return true;
    }

    if (status === 'chargeback') return this.bookRefund(attempt, trId, v.testMode);

    if (status !== 'true' && status !== 'paid') {
      this.logger.warn(`Powiadomienie Tpay ze statusem innym niż opłacone (próba ${attempt.id}) — pomijamy.`);
      return true;
    }

    const currency = String(f.tr_currency ?? '').trim().toUpperCase();
    if (currency && currency !== 'PLN' && currency !== '985') {
      await this.alert({ reason: 'CURRENCY', registrationId: attempt.registrationId, transactionTitle: trId, paidAmount: num(f.tr_paid), currency, expectedAmount: num(attempt.amount), testMode: v.testMode });
      return true;
    }

    const paid = round2(num(f.tr_paid ?? f.tr_amount));
    if (!(paid > 0)) {
      await this.alert({ reason: 'BAD_AMOUNT', registrationId: attempt.registrationId, transactionTitle: trId, expectedAmount: num(attempt.amount), testMode: v.testMode });
      return true;
    }
    const expected = round2(num(attempt.amount));
    const mismatch = Math.abs(paid - expected) > 0.005;

    // Księgowanie idempotentne, w jednej transakcji bazy: najpierw „zajęcie” próby
    // (wynik 0 = już zaksięgowana albo zwrócona → nic nie robimy), potem wpłata.
    const booked = (await this.prisma.$transaction(async (txc: unknown) => {
      const tx = txc as Db;
      const claim = (await tx.onlinePayment.updateMany({
        where: { id: attempt.id, status: { notIn: ['PAID', 'REFUNDED'] }, paymentId: null },
        data: {
          status: 'PAID',
          paidAmount: paid,
          paidAt: new Date(),
          testMode: v.testMode,
          ...(trId ? { title: trId } : {}),
          // bez e-maila płatnika i bez md5sum
          raw: { tr_id: trId, tr_date: f.tr_date ?? null, tr_amount: f.tr_amount ?? null, tr_paid: f.tr_paid ?? null, tr_status: f.tr_status ?? null, tr_error: f.tr_error ?? null, test_mode: f.test_mode ?? null },
        },
      })) as { count: number };
      if (claim.count === 0) return null;
      const payment = (await tx.payment.create({
        data: {
          registrationId: attempt.registrationId,
          provider: 'tpay',
          method: 'ONLINE',
          amount: paid,
          currency: 'PLN',
          status: 'PAID',
          externalId: trId || null,
          raw: {
            paidAt: warsawDate(),
            title: trId || null,
            onlinePaymentId: attempt.id,
            expected,
            ...(mismatch ? { mismatch: true } : {}),
            ...(v.testMode ? { testMode: true } : {}),
            ...(f.tr_date ? { trDate: f.tr_date } : {}),
          },
        },
        select: { id: true },
      })) as { id: string };
      await tx.onlinePayment.update({ where: { id: attempt.id }, data: { paymentId: payment.id } });
      return payment.id;
    })) as string | null;

    if (!booked) return true; // ponowione powiadomienie — nadal jedna wpłata

    this.logger.log(`Wpłata Tpay zaksięgowana (próba ${attempt.id}, zgłoszenie ${attempt.registrationId})${v.testMode ? ' — TRANSAKCJA TESTOWA' : ''}${mismatch ? ' — kwota różna od oczekiwanej' : ''}`);
    // Wszystko poniżej jest „po zaksięgowaniu”: błąd maila czy statusu nie może cofnąć odpowiedzi TRUE.
    try {
      await this.paymentPlan.syncStatus(attempt.registrationId);
    } catch (e) {
      this.logger.error(`syncStatus po wpłacie Tpay (${attempt.registrationId}): ${(e as Error).message}`);
    }
    await this.afterBooked(attempt.registrationId, { paid, expected, mismatch, trId, testMode: v.testMode }).catch((e: Error) =>
      this.logger.error(`Powiadomienia po wpłacie Tpay (${attempt.registrationId}): ${e.message}`),
    );
    return true;
  }

  /** Zwrot pełny (`tr_status=chargeback`): wpłata → REFUNDED, mail do organizatora, status zgłoszenia bez zmian. */
  private async bookRefund(attempt: { id: string; registrationId: string; amount: unknown; paymentId: string | null }, trId: string, testMode: boolean): Promise<boolean> {
    const changed = (await this.prisma.$transaction(async (txc: unknown) => {
      const tx = txc as Db;
      const claim = (await tx.onlinePayment.updateMany({ where: { id: attempt.id, status: { not: 'REFUNDED' } }, data: { status: 'REFUNDED' } })) as { count: number };
      if (claim.count === 0) return null;
      if (!attempt.paymentId) return 'UNMATCHED';
      const upd = (await tx.payment.updateMany({ where: { id: attempt.paymentId, status: 'PAID' }, data: { status: 'REFUNDED' } })) as { count: number };
      return upd.count > 0 ? 'REFUNDED' : 'UNMATCHED';
    })) as 'REFUNDED' | 'UNMATCHED' | null;
    if (!changed) return true; // ponowione powiadomienie o zwrocie
    this.logger.log(`Zwrot Tpay odnotowany (próba ${attempt.id}, zgłoszenie ${attempt.registrationId})`);
    const ctx = await this.alertContext(attempt.registrationId);
    await this.alert({
      reason: changed === 'REFUNDED' ? 'REFUND' : 'REFUND_UNMATCHED',
      registrationId: attempt.registrationId,
      transactionTitle: trId,
      expectedAmount: num(attempt.amount),
      currency: 'PLN',
      testMode,
      ...ctx,
    });
    return true;
  }

  private async alertContext(registrationId: string): Promise<{ eventTitle?: string; guestName?: string }> {
    const reg = (await this.db.registration
      .findUnique({ where: { id: registrationId }, select: { contact: true, instance: { select: { title: true } } } })
      .catch(() => null)) as { contact: unknown; instance: { title: unknown } | null } | null;
    if (!reg) return {};
    const c = (reg.contact ?? {}) as { firstName?: string; lastName?: string };
    return { eventTitle: titleFor(reg.instance?.title, 'pl') || undefined, guestName: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || undefined };
  }

  private async alert(opts: Parameters<NotificationsService['sendOnlinePaymentAlert']>[0]): Promise<void> {
    await this.mail.sendOnlinePaymentAlert(opts).catch((e: Error) => this.logger.error(`Mail do organizatora (${opts.reason}): ${e.message}`));
  }

  /** Mail „Otrzymaliśmy wpłatę” do gościa + powiadomienia organizatora o przypadkach brzegowych. */
  private async afterBooked(registrationId: string, p: { paid: number; expected: number; mismatch: boolean; trId: string; testMode: boolean }) {
    const reg = (await this.db.registration.findUnique({
      where: { id: registrationId },
      include: { instance: { select: { title: true, paymentMethods: true, pricingConfig: true } } },
    })) as RegRow | null;
    if (!reg) return;
    const summary = await this.summaryOf(reg);
    const c = (reg.contact ?? {}) as { firstName?: string; lastName?: string; email?: string };
    const base = {
      registrationId,
      eventTitle: titleFor(reg.instance?.title, 'pl') || undefined,
      guestName: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || undefined,
      transactionTitle: p.trId,
      paidAmount: p.paid,
      expectedAmount: p.expected,
      currency: 'PLN',
      testMode: p.testMode,
    };
    if (p.mismatch) await this.alert({ reason: 'AMOUNT_MISMATCH', ...base });
    if (reg.status === 'CANCELLED') await this.alert({ reason: 'CANCELLED_REGISTRATION', ...base });
    else if (summary.paid > summary.total + 0.005) await this.alert({ reason: 'OVERPAID', ...base });
    const email = String(c.email ?? '').trim();
    if (email) {
      await this.mail.sendPaymentReceived({
        to: email,
        locale: reg.locale,
        registrationId,
        eventTitle: titleFor(reg.instance?.title, mailLang(reg.locale)) || undefined,
        amount: p.paid,
        paid: summary.paid,
        total: summary.total,
        remaining: summary.remaining,
        currency: reg.currency || 'PLN',
        nextDue: summary.nextDue ? { amount: summary.nextDue.amount, dueDate: summary.nextDue.dueDate } : null,
        transactionTitle: p.trId || undefined,
        manageLink: manageRegistrationLink(reg.editToken),
      });
    }
  }
}
