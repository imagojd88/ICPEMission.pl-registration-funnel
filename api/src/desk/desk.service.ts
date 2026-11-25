import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentPlanService, summarize } from '../registrations/payment-plan.service';
import { DESK_REQUEST_KINDS, DeskScope, EVENT_STAFF_ROLE, PricingConfig, effectiveDeskScopes, warsawDate } from '../shared';
import type { DeskActor } from './desk-auth.guard';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Zgłoszenia widoczne na recepcji: aktywne (bez szkiców, listy rezerwowej i anulowanych). */
const DESK_STATUSES = ['PENDING_PAYMENT', 'AWAITING_TRANSFER', 'CONFIRMED'];
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const roomIdsOf = (roomsJson: unknown): string[] =>
  (Array.isArray(roomsJson) ? roomsJson : []).map((r) => String((r as { roomId?: unknown })?.roomId ?? '')).filter(Boolean);

interface RegRow {
  id: string;
  instanceId: string;
  status: string;
  contact: unknown;
  dietaryNotes: string | null;
  totalPrice: unknown;
  currency: string;
  createdAt: Date;
  roomsJson: unknown;
  roomLabel: string | null;
  roomNote: string | null;
  checkedInAt: Date | null;
  checkedInBy: string | null;
  keyIssuedAt: Date | null;
  keyIssuedBy: string | null;
  keyReturnedAt: Date | null;
  keyReturnedBy: string | null;
  participants: Array<{ id: string; type: string; firstName: string; lastName: string; age: number | null; dietary: string | null }>;
  requests: Array<{ id: string; participantId: string | null; kind: string; note: string; status: string; createdBy: string; createdAt: Date; resolvedBy: string | null; resolvedAt: Date | null }>;
}

/** Pola zgłoszenia pobierane dla recepcji — nic ponad to nie opuszcza bazy. */
const REG_SELECT = {
  id: true,
  instanceId: true,
  status: true,
  contact: true,
  dietaryNotes: true,
  totalPrice: true,
  currency: true,
  createdAt: true,
  roomsJson: true,
  roomLabel: true,
  roomNote: true,
  checkedInAt: true,
  checkedInBy: true,
  keyIssuedAt: true,
  keyIssuedBy: true,
  keyReturnedAt: true,
  keyReturnedBy: true,
  participants: {
    select: { id: true, type: true, firstName: true, lastName: true, age: true, dietary: true },
    orderBy: { createdAt: 'asc' },
  },
  requests: {
    select: { id: true, participantId: true, kind: true, note: true, status: true, createdBy: true, createdAt: true, resolvedBy: true, resolvedAt: true },
    orderBy: { createdAt: 'asc' },
  },
};

@Injectable()
export class DeskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentPlan: PaymentPlanService,
  ) {}

  private get db(): Db {
    return this.prisma as Db;
  }

  private async log(instanceId: string, registrationId: string | null, action: string, actor: string, detail?: Record<string, unknown>) {
    try {
      await this.db.deskActionLog.create({ data: { instanceId, registrationId, action, actor, ...(detail ? { detail } : {}) } });
    } catch {
      /* dziennik nie może zablokować akcji na recepcji */
    }
  }

  // ── Kto jestem + moje eventy ───────────────────────────────────────────────

  async me(actor: DeskActor) {
    const pick = { id: true, title: true, startsAt: true, endsAt: true, location: true, status: true };
    if (actor.full) {
      const list = (await this.db.eventInstance.findMany({
        where: { status: { in: ['OPEN', 'CLOSED', 'DRAFT'] } },
        select: pick,
        orderBy: { startsAt: 'desc' },
        take: 60,
      })) as Array<{ id: string; title: unknown; startsAt: Date; endsAt: Date; location: string | null; status: string }>;
      return {
        email: actor.email,
        role: actor.role,
        full: true,
        events: list.map((i) => ({ instanceId: i.id, title: i.title, startsAt: iso(i.startsAt), endsAt: iso(i.endsAt), location: i.location, scopes: actor.scopes, expiresAt: null })),
      };
    }
    const grants = (await this.db.eventStaffGrant.findMany({
      where: { adminUserId: actor.sub },
      select: { scopes: true, expiresAt: true, instance: { select: pick } },
    })) as Array<{ scopes: string[]; expiresAt: Date | null; instance: { id: string; title: unknown; startsAt: Date; endsAt: Date; location: string | null; status: string } }>;
    const events = grants
      .map((g) => ({ g, scopes: effectiveDeskScopes(EVENT_STAFF_ROLE, g) }))
      .filter((x) => x.scopes.length > 0 && x.g.instance.status !== 'ARCHIVED')
      .sort((a, b) => a.g.instance.startsAt.getTime() - b.g.instance.startsAt.getTime())
      .map(({ g, scopes }) => ({
        instanceId: g.instance.id,
        title: g.instance.title,
        startsAt: iso(g.instance.startsAt),
        endsAt: iso(g.instance.endsAt),
        location: g.instance.location,
        scopes,
        expiresAt: iso(g.expiresAt),
      }));
    return { email: actor.email, role: actor.role, full: false, events };
  }

  // ── Widok eventu ───────────────────────────────────────────────────────────

  /**
   * Jedno zgłoszenie w kształcie recepcji. Minimalizacja danych:
   *  - kontakt: tylko imię, nazwisko, e-mail i telefon ZGŁASZAJĄCEGO (bez adresu, parafii, wspólnoty),
   *  - osoby: imię, nazwisko, dieta; wiek tylko dzieci; bez daty urodzenia i płci,
   *  - kwoty wyłącznie z zakresem `payments` (bez rozbicia ceny, bez darowizn),
   *  - bez tokenów (editToken), opcji wyceny, kodów rabatowych, statusów płatności online.
   */
  private toDesk(r: RegRow, cfg: PricingConfig | null, paid: number, scopes: DeskScope[], today: string) {
    const c = (r.contact ?? {}) as { firstName?: string; lastName?: string; email?: string; phone?: string };
    const money = scopes.includes('payments')
      ? (() => {
          const s = summarize(cfg, { totalPrice: r.totalPrice, createdAt: r.createdAt, roomIds: roomIdsOf(r.roomsJson) }, paid, today);
          return { total: s.total, paid: s.paid, remaining: s.remaining, dueNow: s.dueNow, overdue: s.overdue, currency: r.currency || 'PLN' };
        })()
      : null;
    return {
      id: r.id,
      status: r.status,
      contact: { firstName: c.firstName ?? '', lastName: c.lastName ?? '', email: c.email ?? '', phone: c.phone ?? '' },
      people: r.participants.map((p) => {
        const child = p.type === 'CHILD' || (p.age !== null && p.age < 18);
        return { id: p.id, firstName: p.firstName, lastName: p.lastName, child, age: child ? p.age : null, diet: p.dietary ?? null };
      }),
      dietaryNotes: r.dietaryNotes ?? null,
      roomLabel: r.roomLabel ?? null,
      roomNote: r.roomNote ?? null,
      checkedInAt: iso(r.checkedInAt),
      checkedInBy: r.checkedInBy ?? null,
      key: { issuedAt: iso(r.keyIssuedAt), issuedBy: r.keyIssuedBy ?? null, returnedAt: iso(r.keyReturnedAt), returnedBy: r.keyReturnedBy ?? null },
      requests: r.requests.map((q) => ({
        id: q.id,
        participantId: q.participantId,
        kind: q.kind,
        note: q.note,
        status: q.status === 'DONE' ? 'DONE' : 'OPEN',
        createdBy: q.createdBy,
        createdAt: iso(q.createdAt),
        resolvedBy: q.resolvedBy,
        resolvedAt: iso(q.resolvedAt),
      })),
      money,
    };
  }

  async overview(instanceId: string, actor: DeskActor) {
    const inst = (await this.db.eventInstance.findUnique({
      where: { id: instanceId },
      select: { id: true, title: true, startsAt: true, endsAt: true, location: true, pricingConfig: true },
    })) as { id: string; title: unknown; startsAt: Date; endsAt: Date; location: string | null; pricingConfig: unknown } | null;
    if (!inst) throw new NotFoundException('Nie ma takiego wydarzenia.');
    const cfg = (inst.pricingConfig ?? null) as PricingConfig | null;
    const regs = (await this.db.registration.findMany({
      where: { instanceId, status: { in: DESK_STATUSES } },
      select: REG_SELECT,
    })) as RegRow[];
    const withMoney = actor.scopes.includes('payments');
    const paid = withMoney ? await this.paymentPlan.paidMap({ instanceId }) : new Map<string, { paid: number; partial: boolean }>();
    const today = warsawDate();
    const rows = regs
      .map((r) => this.toDesk(r, cfg, paid.get(r.id)?.paid ?? 0, actor.scopes, today))
      .sort((a, b) => `${a.contact.lastName} ${a.contact.firstName}`.localeCompare(`${b.contact.lastName} ${b.contact.firstName}`, 'pl'));

    const arrived = rows.filter((r) => !!r.checkedInAt);
    const counters = {
      registrations: rows.length,
      registrationsArrived: arrived.length,
      people: rows.reduce((s, r) => s + r.people.length, 0),
      peopleArrived: arrived.reduce((s, r) => s + r.people.length, 0),
      keysIssued: rows.filter((r) => !!r.key.issuedAt).length,
      keysOut: rows.filter((r) => !!r.key.issuedAt && !r.key.returnedAt).length,
      requestsOpen: rows.reduce((s, r) => s + r.requests.filter((q) => q.status === 'OPEN').length, 0),
      /** suma pozostała do zapłaty (null bez zakresu `payments`) */
      toPay: withMoney ? round2(rows.reduce((s, r) => s + (r.money?.remaining ?? 0), 0)) : null,
      toPayCount: withMoney ? rows.filter((r) => (r.money?.remaining ?? 0) > 0).length : null,
      currency: cfg?.currency ?? 'PLN',
    };
    return {
      event: { instanceId: inst.id, title: inst.title, startsAt: iso(inst.startsAt), endsAt: iso(inst.endsAt), location: inst.location },
      me: { email: actor.email, full: actor.full, scopes: actor.scopes },
      counters,
      registrations: rows,
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * Zgłoszenie MUSI należeć do eventu z adresu (grant jest na event, nie na dowolne id)
   * i być aktywne — recepcja nie działa na szkicach, liście rezerwowej ani anulowanych.
   */
  private async regOf(instanceId: string, registrationId: string): Promise<RegRow> {
    const r = (await this.db.registration.findFirst({
      where: { id: registrationId, instanceId, status: { in: DESK_STATUSES } },
      select: REG_SELECT,
    })) as RegRow | null;
    if (!r) throw new NotFoundException('Nie ma takiego zgłoszenia w tym wydarzeniu.');
    return r;
  }

  private async card(instanceId: string, registrationId: string, actor: DeskActor) {
    const r = await this.regOf(instanceId, registrationId);
    let cfg: PricingConfig | null = null;
    let paid = 0;
    if (actor.scopes.includes('payments')) {
      const inst = await this.db.eventInstance.findUnique({ where: { id: instanceId }, select: { pricingConfig: true } });
      cfg = (inst?.pricingConfig ?? null) as PricingConfig | null;
      paid = (await this.paymentPlan.paidMap({ id: registrationId })).get(registrationId)?.paid ?? 0;
    }
    return this.toDesk(r, cfg, paid, actor.scopes, warsawDate());
  }

  // ── Przyjazd ───────────────────────────────────────────────────────────────

  async setCheckIn(instanceId: string, registrationId: string, present: boolean, actor: DeskActor) {
    const r = await this.regOf(instanceId, registrationId);
    if (present && !r.checkedInAt) {
      await this.db.registration.update({ where: { id: r.id }, data: { checkedInAt: new Date(), checkedInBy: actor.email } });
      await this.log(instanceId, r.id, 'CHECK_IN', actor.email);
    } else if (!present && r.checkedInAt) {
      await this.db.registration.update({ where: { id: r.id }, data: { checkedInAt: null, checkedInBy: null } });
      await this.log(instanceId, r.id, 'CHECK_IN_UNDO', actor.email, { was: iso(r.checkedInAt), by: r.checkedInBy });
    }
    return this.card(instanceId, registrationId, actor);
  }

  // ── Klucz ──────────────────────────────────────────────────────────────────

  async setKey(instanceId: string, registrationId: string, action: string, actor: DeskActor) {
    const r = await this.regOf(instanceId, registrationId);
    const now = new Date();
    if (action === 'issue') {
      if (!r.keyIssuedAt || r.keyReturnedAt) {
        // ponowne wydanie po zwrocie zaczyna nowy obieg klucza
        await this.db.registration.update({ where: { id: r.id }, data: { keyIssuedAt: now, keyIssuedBy: actor.email, keyReturnedAt: null, keyReturnedBy: null } });
        await this.log(instanceId, r.id, 'KEY_ISSUE', actor.email);
      }
    } else if (action === 'return') {
      if (!r.keyIssuedAt) throw new BadRequestException('Klucz nie został wydany.');
      if (!r.keyReturnedAt) {
        await this.db.registration.update({ where: { id: r.id }, data: { keyReturnedAt: now, keyReturnedBy: actor.email } });
        await this.log(instanceId, r.id, 'KEY_RETURN', actor.email);
      }
    } else if (action === 'undo-issue') {
      if (r.keyReturnedAt) throw new BadRequestException('Klucz jest już zwrócony — najpierw cofnij zwrot.');
      if (r.keyIssuedAt) {
        await this.db.registration.update({ where: { id: r.id }, data: { keyIssuedAt: null, keyIssuedBy: null } });
        await this.log(instanceId, r.id, 'KEY_ISSUE_UNDO', actor.email, { was: iso(r.keyIssuedAt), by: r.keyIssuedBy });
      }
    } else if (action === 'undo-return') {
      if (r.keyReturnedAt) {
        await this.db.registration.update({ where: { id: r.id }, data: { keyReturnedAt: null, keyReturnedBy: null } });
        await this.log(instanceId, r.id, 'KEY_RETURN_UNDO', actor.email, { was: iso(r.keyReturnedAt), by: r.keyReturnedBy });
      }
    } else {
      throw new BadRequestException('Nieznana akcja klucza.');
    }
    return this.card(instanceId, registrationId, actor);
  }

  // ── Wpłaty ─────────────────────────────────────────────────────────────────

  /** Wpłaty zgłoszenia w kształcie recepcji (bez nadawcy / tytułu przelewu z wyciągu). */
  async payments(instanceId: string, registrationId: string) {
    await this.regOf(instanceId, registrationId);
    const res = await this.paymentPlan.paymentsOf(registrationId);
    return {
      registrationId,
      payments: res.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        method: p.method,
        paidAt: p.paidAt,
        note: p.note,
        by: p.by,
        /** cofnąć można tylko wpłatę wpisaną ręcznie / z importu (i tylko pełny admin) */
        voidable: p.status === 'PAID' && (p.provider === 'panel' || p.provider === 'bank-import'),
      })),
    };
  }

  async addPayment(
    instanceId: string,
    registrationId: string,
    dto: { amount?: unknown; method?: string; note?: string; clientId?: string },
    actor: DeskActor,
  ) {
    const before = await this.card(instanceId, registrationId, { ...actor, scopes: [...actor.scopes, 'payments'] });
    const method = dto?.method === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : dto?.method === 'CASH' ? 'CASH' : null;
    if (!method) throw new BadRequestException('Wybierz metodę: gotówka albo przelew.');
    const amount = round2(num(typeof dto.amount === 'string' ? dto.amount.replace(',', '.') : dto.amount));
    if (!(amount > 0)) throw new BadRequestException('Podaj kwotę wpłaty większą od zera.');
    // Pomocnik nie zaksięguje więcej, niż zostało do zapłaty (nadpłatę wpisuje admin w panelu).
    if (!actor.full && amount > (before.money?.remaining ?? 0) + 0.005) {
      throw new BadRequestException('Kwota jest większa niż pozostało do zapłaty.');
    }
    // Identyfikator z urządzenia chroni przed podwójnym zaksięgowaniem (ponowienie przy słabym internecie).
    const clientId = /^[A-Za-z0-9_-]{8,64}$/.test(String(dto.clientId ?? '')) ? `desk:${dto.clientId}` : undefined;
    const res = await this.paymentPlan.addPayment(
      registrationId,
      { amount, method, note: dto.note ? String(dto.note).trim() : undefined, externalId: clientId },
      actor.email,
    );
    if (!res.duplicate) await this.log(instanceId, registrationId, 'PAYMENT_ADD', actor.email, { paymentId: res.paymentId, amount, method });
    return this.card(instanceId, registrationId, actor);
  }

  /** Cofnięcie błędnej wpłaty — tylko pełny admin (guard), wpłata musi należeć do eventu z adresu. */
  async voidPayment(instanceId: string, paymentId: string, actor: DeskActor) {
    if (!actor.full) throw new ForbiddenException('Brak uprawnień do tej akcji.');
    const p = (await this.db.payment.findFirst({
      where: { id: paymentId, registration: { instanceId } },
      select: { id: true, registrationId: true, amount: true },
    })) as { id: string; registrationId: string; amount: unknown } | null;
    if (!p) throw new NotFoundException('Nie ma takiej wpłaty w tym wydarzeniu.');
    await this.paymentPlan.voidPayment(paymentId, actor.email);
    await this.log(instanceId, p.registrationId, 'PAYMENT_VOID', actor.email, { paymentId, amount: num(p.amount) });
    return this.card(instanceId, p.registrationId, actor);
  }

  // ── Prośby dodatkowe ───────────────────────────────────────────────────────

  async addRequest(instanceId: string, registrationId: string, dto: { kind?: string; participantId?: string | null; note?: string }, actor: DeskActor) {
    const r = await this.regOf(instanceId, registrationId);
    const kind = String(dto?.kind ?? '');
    if (!(DESK_REQUEST_KINDS as readonly string[]).includes(kind)) throw new BadRequestException('Wybierz rodzaj prośby.');
    const note = String(dto?.note ?? '').trim().slice(0, 500);
    if (!note && kind !== 'EXTRA_BED') throw new BadRequestException('Opisz prośbę w notatce.');
    const participantId = dto?.participantId ? String(dto.participantId) : null;
    if (participantId && !r.participants.some((p) => p.id === participantId)) throw new BadRequestException('Ta osoba nie należy do zgłoszenia.');
    const created = await this.db.registrationRequest.create({
      data: { registrationId: r.id, participantId, kind, note, status: 'OPEN', createdBy: actor.email },
    });
    await this.log(instanceId, r.id, 'REQUEST_ADD', actor.email, { requestId: created.id, kind });
    return this.card(instanceId, registrationId, actor);
  }

  async setRequestStatus(instanceId: string, requestId: string, status: string, actor: DeskActor) {
    if (status !== 'OPEN' && status !== 'DONE') throw new BadRequestException('Nieznany status prośby.');
    const q = (await this.db.registrationRequest.findFirst({
      where: { id: requestId, registration: { instanceId } },
      select: { id: true, registrationId: true, status: true },
    })) as { id: string; registrationId: string; status: string } | null;
    if (!q) throw new NotFoundException('Nie ma takiej prośby w tym wydarzeniu.');
    if (q.status !== status) {
      await this.db.registrationRequest.update({
        where: { id: q.id },
        data: status === 'DONE' ? { status, resolvedBy: actor.email, resolvedAt: new Date() } : { status, resolvedBy: null, resolvedAt: null },
      });
      await this.log(instanceId, q.registrationId, status === 'DONE' ? 'REQUEST_DONE' : 'REQUEST_REOPEN', actor.email, { requestId });
    }
    return this.card(instanceId, q.registrationId, actor);
  }
}
