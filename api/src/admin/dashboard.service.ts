import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentPlanService } from '../registrations/payment-plan.service';
import { instanceRoomUsage } from '../registrations/room-stock';
import { netPaidByPayment } from '../payments/refund-ledger';
import {
  addonAvailability, addonLabel, addonUsage, buildAlerts, contactCountry, dailySeries, daysBetween, eventAddons,
  holdsSpot, paceToTarget, roomAvailability, sortedTiers, summarizeDiets, warsawDate,
  type DashboardAlert, type PricingConfig,
} from '../shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const text = (v: unknown, lng = 'pl'): string => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const m = v as Record<string, string>;
    return m[lng] ?? m.pl ?? m.en ?? Object.values(m).find((x) => typeof x === 'string') ?? '';
  }
  return '';
};
const nameOf = (contact: unknown): string => {
  const c = (contact ?? {}) as { firstName?: string; lastName?: string };
  return `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
};

type RegRow = {
  id: string;
  status: string;
  locale: string;
  contact: unknown;
  createdAt: Date;
  totalPrice: unknown;
  paymentMethod: string | null;
  roomsJson: unknown;
  roomsReserved: boolean;
  roomLabel: string | null;
  optionsJson: unknown;
  dietaryNotes: string | null;
  participants: Array<{ type: string; firstName: string; lastName: string; age: number | null; dietary: string | null }>;
  _count: { assignments: number };
};

/**
 * Dashboard JEDNEGO eventu (panel admina): osoby, tempo zapisów do celu, pieniądze, zakwaterowanie,
 * dodatki, diety i alarmy. Wszystko z bazy — to jedyne źródło prawdy o ludziach i wpłatach.
 * Zachowanie z PostHoga (wejścia, lejek, źródła) dokłada osobno `PosthogInsightsService`.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentPlan: PaymentPlanService,
  ) {}

  private get db(): Db {
    return this.prisma as Db;
  }

  async forInstance(instanceId: string) {
    const inst = await this.db.eventInstance.findUnique({
      where: { id: instanceId },
      include: { series: { include: { page: { select: { slug: true } } } } },
    });
    if (!inst) throw new NotFoundException('Instance not found');
    const cfg = (inst.pricingConfig ?? null) as PricingConfig | null;
    const today = warsawDate();
    const currency = cfg?.currency ?? 'PLN';

    const [regs, waitlistTotal, waitlistNotified, leads, finance] = await Promise.all([
      this.db.registration.findMany({
        where: { instanceId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, status: true, locale: true, contact: true, createdAt: true, totalPrice: true, paymentMethod: true,
          roomsJson: true, roomsReserved: true, roomLabel: true, optionsJson: true, dietaryNotes: true,
          participants: { select: { type: true, firstName: true, lastName: true, age: true, dietary: true } },
          _count: { select: { assignments: true } },
        },
      }) as Promise<RegRow[]>,
      this.db.waitlistEntry.count({ where: { instanceId } }) as Promise<number>,
      this.db.waitlistEntry.count({ where: { instanceId, notifiedAt: { not: null } } }) as Promise<number>,
      this.db.registrationLead.findMany({
        where: { instanceId },
        select: { step: true, lastActivityAt: true, convertedAt: true, reminderSentAt: true },
      }) as Promise<Array<{ step: number; lastActivityAt: Date; convertedAt: Date | null; reminderSentAt: Date | null }>>,
      this.paymentPlan.finance(instanceId),
    ]);

    const holding = regs.filter((r) => holdsSpot(r.status));
    const peopleOf = (r: RegRow) => Math.max(1, r.participants.length);

    // ── Osoby ────────────────────────────────────────────────────────────
    let adults = 0;
    let children = 0;
    for (const r of holding) {
      if (r.participants.length === 0) adults += 1;
      for (const p of r.participants) (String(p.type).toUpperCase() === 'CHILD' ? (children += 1) : (adults += 1));
    }
    const people = adults + children;
    const cancelled = regs.filter((r) => r.status === 'CANCELLED');
    const waitlistRegs = regs.filter((r) => r.status === 'WAITLIST');
    const statusCounts: Record<string, number> = {};
    for (const r of regs) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

    // Porzucone formularze: lead bez zgłoszenia, cisza > 24 h. Kroki: najdalszy osiągnięty.
    const dayAgo = Date.now() - 24 * 3600_000;
    const openLeads = leads.filter((l) => !l.convertedAt);
    const abandoned = openLeads.filter((l) => new Date(l.lastActivityAt).getTime() < dayAgo);
    const leadsByStep: Record<string, number> = {};
    for (const l of openLeads) leadsByStep[String(l.step)] = (leadsByStep[String(l.step)] ?? 0) + 1;

    // ── Tempo zapisów ────────────────────────────────────────────────────
    const opensOn = warsawDate(inst.registrationOpensAt);
    const closesOn = warsawDate(inst.registrationClosesAt);
    const firstReg = regs.length ? warsawDate(regs[regs.length - 1].createdAt) : opensOn;
    const seriesFrom = [opensOn, firstReg].sort()[0];
    const upTo = today < closesOn ? today : closesOn;
    const seriesTo = upTo < seriesFrom ? seriesFrom : upTo;
    const daily = dailySeries(
      regs.map((r) => ({ createdAt: r.createdAt, people: peopleOf(r), status: r.status })),
      seriesFrom,
      seriesTo,
    );
    const targetPeople = (inst as { targetPeople?: number | null }).targetPeople ?? null;
    const target = targetPeople ?? inst.capacity ?? 0;
    const pace = paceToTarget(daily, target, { today, opensOn, closesOn });
    const milestones: Array<{ date: string; label: string; kind: 'opens' | 'closes' | 'tier' | 'installment' | 'event' }> = [
      { date: opensOn, label: 'Start zapisów', kind: 'opens' },
      { date: closesOn, label: 'Koniec zapisów', kind: 'closes' },
      { date: warsawDate(inst.startsAt), label: 'Event', kind: 'event' },
    ];
    for (const t of sortedTiers(cfg)) milestones.push({ date: t.from, label: `Cennik: ${text(t.name) || t.from}`, kind: 'tier' });
    for (const i of cfg?.paymentPlan?.enabled ? cfg.paymentPlan.installments ?? [] : []) {
      if (i.due !== 'registration') milestones.push({ date: i.due, label: `Termin raty${i.label ? `: ${i.label}` : ''}`, kind: 'installment' });
    }
    milestones.sort((a, b) => a.date.localeCompare(b.date));

    // ── Pieniądze: wpłaty wg operatora (netto po zwrotach) ───────────────
    const payRows = (await this.db.payment.findMany({
      where: { status: 'PAID', registration: { instanceId } },
      select: { id: true, amount: true, provider: true, method: true, raw: true },
    })) as Array<{ id: string; amount: unknown; provider: string; method: string; raw: unknown }>;
    const net = await netPaidByPayment(this.db, payRows);
    const byProv = new Map<string, { amount: number; count: number }>();
    let testPayments = 0;
    for (const p of payRows) {
      const isTest = !!(p.raw as { testMode?: boolean } | null)?.testMode || p.provider === 'mock';
      if (isTest) testPayments += 1;
      const key = isTest ? 'test' : p.provider;
      const cur = byProv.get(key) ?? { amount: 0, count: 0 };
      cur.amount = round2(cur.amount + (net.get(p.id) ?? num(p.amount)));
      cur.count += 1;
      byProv.set(key, cur);
    }
    const byProvider = [...byProv.entries()].map(([provider, v]) => ({ provider, ...v })).sort((a, b) => b.amount - a.amount);
    // Zgłoszenia czekające na przelew > 7 dni bez żadnej wpłaty.
    const paidRegIds = new Set(
      ((await this.db.payment.findMany({ where: { status: 'PAID', registration: { instanceId } }, select: { registrationId: true } })) as Array<{ registrationId: string }>)
        .map((p) => p.registrationId),
    );
    const weekAgo = Date.now() - 7 * 24 * 3600_000;
    const staleAwaitingTransfer = holding.filter(
      (r) => (r.status === 'AWAITING_TRANSFER' || r.status === 'PENDING_PAYMENT') && num(r.totalPrice) > 0 &&
        !paidRegIds.has(r.id) && new Date(r.createdAt).getTime() < weekAgo,
    ).length;
    const methodCounts: Record<string, number> = {};
    for (const r of holding) {
      const m = r.paymentMethod ?? (num(r.totalPrice) > 0 ? 'NONE' : 'FREE');
      methodCounts[m] = (methodCounts[m] ?? 0) + 1;
    }

    // ── Zakwaterowanie ───────────────────────────────────────────────────
    const usage = await instanceRoomUsage(this.prisma, instanceId);
    const avail = roomAvailability(cfg, usage.public, usage.reserved);
    const peopleInType: Record<string, number> = {};
    const roomsInType: Record<string, number> = {};
    let needRoom = 0;
    let assigned = 0;
    let noLodging = 0;
    for (const r of holding) {
      const rooms = Array.isArray(r.roomsJson) ? (r.roomsJson as Array<{ roomId?: string; participantIndexes?: number[] }>) : [];
      if (!rooms.length) {
        noLodging += 1;
        continue;
      }
      needRoom += 1;
      if ((r.roomLabel ?? '').trim() || r._count.assignments > 0) assigned += 1;
      for (const room of rooms) {
        const id = String(room.roomId ?? '');
        if (!id) continue;
        roomsInType[id] = (roomsInType[id] ?? 0) + 1;
        peopleInType[id] = (peopleInType[id] ?? 0) + (room.participantIndexes?.length ?? 0);
      }
    }
    const roomTypes = (cfg?.rooms ?? []).map((rt) => {
      const stock = Number(rt.stock ?? 0) || 0;
      return {
        id: rt.id,
        name: text(rt.name),
        stock: stock > 0 ? stock : null,
        reserved: Number(rt.reserved ?? 0) || 0,
        usedPublic: usage.public[rt.id] ?? 0,
        usedReserved: usage.reserved[rt.id] ?? 0,
        /** wolne w publicznym zapisie (null = bez limitu) */
        available: stock > 0 ? avail[rt.id] ?? 0 : null,
        /** pokoje tego typu w trzymających miejsce zgłoszeniach (bez listy rezerwowej) */
        rooms: roomsInType[rt.id] ?? 0,
        people: peopleInType[rt.id] ?? 0,
      };
    });

    // ── Dodatki z limitem ────────────────────────────────────────────────
    const addonDefs = eventAddons(cfg);
    const addonUsed = addonUsage(regs.map((r) => ({ status: r.status, options: r.optionsJson })));
    const addonFree = addonAvailability(addonDefs, addonUsed);
    const addons = addonDefs.map((a) => ({
      id: a.id,
      name: addonLabel(a.name, 'pl'),
      limit: Number(a.limit ?? 0) || null,
      used: addonUsed[a.id] ?? 0,
      available: a.id in addonFree ? addonFree[a.id] : null,
    }));

    // ── Diety (osoby) ────────────────────────────────────────────────────
    const diet = summarizeDiets(
      regs.map((r) => ({ id: r.id, status: r.status, registrant: nameOf(r.contact), dietaryNotes: r.dietaryNotes, participants: r.participants })),
      cfg?.childBrackets,
    );
    const diets = diet.rows.map((d) => ({ id: d.id, label: d.label, total: d.total })).filter((d) => d.total > 0);

    // ── Skąd są goście (język formularza, kraj zamieszkania) ────────────
    const locales: Record<string, number> = {};
    const countries: Record<string, number> = {};
    for (const r of holding) {
      const l = (r.locale || 'pl').slice(0, 2);
      locales[l] = (locales[l] ?? 0) + peopleOf(r);
      const c = (contactCountry(r.contact) ?? '—').toUpperCase();
      countries[c] = (countries[c] ?? 0) + peopleOf(r);
    }
    const toList = (m: Record<string, number>) => Object.entries(m).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);

    // ── Ostatnie zgłoszenia ──────────────────────────────────────────────
    const paid = await this.paymentPlan.paidMap({ instanceId });
    const recent = regs.slice(0, 8).map((r) => ({
      id: r.id,
      createdAt: new Date(r.createdAt).toISOString(),
      name: nameOf(r.contact) || '—',
      people: peopleOf(r),
      total: round2(num(r.totalPrice)),
      paid: paid.get(r.id)?.paid ?? 0,
      status: r.status,
      paymentMethod: r.paymentMethod,
    }));

    // ── Alarmy ───────────────────────────────────────────────────────────
    const soldOut: string[] = [];
    const almostSoldOut: string[] = [];
    for (const rt of roomTypes) {
      if (rt.available === null) continue;
      if (rt.available <= 0) soldOut.push(rt.name);
      else if (rt.available <= 2) almostSoldOut.push(`${rt.name} (${rt.available})`);
    }
    for (const a of addons) {
      if (a.available === null) continue;
      if (a.available <= 0) soldOut.push(a.name);
      else if (a.available <= 2) almostSoldOut.push(`${a.name} (${a.available})`);
    }
    const daysToEvent = daysBetween(today, warsawDate(inst.startsAt));
    const registrationOpen = inst.status === 'OPEN' && today >= opensOn && today <= closesOn;
    const alerts: DashboardAlert[] = buildAlerts({
      overdueCount: finance.overdueCount,
      overdueAmount: finance.overdue,
      currency,
      staleAwaitingTransfer,
      unassignedRooms: needRoom - assigned,
      daysToEvent,
      waitlistRegistrations: waitlistRegs.length,
      abandonedLeads: abandoned.length,
      soldOut,
      almostSoldOut,
      overCapacity: inst.capacity ? Math.max(0, people - inst.capacity) : 0,
      pace,
      registrationOpen,
    });

    return {
      generatedAt: new Date().toISOString(),
      today,
      event: {
        id: inst.id,
        title: text(inst.title),
        slug: inst.series?.page?.slug ?? null,
        status: inst.status,
        unlisted: !!inst.unlisted,
        startsAt: new Date(inst.startsAt).toISOString(),
        endsAt: new Date(inst.endsAt).toISOString(),
        registrationOpensAt: new Date(inst.registrationOpensAt).toISOString(),
        registrationClosesAt: new Date(inst.registrationClosesAt).toISOString(),
        capacity: inst.capacity ?? null,
        targetPeople,
        currency,
        free: !!cfg?.free,
        daysToEvent,
        registrationOpen,
      },
      people: {
        registrations: holding.length,
        people,
        adults,
        children,
        statusCounts,
        cancelledRegistrations: cancelled.length,
        cancelledPeople: cancelled.reduce((s, r) => s + peopleOf(r), 0),
        waitlistRegistrations: waitlistRegs.length,
        /** zapisy na powiadomienie o starcie zapisów (licznik) */
        waitlistSignups: waitlistTotal,
        waitlistNotified,
        leadsOpen: openLeads.length,
        leadsAbandoned: abandoned.length,
        leadsReminded: openLeads.filter((l) => l.reminderSentAt).length,
        leadsConverted: leads.length - openLeads.length,
        leadsByStep,
      },
      pace,
      daily,
      milestones,
      finance: { ...finance, byProvider, testPayments, staleAwaitingTransfer, paymentMethods: methodCounts },
      lodging: { roomTypes, needRoom, assigned, unassigned: needRoom - assigned, noLodging },
      addons,
      diets,
      dietPeople: diet.people,
      locales: toList(locales),
      countries: toList(countries),
      recent,
      alerts,
    };
  }

  /** Cel frekwencji (np. minimum z umowy z ośrodkiem). null / 0 = bez celu. */
  async setTarget(instanceId: string, value: unknown) {
    const n = value === null || value === '' || value === undefined ? null : Math.trunc(Number(value));
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100000)) throw new BadRequestException('Cel musi być liczbą osób (0–100 000).');
    const exists = await this.db.eventInstance.findUnique({ where: { id: instanceId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Instance not found');
    await this.db.eventInstance.update({ where: { id: instanceId }, data: { targetPeople: n && n > 0 ? n : null } });
    return { targetPeople: n && n > 0 ? n : null };
  }
}
