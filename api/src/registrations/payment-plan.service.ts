import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CourseAccessService } from '../courses/course-access.service';
import {
  addDays, buildSchedule, hasPaymentPlan, minDepositPctFor, normalizePaymentPlan, paymentState, warsawDate,
  PaymentPlan, PaymentState, PricingConfig, ScheduleItem,
} from '../shared';
import { manageRegistrationLink } from './registrations.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Wpłaty wpisane ręcznie w panelu / zaimportowane z wyciągu (w odróżnieniu od „Oznacz opłacone"). */
export const PARTIAL_PROVIDERS = ['panel', 'bank-import'];
const ACTIVE_STATUSES = ['PENDING_PAYMENT', 'AWAITING_TRANSFER', 'CONFIRMED'];
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

export interface PaymentSummary extends PaymentState {
  /** harmonogram zgłoszenia (pusty, gdy event nie ma planu wpłat) */
  schedule: ScheduleItem[];
  /** event ma włączony plan wpłat */
  hasPlan: boolean;
}

function roomIdsOf(roomsJson: unknown): string[] {
  return (Array.isArray(roomsJson) ? roomsJson : []).map((r) => String((r as { roomId?: unknown })?.roomId ?? '')).filter(Boolean);
}

/** Plan wpłat z cennika eventu (znormalizowany) albo null. */
export function planOf(cfg: PricingConfig | null | undefined): PaymentPlan | null {
  const plan = normalizePaymentPlan(cfg?.paymentPlan);
  return hasPaymentPlan(plan) ? plan : null;
}

/** Harmonogram + stan rozliczenia jednego zgłoszenia. */
export function summarize(
  cfg: PricingConfig | null | undefined,
  reg: { totalPrice: unknown; createdAt: Date | string; roomIds: string[] },
  paid: number,
  today = warsawDate(),
): PaymentSummary {
  const total = num(reg.totalPrice);
  const plan = planOf(cfg);
  const schedule = plan ? buildSchedule(total, plan, warsawDate(reg.createdAt), minDepositPctFor(cfg?.rooms, reg.roomIds)) : [];
  return { ...paymentState(total, paid, schedule, today), schedule, hasPlan: !!plan };
}

@Injectable()
export class PaymentPlanService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PaymentPlan');
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<{ dueSoon: number; overdue: number }> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: NotificationsService,
    private readonly courseAccess: CourseAccessService,
  ) {}

  private get db(): Db {
    return this.prisma as Db;
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    // Przypomnienia o ratach: sprawdzamy co godzinę (deduplikacja w dzienniku maili).
    this.timer = setInterval(() => void this.runReminders().catch(() => undefined), 60 * 60_000);
    setTimeout(() => void this.runReminders().catch(() => undefined), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Suma zaksięgowanych wpłat (PAID) per zgłoszenie + czy są wśród nich wpłaty częściowe z panelu / importu. */
  async paidMap(where: Record<string, unknown>): Promise<Map<string, { paid: number; partial: boolean }>> {
    const rows = (await this.db.payment.findMany({
      where: { status: 'PAID', registration: where },
      select: { registrationId: true, amount: true, provider: true },
    })) as Array<{ registrationId: string; amount: unknown; provider: string }>;
    const map = new Map<string, { paid: number; partial: boolean }>();
    for (const r of rows) {
      const cur = map.get(r.registrationId) ?? { paid: 0, partial: false };
      cur.paid = round2(cur.paid + num(r.amount));
      if (PARTIAL_PROVIDERS.includes(r.provider)) cur.partial = true;
      map.set(r.registrationId, cur);
    }
    return map;
  }

  /**
   * Dokleja do listy zgłoszeń (kontrakt panelu) sumę wpłat i stan względem harmonogramu.
   * `paymentStatus` liczymy z sumy wpłat tylko tam, gdzie mogą być wpłaty częściowe
   * (event z planem albo wpłata z panelu / importu) — reszta zostaje jak dotąd.
   */
  async decorate<T extends { id: string; totalPrice: number; createdAt: string; rooms?: Array<{ roomId: string }>; paymentStatus?: string }>(
    instanceId: string,
    list: T[],
  ): Promise<Array<T & { paidAmount: number; payment: PaymentSummary }>> {
    const inst = await this.db.eventInstance.findUnique({ where: { id: instanceId }, select: { pricingConfig: true } });
    const cfg = (inst?.pricingConfig ?? null) as PricingConfig | null;
    const paid = await this.paidMap({ instanceId });
    const today = warsawDate();
    return list.map((r) => {
      const p = paid.get(r.id) ?? { paid: 0, partial: false };
      const payment = summarize(cfg, { totalPrice: r.totalPrice, createdAt: r.createdAt, roomIds: (r.rooms ?? []).map((x) => x.roomId) }, p.paid, today);
      const sumBased = payment.hasPlan || p.partial;
      const paymentStatus = !sumBased || r.totalPrice <= 0
        ? r.paymentStatus
        : payment.fullyPaid ? 'PAID' : p.paid > 0 || r.paymentStatus === 'PENDING' ? 'PENDING' : r.paymentStatus;
      return { ...r, paymentStatus, paidAmount: p.paid, payment };
    });
  }

  /** Finanse eventu: wpłacone, zadatki, zaległości i prognoza wpływów wg terminów. */
  async finance(instanceId: string) {
    const inst = await this.db.eventInstance.findUnique({ where: { id: instanceId }, select: { pricingConfig: true } });
    if (!inst) throw new NotFoundException('Instance not found');
    const cfg = (inst.pricingConfig ?? null) as PricingConfig | null;
    const regs = (await this.db.registration.findMany({
      where: { instanceId, status: { in: ACTIVE_STATUSES } },
      select: { id: true, totalPrice: true, createdAt: true, roomsJson: true, optionsJson: true, _count: { select: { participants: true } } },
    })) as Array<{ id: string; totalPrice: unknown; createdAt: Date; roomsJson: unknown; optionsJson: unknown; _count: { participants: number } }>;
    const paid = await this.paidMap({ instanceId });
    const today = warsawDate();
    const out = {
      hasPlan: !!planOf(cfg),
      currency: cfg?.currency ?? 'PLN',
      registrations: regs.length,
      people: 0,
      expected: 0,
      paid: 0,
      remaining: 0,
      dueNow: 0,
      overdue: 0,
      overdueCount: 0,
      depositRequired: 0,
      depositPaid: 0,
      depositPaidCount: 0,
      fullyPaidCount: 0,
      donations: 0,
      donationsCount: 0,
      /** prognoza: ile jeszcze ma wpłynąć na każdy termin (zaległe pod datą terminu) */
      forecast: [] as Array<{ dueDate: string; amount: number; count: number; overdue: boolean }>,
    };
    const byDate = new Map<string, { amount: number; count: number }>();
    for (const r of regs) {
      const p = paid.get(r.id)?.paid ?? 0;
      const s = summarize(cfg, { totalPrice: r.totalPrice, createdAt: r.createdAt, roomIds: roomIdsOf(r.roomsJson) }, p, today);
      out.people += r._count.participants;
      out.expected += s.total;
      out.paid += Math.min(p, s.total);
      out.remaining += s.remaining;
      out.dueNow += s.dueNow;
      out.overdue += s.overdue;
      if (s.overdue > 0) out.overdueCount += 1;
      if (s.fullyPaid && s.total > 0) out.fullyPaidCount += 1;
      const first = s.schedule[0];
      if (first) {
        out.depositRequired += first.cumulativeAmount;
        out.depositPaid += Math.min(p, first.cumulativeAmount);
        if (s.depositPaid) out.depositPaidCount += 1;
      }
      const donation = num((r.optionsJson as { donation?: unknown } | null)?.donation);
      if (donation > 0) {
        out.donations += donation;
        out.donationsCount += 1;
      }
      // Prognoza: niedopłata każdego progu harmonogramu pod jego terminem.
      let covered = p;
      const items = s.schedule.length ? s.schedule : s.remaining > 0 ? [{ dueDate: today, cumulativeAmount: s.total } as ScheduleItem] : [];
      for (const it of items) {
        const missing = round2(Math.max(0, it.cumulativeAmount - covered));
        if (missing > 0) {
          const cur = byDate.get(it.dueDate) ?? { amount: 0, count: 0 };
          cur.amount = round2(cur.amount + missing);
          cur.count += 1;
          byDate.set(it.dueDate, cur);
          covered = it.cumulativeAmount;
        }
      }
    }
    for (const k of ['expected', 'paid', 'remaining', 'dueNow', 'overdue', 'depositRequired', 'depositPaid', 'donations'] as const) {
      out[k] = round2(out[k]);
    }
    out.forecast = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dueDate, v]) => ({ dueDate, amount: v.amount, count: v.count, overdue: dueDate < today }));
    return out;
  }

  /** Wpłaty jednego zgłoszenia (najnowsze pierwsze) + stan rozliczenia. */
  async paymentsOf(registrationId: string) {
    const reg = await this.db.registration.findUnique({
      where: { id: registrationId },
      include: { instance: { select: { pricingConfig: true } }, payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    const payments = (reg.payments as Array<{ id: string; amount: unknown; currency: string; status: string; provider: string; method: string; externalId: string | null; raw: unknown; createdAt: Date }>).map((p) => {
      const raw = (p.raw ?? {}) as { paidAt?: string; note?: string; by?: string; sender?: string; title?: string };
      return {
        id: p.id,
        amount: num(p.amount),
        currency: p.currency,
        status: p.status,
        provider: p.provider,
        method: p.method,
        paidAt: raw.paidAt ?? p.createdAt.toISOString().slice(0, 10),
        note: raw.note ?? null,
        by: raw.by ?? null,
        sender: raw.sender ?? null,
        title: raw.title ?? null,
        createdAt: p.createdAt.toISOString(),
      };
    });
    const paid = round2(payments.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount, 0));
    const cfg = (reg.instance?.pricingConfig ?? null) as PricingConfig | null;
    return {
      registrationId,
      payments,
      summary: summarize(cfg, { totalPrice: reg.totalPrice, createdAt: reg.createdAt, roomIds: roomIdsOf(reg.roomsJson) }, paid),
    };
  }

  /**
   * Księguje wpłatę (także częściową). `externalId` (np. skrót transakcji z wyciągu) chroni
   * przed podwójnym zaksięgowaniem tej samej operacji.
   */
  async addPayment(
    registrationId: string,
    dto: { amount?: unknown; paidAt?: string; method?: string; note?: string; source?: string; externalId?: string; sender?: string; title?: string },
    actor: string,
  ) {
    const amount = round2(num(typeof dto.amount === 'string' ? dto.amount.replace(',', '.') : dto.amount));
    if (!(amount > 0) || amount > 1_000_000) throw new BadRequestException('Podaj kwotę wpłaty większą od zera.');
    const reg = await this.db.registration.findUnique({ where: { id: registrationId }, select: { id: true, currency: true, status: true } });
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.status === 'CANCELLED') throw new BadRequestException('Zgłoszenie jest anulowane — najpierw je przywróć.');
    const paidAt = /^\d{4}-\d{2}-\d{2}$/.test(String(dto.paidAt ?? '')) ? String(dto.paidAt) : warsawDate();
    const method = ['BANK_TRANSFER', 'CASH', 'ONLINE'].includes(String(dto.method)) ? String(dto.method) : 'BANK_TRANSFER';
    const provider = dto.source === 'bank-import' ? 'bank-import' : 'panel';
    const externalId = dto.externalId ? String(dto.externalId).slice(0, 190) : null;
    if (externalId) {
      const dup = await this.db.payment.findFirst({ where: { externalId, provider }, select: { id: true, registrationId: true } });
      if (dup) return { ok: true, duplicate: true, paymentId: dup.id, ...(await this.paymentsOf(dup.registrationId)) };
    }
    const created = await this.db.payment.create({
      data: {
        registrationId,
        provider,
        method,
        amount,
        currency: reg.currency,
        status: 'PAID',
        externalId,
        raw: {
          paidAt,
          by: actor,
          ...(dto.note ? { note: String(dto.note).slice(0, 500) } : {}),
          ...(dto.sender ? { sender: String(dto.sender).slice(0, 200) } : {}),
          ...(dto.title ? { title: String(dto.title).slice(0, 300) } : {}),
        },
      },
    });
    await this.syncStatus(registrationId);
    return { ok: true, duplicate: false, paymentId: created.id as string, ...(await this.paymentsOf(registrationId)) };
  }

  /** Cofnięcie błędnie wpisanej wpłaty z panelu / importu (zostaje w historii jako anulowana). */
  async voidPayment(paymentId: string, actor: string) {
    const p = await this.db.payment.findUnique({ where: { id: paymentId } });
    if (!p) throw new NotFoundException('Payment not found');
    if (!PARTIAL_PROVIDERS.includes(p.provider) || p.status !== 'PAID') {
      throw new BadRequestException('Cofnąć można tylko wpłatę wpisaną w panelu lub zaimportowaną z wyciągu.');
    }
    await this.db.payment.update({
      where: { id: paymentId },
      data: { status: 'FAILED', externalId: null, raw: { ...((p.raw ?? {}) as object), voidedAt: new Date().toISOString(), voidedBy: actor, voidedExternalId: p.externalId } },
    });
    return this.paymentsOf(p.registrationId);
  }

  /** Zadatek (albo całość, gdy event nie ma planu) wpłacony → zgłoszenie potwierdzone. Nigdy nie cofa statusu. */
  async syncStatus(registrationId: string) {
    const reg = await this.db.registration.findUnique({
      where: { id: registrationId },
      include: { instance: { select: { pricingConfig: true } } },
    });
    if (!reg || !['PENDING_PAYMENT', 'AWAITING_TRANSFER', 'DRAFT'].includes(reg.status)) return;
    const paid = (await this.paidMap({ id: registrationId })).get(registrationId)?.paid ?? 0;
    const s = summarize((reg.instance?.pricingConfig ?? null) as PricingConfig | null, { totalPrice: reg.totalPrice, createdAt: reg.createdAt, roomIds: roomIdsOf(reg.roomsJson) }, paid);
    if (s.hasPlan ? s.depositPaid : s.fullyPaid) {
      await this.db.registration.update({ where: { id: registrationId }, data: { status: 'CONFIRMED' } });
      this.courseAccess.syncRegistrationSafe(registrationId);
    }
  }

  // ── Przypomnienia o ratach ─────────────────────────────────────────────────

  /** Jedno przejście naraz (timer + zewnętrzny cron mogą się zbiec). */
  runReminders(): Promise<{ dueSoon: number; overdue: number }> {
    if (!this.running) {
      this.running = this.doRunReminders().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async alreadySent(registrationId: string, type: string, installmentId: string): Promise<boolean> {
    const hit = await this.db.notification.findFirst({
      where: { registrationId, type, payload: { path: ['installmentId'], equals: installmentId } },
      select: { id: true },
    });
    return !!hit;
  }

  private async doRunReminders(): Promise<{ dueSoon: number; overdue: number }> {
    const result = { dueSoon: 0, overdue: 0 };
    const today = warsawDate();
    const instances = (await this.db.eventInstance.findMany({
      where: { status: 'OPEN' },
      select: { id: true, title: true, startsAt: true, pricingConfig: true, series: { select: { page: { select: { paymentInfo: true } } } } },
    })) as Array<{ id: string; title: unknown; startsAt: Date; pricingConfig: unknown; series?: { page?: { paymentInfo?: unknown } | null } | null }>;
    for (const inst of instances) {
      const cfg = (inst.pricingConfig ?? null) as PricingConfig | null;
      const plan = planOf(cfg);
      if (!plan) continue;
      if (today > warsawDate(inst.startsAt)) continue; // po rozpoczęciu wydarzenia już nie ponaglamy
      const before = plan.remindBeforeDays ?? 3;
      const after = plan.remindAfterDays ?? 7;
      if (before <= 0 && after <= 0) continue;
      const regs = (await this.db.registration.findMany({
        where: { instanceId: inst.id, status: { in: ACTIVE_STATUSES } },
        select: { id: true, totalPrice: true, currency: true, createdAt: true, roomsJson: true, contact: true, locale: true, editToken: true },
      })) as Array<{ id: string; totalPrice: unknown; currency: string; createdAt: Date; roomsJson: unknown; contact: unknown; locale: string; editToken: string }>;
      if (regs.length === 0) continue;
      const paid = await this.paidMap({ instanceId: inst.id });
      const pay = (inst.series?.page?.paymentInfo ?? null) as { recipient?: string; account?: string; swift?: string; bankName?: string; bankAddress?: string; operator?: string } | null;
      for (const r of regs) {
        const email = String(((r.contact ?? {}) as { email?: string }).email ?? '').trim();
        if (!email) continue;
        const p = paid.get(r.id)?.paid ?? 0;
        const s = summarize(cfg, { totalPrice: r.totalPrice, createdAt: r.createdAt, roomIds: roomIdsOf(r.roomsJson) }, p, today);
        // Najwcześniejszy niedopłacony próg — jeden mail na przejście.
        const item = s.schedule.find((it) => it.cumulativeAmount > p + 0.005);
        if (!item) continue;
        const missing = round2(item.cumulativeAmount - p);
        let type: 'PAYMENT_DUE_SOON' | 'PAYMENT_OVERDUE' | null = null;
        if (after > 0 && today >= addDays(item.dueDate, after)) type = 'PAYMENT_OVERDUE';
        else if (before > 0 && !item.atRegistration && today >= addDays(item.dueDate, -before) && today < item.dueDate) type = 'PAYMENT_DUE_SOON';
        if (!type || (await this.alreadySent(r.id, type, item.id))) continue;
        try {
          await this.mail.sendInstallmentReminder({
            kind: type,
            to: email,
            locale: r.locale,
            registrationId: r.id,
            installmentId: item.id,
            label: item.label,
            dueDate: item.dueDate,
            amount: missing,
            paid: p,
            total: s.total,
            currency: r.currency,
            eventTitle: inst.title,
            manageLink: manageRegistrationLink(r.editToken),
            recipient: pay?.recipient,
            account: pay?.account,
            swift: pay?.swift,
            bankName: pay?.bankName,
            bankAddress: pay?.bankAddress,
            operator: pay?.operator,
          });
          if (type === 'PAYMENT_OVERDUE') result.overdue += 1;
          else result.dueSoon += 1;
        } catch (e) {
          this.logger.warn(`Przypomnienie ${type} dla ${r.id}: ${(e as Error).message}`);
        }
      }
    }
    if (result.dueSoon || result.overdue) this.logger.log(`Przypomnienia o ratach: ${result.dueSoon} przed terminem, ${result.overdue} po terminie`);
    return result;
  }
}
