import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CourseAccessService } from '../courses/course-access.service';
import { PaymentPlanService, summarize } from '../registrations/payment-plan.service';
import { manageRegistrationLink } from '../registrations/registrations.service';
import { instanceRoomAvailability } from '../registrations/room-stock';
import {
  isDeletableTestPayment, permanentDeleteBlocker, restoredStatus, roomLabel, roomStockShortages, statusAfterPaymentRemoval,
  PricingConfig,
} from '../shared';
import { mapRegStatus } from './personal-os.mapper';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Zalogowany pełny admin (JWT realm `admin`) — kto wykonał operację (do logu serwera). */
export interface AdminActor {
  id: string | null;
  email: string;
}

/** Słowo, które admin musi wpisać, żeby trwale usunąć zgłoszenie. */
export const PERMANENT_DELETE_WORD = 'USUŃ';

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const roomIdsOf = (roomsJson: unknown): string[] =>
  (Array.isArray(roomsJson) ? roomsJson : []).map((r) => String((r as { roomId?: unknown })?.roomId ?? '')).filter(Boolean);

interface PayRow { id: string; provider: string; status: string; amount: unknown; raw: unknown }

/**
 * Operacje panelu na pojedynczym zgłoszeniu, których nie ma w kontrakcie Personal OS:
 * szczegóły dla admina (link strony gościa), przywracanie anulowanego zgłoszenia,
 * trwałe usuwanie danych TESTOWYCH (wpłata testowa Tpay, anulowane zgłoszenie bez prawdziwych wpłat).
 */
@Injectable()
export class RegistrationAdminService {
  private readonly logger = new Logger('RegistrationAdmin');

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentPlan: PaymentPlanService,
    private readonly courseAccess: CourseAccessService,
  ) {}

  private get db(): Db {
    return this.prisma as Db;
  }

  /** Wpłaty zgłoszenia z informacją, czy są testowe (znacznik wpłaty + próba płatności `OnlinePayment`). */
  private async paymentFacts(registrationId: string) {
    const payments = (await this.db.payment.findMany({
      where: { registrationId },
      select: { id: true, provider: true, status: true, amount: true, raw: true },
    })) as PayRow[];
    const attempts = payments.length
      ? ((await this.db.onlinePayment.findMany({
          where: { paymentId: { in: payments.map((p) => p.id) } },
          select: { id: true, paymentId: true, testMode: true },
        })) as Array<{ id: string; paymentId: string | null; testMode: boolean }>)
      : [];
    return payments.map((p) => {
      const attempt = attempts.find((a) => a.paymentId === p.id);
      const rawTestMode = ((p.raw ?? {}) as { testMode?: unknown }).testMode;
      return {
        id: p.id,
        provider: p.provider,
        status: p.status,
        amount: num(p.amount),
        rawTestMode,
        attemptTestMode: attempt ? attempt.testMode : undefined,
        attemptId: attempt?.id ?? null,
        test: isDeletableTestPayment({ provider: p.provider, rawTestMode, attemptTestMode: attempt ? attempt.testMode : undefined }),
      };
    });
  }

  /**
   * `GET /admin/registrations/:id/detail` — dane tylko dla zalogowanego admina:
   * token i adres strony gościa (`/z/<token>`), suma wpłat, czy zgłoszenie można przywrócić / usunąć trwale.
   * Token NIE trafia do list zgłoszeń, do recepcji ani do odpowiedzi kontraktu Personal OS.
   */
  async detail(id: string) {
    const reg = (await this.db.registration.findUnique({
      where: { id },
      select: { id: true, status: true, editToken: true, statusBeforeCancel: true, totalPrice: true, currency: true },
    })) as { id: string; status: string; editToken: string; statusBeforeCancel: string | null; totalPrice: unknown; currency: string } | null;
    if (!reg) throw new NotFoundException('Registration not found');
    const facts = await this.paymentFacts(id);
    const paid = (await this.paymentPlan.paidMap({ id })).get(id)?.paid ?? 0;
    const blocker = permanentDeleteBlocker(reg, facts);
    return {
      id: reg.id,
      /** status wewnętrzny (PENDING_PAYMENT / AWAITING_TRANSFER / CONFIRMED / WAITLIST / CANCELLED / DRAFT) */
      internalStatus: reg.status,
      status: mapRegStatus(reg.status),
      manageToken: reg.editToken,
      manageUrl: manageRegistrationLink(reg.editToken),
      currency: reg.currency || 'PLN',
      totalPrice: num(reg.totalPrice),
      /** suma zaksięgowanych wpłat po zwrotach */
      paidAmount: paid,
      payments: {
        count: facts.length,
        testCount: facts.filter((p) => p.test).length,
        realCount: facts.filter((p) => !p.test).length,
      },
      canRestore: reg.status === 'CANCELLED',
      canDeletePermanently: blocker === null,
      /** NOT_CANCELLED | REAL_PAYMENTS | null */
      deleteBlocker: blocker,
    };
  }

  /**
   * `POST /admin/registrations/:id/restore` — przywraca anulowane zgłoszenie.
   * Status: sprzed anulowania, jeśli był „lista rezerwowa” / „potwierdzone”; inaczej z wpłat
   * (ta sama reguła co `syncStatus`: zadatek przy harmonogramie, całość bez niego).
   * Limity: gdy brakuje miejsc albo pokoi, bez `force` nic się nie zmienia — odpowiedź niesie ostrzeżenia
   * (`needsConfirm`); z `force: true` przywraca mimo to (admin i tak może świadomie przekroczyć limit
   * w edycji zgłoszenia, a serwer nie blokuje zapisu limitem osób).
   * Bez maila do gościa.
   */
  async restore(id: string, force: boolean, actor: string) {
    const reg = (await this.db.registration.findUnique({
      where: { id },
      include: { instance: { select: { id: true, capacity: true, pricingConfig: true } }, _count: { select: { participants: true } } },
    })) as
      | {
          id: string; instanceId: string; status: string; statusBeforeCancel: string | null; totalPrice: unknown; createdAt: Date;
          roomsJson: unknown; roomsReserved?: boolean | null; paymentMethod: string | null;
          instance: { id: string; capacity: number | null; pricingConfig: unknown } | null; _count: { participants: number };
        }
      | null;
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.status !== 'CANCELLED') throw new BadRequestException('To zgłoszenie nie jest anulowane.');

    // Zgłoszenie z zaproszenia, które cofnięto / odrzucono na liście gości — przywraca się tam, nie tutaj.
    const inv = (await this.db.invitation.findFirst({
      where: { registrationId: id },
      select: { id: true, confirmedAt: true },
    })) as { id: string; confirmedAt: Date | null } | null;
    if (inv && !inv.confirmedAt) {
      throw new BadRequestException('To zgłoszenie pochodzi z zaproszenia, które nie jest potwierdzone. Potwierdź gościa na liście zaproszonych w edycji eventu — zgłoszenie wróci samo.');
    }

    const cfg = (reg.instance?.pricingConfig ?? null) as PricingConfig | null;
    const paid = (await this.paymentPlan.paidMap({ id })).get(id)?.paid ?? 0;
    const s = summarize(cfg, { totalPrice: reg.totalPrice, createdAt: reg.createdAt, roomIds: roomIdsOf(reg.roomsJson) }, paid);
    const next = restoredStatus(reg.statusBeforeCancel, {
      total: s.total, hasPlan: s.hasPlan, depositPaid: s.depositPaid, fullyPaid: s.fullyPaid, paymentMethod: reg.paymentMethod,
    });

    // Limity — lista rezerwowa nie zajmuje miejsc ani pokoi w liczniku miejsc.
    const warnings: string[] = [];
    if (next !== 'WAITLIST') {
      const capacity = reg.instance?.capacity ?? 0;
      if (capacity > 0) {
        const others = (await this.db.registration.findMany({
          where: { instanceId: reg.instanceId, status: { notIn: ['CANCELLED', 'WAITLIST'] } },
          select: { _count: { select: { participants: true } } },
        })) as Array<{ _count: { participants: number } }>;
        const taken = others.reduce((sum, r) => sum + Math.max(1, r._count.participants), 0);
        const own = Math.max(1, reg._count.participants);
        if (taken + own > capacity) {
          warnings.push(`Limit miejsc: zajęte ${taken} z ${capacity}, a to zgłoszenie ma ${own} os. — po przywróceniu limit będzie przekroczony o ${taken + own - capacity}.`);
        }
      }
      const rooms = (Array.isArray(reg.roomsJson) ? reg.roomsJson : []) as Array<{ roomId: string; participantIndexes?: unknown }>;
      if (rooms.length && !reg.roomsReserved) {
        const available = await instanceRoomAvailability(this.prisma, reg.instanceId, cfg);
        for (const short of roomStockShortages(cfg, rooms, available)) {
          const name = roomLabel(cfg?.rooms.find((r) => r.id === short.roomId)?.name ?? short.roomId);
          warnings.push(`Pokoje „${name}”: wolnych ${short.available}, a zgłoszenie zajmuje ${short.requested} — po przywróceniu limit tego typu pokoju będzie przekroczony.`);
        }
      }
    }
    if (warnings.length && !force) {
      return { ok: false as const, needsConfirm: true as const, warnings, internalStatus: reg.status, status: mapRegStatus(reg.status), nextInternalStatus: next };
    }

    const upd = (await this.db.registration.updateMany({
      where: { id, status: 'CANCELLED' },
      data: { status: next, statusBeforeCancel: null },
    })) as { count: number };
    if (upd.count !== 1) throw new ConflictException('Stan zgłoszenia zmienił się w trakcie — odśwież listę.');
    this.courseAccess.syncRegistrationSafe(id);
    this.logger.log(`Przywrócono zgłoszenie ${id} → ${next}${warnings.length ? ' (mimo przekroczonego limitu)' : ''} — ${actor}`);
    return { ok: true as const, needsConfirm: false as const, warnings, internalStatus: next, status: mapRegStatus(next) };
  }

  /** Status po zmianie wpłat — w odróżnieniu od `syncStatus` potrafi też cofnąć potwierdzenie (tylko po usunięciu wpłaty testowej). */
  private async recomputeStatus(registrationId: string): Promise<string | null> {
    const reg = (await this.db.registration.findUnique({
      where: { id: registrationId },
      include: { instance: { select: { pricingConfig: true } } },
    })) as { id: string; status: string; totalPrice: unknown; createdAt: Date; roomsJson: unknown; paymentMethod: string | null; instance: { pricingConfig: unknown } | null } | null;
    if (!reg) return null;
    const paid = (await this.paymentPlan.paidMap({ id: registrationId })).get(registrationId)?.paid ?? 0;
    const s = summarize((reg.instance?.pricingConfig ?? null) as PricingConfig | null, { totalPrice: reg.totalPrice, createdAt: reg.createdAt, roomIds: roomIdsOf(reg.roomsJson) }, paid);
    const next = statusAfterPaymentRemoval(reg.status, {
      total: s.total, hasPlan: s.hasPlan, depositPaid: s.depositPaid, fullyPaid: s.fullyPaid, paymentMethod: reg.paymentMethod,
    });
    if (!next || next === reg.status) return reg.status;
    await this.db.registration.updateMany({ where: { id: registrationId, status: reg.status }, data: { status: next } });
    this.courseAccess.syncRegistrationSafe(registrationId);
    return next;
  }

  /**
   * `DELETE /admin/payments/:paymentId/test` — TRWALE usuwa wpłatę testową Tpay razem z jej próbą
   * płatności (`OnlinePayment`) i zwrotami (`PaymentRefund`), potem przelicza status zgłoszenia.
   * Serwer sam sprawdza `provider === 'tpay'` i znacznik testu — prawdziwej wpłaty tym adresem usunąć się nie da.
   * Niczego nie wysyła do Tpay.
   */
  async deleteTestPayment(paymentId: string, actor: AdminActor) {
    if (!paymentId || paymentId.length > 60) throw new NotFoundException('Payment not found');
    const p = (await this.db.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, registrationId: true, provider: true, status: true, amount: true, raw: true },
    })) as (PayRow & { registrationId: string }) | null;
    if (!p) throw new NotFoundException('Payment not found');
    const attempts = (await this.db.onlinePayment.findMany({
      where: { paymentId },
      select: { id: true, testMode: true },
    })) as Array<{ id: string; testMode: boolean }>;
    const rawTestMode = ((p.raw ?? {}) as { testMode?: unknown }).testMode;
    const deletable =
      isDeletableTestPayment({ provider: p.provider, rawTestMode, attemptTestMode: attempts[0]?.testMode }) &&
      attempts.every((a) => a.testMode === true);
    if (!deletable) {
      this.logger.warn(`Odmowa usunięcia wpłaty ${paymentId} (to nie jest wpłata testowa Tpay) — ${actor.email}`);
      throw new BadRequestException('Usunąć można wyłącznie wpłatę testową Tpay (znacznik TEST). Prawdziwą wpłatę się zwraca albo cofa.');
    }
    // Zwrot w toku / do wyjaśnienia: najpierw go rozstrzygnij — nie kasujemy śladu po zleceniu wysłanym do Tpay.
    const inFlight = (await this.db.paymentRefund.count({ where: { paymentId, status: { in: ['PENDING', 'UNCERTAIN'] } } })) as number;
    if (inFlight > 0) throw new ConflictException('Ta wpłata ma zwrot w toku albo do wyjaśnienia — najpierw go rozstrzygnij.');

    const counts = (await this.db.$transaction(async (tx: Db) => {
      const refunds = (await tx.paymentRefund.deleteMany({ where: { paymentId } })) as { count: number };
      const online = (await tx.onlinePayment.deleteMany({ where: { paymentId, testMode: true } })) as { count: number };
      const pay = (await tx.payment.deleteMany({ where: { id: paymentId, provider: 'tpay' } })) as { count: number };
      if (pay.count !== 1) throw new ConflictException('Wpłata zmieniła się w trakcie — odśwież listę.');
      return { refunds: refunds.count, attempts: online.count };
    })) as { refunds: number; attempts: number };

    const status = await this.recomputeStatus(p.registrationId);
    this.logger.warn(
      `USUNIĘTO wpłatę testową Tpay ${paymentId} (zgłoszenie ${p.registrationId}, ${round2(num(p.amount)).toFixed(2)}, prób: ${counts.attempts}, zwrotów: ${counts.refunds}; status zgłoszenia: ${status}) — ${actor.email}${actor.id ? ` [${actor.id}]` : ''}`,
    );
    return { ok: true, deleted: { payment: paymentId, attempts: counts.attempts, refunds: counts.refunds }, internalStatus: status, ...(await this.paymentPlan.paymentsOf(p.registrationId)) };
  }

  /**
   * `POST /admin/registrations/:id/delete-permanently` — TRWALE usuwa zgłoszenie testowe.
   * Warunki sprawdza serwer: zgłoszenie anulowane ORAZ bez prawdziwych wpłat (brak wpłat albo same
   * testowe wpłaty Tpay); potwierdzenie słowem „USUŃ”. Usuwa też uczestników, przydziały pokoi, wpłaty testowe
   * z próbami i zwrotami, prośby recepcji, wpisy dziennika recepcji i dziennika maili tego zgłoszenia;
   * zaproszenia, leady i dostępy do kursów zostają, tylko bez powiązania.
   */
  async deletePermanently(id: string, confirm: unknown, actor: AdminActor) {
    if (String(confirm ?? '').trim() !== PERMANENT_DELETE_WORD) {
      throw new BadRequestException(`Aby usunąć zgłoszenie trwale, wpisz słowo ${PERMANENT_DELETE_WORD}.`);
    }
    const reg = (await this.db.registration.findUnique({ where: { id }, select: { id: true, status: true, instanceId: true } })) as
      | { id: string; status: string; instanceId: string }
      | null;
    if (!reg) throw new NotFoundException('Registration not found');
    const facts = await this.paymentFacts(id);
    const blocker = permanentDeleteBlocker(reg, facts);
    if (blocker === 'NOT_CANCELLED') throw new BadRequestException('Trwale usunąć można tylko zgłoszenie anulowane. Najpierw je anuluj.');
    if (blocker === 'REAL_PAYMENTS') {
      this.logger.warn(`Odmowa trwałego usunięcia zgłoszenia ${id} (ma nietestowe wpłaty) — ${actor.email}`);
      throw new BadRequestException('To zgłoszenie ma wpłaty, które nie są testowe — nie można go usunąć. Zostaje anulowane.');
    }
    const refundsInFlight = (await this.db.paymentRefund.count({ where: { registrationId: id, status: { in: ['PENDING', 'UNCERTAIN'] } } })) as number;
    if (refundsInFlight > 0) throw new ConflictException('Zgłoszenie ma zwrot w toku albo do wyjaśnienia — najpierw go rozstrzygnij.');
    // Próba płatności online bez zaksięgowanej wpłaty też musi być testowa albo nieopłacona.
    const paidRealAttempt = (await this.db.onlinePayment.count({
      where: { registrationId: id, testMode: false, status: { in: ['PAID', 'REFUNDED'] } },
    })) as number;
    if (paidRealAttempt > 0) throw new BadRequestException('To zgłoszenie ma opłaconą, nietestową płatność online — nie można go usunąć.');

    const counts = (await this.db.$transaction(async (tx: Db) => {
      // Stan sprawdzamy ponownie w transakcji: zgłoszenie nadal anulowane, żadnej nowej wpłaty.
      const fresh = (await tx.registration.findUnique({ where: { id }, select: { status: true } })) as { status: string } | null;
      if (!fresh || fresh.status !== 'CANCELLED') throw new ConflictException('Stan zgłoszenia zmienił się w trakcie — odśwież listę.');
      const payIds = ((await tx.payment.findMany({ where: { registrationId: id }, select: { id: true } })) as Array<{ id: string }>).map((x) => x.id);
      if (payIds.some((pid) => !facts.some((f) => f.id === pid && f.test))) throw new ConflictException('Do zgłoszenia doszła nowa wpłata — odśwież listę.');
      await tx.invitation.updateMany({ where: { registrationId: id }, data: { registrationId: null } });
      await tx.registrationLead.updateMany({ where: { registrationId: id }, data: { registrationId: null } });
      await tx.courseEnrollment.updateMany({ where: { registrationId: id }, data: { registrationId: null } });
      const logs = (await tx.deskActionLog.deleteMany({ where: { registrationId: id } })) as { count: number };
      const mails = (await tx.notification.deleteMany({ where: { registrationId: id } })) as { count: number };
      const refunds = (await tx.paymentRefund.deleteMany({ where: { registrationId: id } })) as { count: number };
      const attempts = (await tx.onlinePayment.deleteMany({ where: { registrationId: id } })) as { count: number };
      const payments = (await tx.payment.deleteMany({ where: { registrationId: id } })) as { count: number };
      await tx.roomAssignment.deleteMany({ where: { registrationId: id } });
      const people = (await tx.participant.deleteMany({ where: { registrationId: id } })) as { count: number };
      await tx.registrationRequest.deleteMany({ where: { registrationId: id } });
      await tx.registration.delete({ where: { id } });
      return { payments: payments.count, attempts: attempts.count, refunds: refunds.count, participants: people.count, mails: mails.count, deskLog: logs.count };
    })) as Record<string, number>;

    this.logger.warn(
      `USUNIĘTO TRWALE zgłoszenie ${id} (event ${reg.instanceId}; uczestników: ${counts.participants}, wpłat testowych: ${counts.payments}, prób: ${counts.attempts}, zwrotów: ${counts.refunds}, maili w dzienniku: ${counts.mails}, wpisów recepcji: ${counts.deskLog}) — ${actor.email}${actor.id ? ` [${actor.id}]` : ''}`,
    );
    return { ok: true, deleted: { registration: id, ...counts } };
  }
}
