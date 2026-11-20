import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CourseAccessService } from '../courses/course-access.service';
import { PricingService } from '../pricing/pricing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { buildIcs, googleCalendarUrl } from '../shared';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { v4 as uuid } from 'uuid';
import { guestInviteConfig, guestInvitePageLink, publicAppUrl } from '../invitations/guest-invite-config';
import { buildPriceInput, hasAccommodation, roomLabel, leaderDepositSplit, PricingConfig, PriceAdjustment } from '../shared';
import type { MailAccommodation } from '../notifications/notifications.service';
import { assertRoomStock, instanceRoomAvailability } from './room-stock';
import { LeadsService } from './leads.service';

type RoomsInput = Array<{ roomId: string; participantIndexes: number[] }>;

/** Ręczna korekta ceny od admina — tylko znane pola, liczby nieujemne; null = brak korekty. */
function cleanAdjustment(raw: unknown): PriceAdjustment | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const a = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const out: PriceAdjustment = {};
  const pct = num(a.discountPct);
  if (pct) out.discountPct = Math.min(100, pct);
  const amt = num(a.discountAmount);
  if (amt) out.discountAmount = amt;
  const ov = num(a.overrideTotal);
  if (ov !== undefined && a.overrideTotal !== null) out.overrideTotal = ov;
  if (typeof a.note === 'string' && a.note.trim()) out.note = a.note.trim().slice(0, 500);
  return Object.keys(out).length ? out : undefined;
}

/** Opcje z zapisanego zgłoszenia (transport, pościel, ręczna korekta). */
function storedOptions(optionsJson: unknown): { transport: boolean; bedding: boolean; adjustment?: PriceAdjustment } {
  const o = (optionsJson ?? {}) as { transport?: boolean; bedding?: boolean; adjustment?: unknown };
  const adjustment = cleanAdjustment(o.adjustment);
  return { transport: !!o.transport, bedding: !!o.bedding, ...(adjustment ? { adjustment } : {}) };
}

/** Link do strony zgłoszenia gościa (zmiana / domówienie noclegu). */
export function manageRegistrationLink(editToken: string): string {
  return `${publicAppUrl()}/z/${editToken}`;
}

/**
 * Czyści skład pokoi: tylko znane typy pokoi, indeksy w zakresie, każda osoba w jednym
 * pokoju, bez pustych pokoi. Zwraca też, ile osób zostało bez noclegu.
 */
function normalizeRooms(rooms: RoomsInput | undefined, n: number, cfg: PricingConfig | null): RoomsInput {
  const known = new Set((cfg?.rooms ?? []).map((r) => r.id));
  const used = new Set<number>();
  const out: RoomsInput = [];
  for (const r of rooms ?? []) {
    if (!r || typeof r.roomId !== 'string') continue;
    if (known.size > 0 && !known.has(r.roomId)) throw new BadRequestException(`Nieznany typ pokoju: ${r.roomId}`);
    const idx: number[] = [];
    for (const i of Array.isArray(r.participantIndexes) ? r.participantIndexes : []) {
      if (!Number.isInteger(i) || i < 0 || i >= n || used.has(i)) continue;
      used.add(i);
      idx.push(i);
    }
    if (idx.length) out.push({ roomId: r.roomId, participantIndexes: idx });
  }
  return out;
}

/** Walidacja noclegu wg ustawień eventu (nocleg obowiązkowy → każdy w pokoju; pojemność). */
function assertRooms(rooms: RoomsInput, n: number, cfg: PricingConfig | null) {
  if (!cfg || !hasAccommodation(cfg)) return;
  for (const r of rooms) {
    const def = cfg.rooms.find((x) => x.id === r.roomId);
    if (def && r.participantIndexes.length > def.cap) {
      throw new BadRequestException(`Pokój „${roomLabel(def.name)}" mieści maks. ${def.cap} os.`);
    }
  }
  if (!cfg.accommodationOptional) {
    const assigned = rooms.reduce((s, r) => s + r.participantIndexes.length, 0);
    if (assigned < n) throw new BadRequestException('Każdy uczestnik musi mieć przypisany pokój.');
  }
}

/** Podsumowanie noclegu do maili. */
/** Język maili: PL dla PL, angielski dla każdego innego języka gościa (EN/IT/KO/ZH). */
export const mailLang = (locale: string | null | undefined): 'pl' | 'en' => (locale === 'pl' || !locale ? 'pl' : 'en');

/** Tytuł eventu w języku `lng`; brak → EN (dla gości spoza PL), potem PL. */
export function titleFor(title: unknown, lng: string | null | undefined): string {
  if (typeof title === 'string') return title;
  const m = (title ?? {}) as Record<string, string>;
  const l = (lng || 'pl').slice(0, 2);
  const order = l === 'pl' ? ['pl', 'en'] : [l, 'en', 'pl'];
  for (const k of order) if (m[k]?.trim()) return m[k];
  return Object.values(m).find((v) => typeof v === 'string' && v.trim()) ?? '';
}

export function mailAccommodation(cfg: PricingConfig | null, rooms: RoomsInput, n: number, lng: string): MailAccommodation {
  const assigned = rooms.reduce((s, r) => s + r.participantIndexes.length, 0);
  return {
    offered: hasAccommodation(cfg),
    nights: cfg?.nights ?? 0,
    rooms: rooms.map((r) => ({
      name: roomLabel(cfg?.rooms.find((x) => x.id === r.roomId)?.name ?? r.roomId, lng),
      people: r.participantIndexes.length,
    })),
    withoutRoom: Math.max(0, n - assigned),
  };
}
import {
  mapRegStatus,
  mapPaymentStatus,
  mapPaymentMethod,
  mapGender,
  mapParticipantType,
  contractStatusFilter,
  num,
  iso,
} from '../admin/personal-os.mapper';

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly notifications: NotificationsService,
    private readonly courseAccess: CourseAccessService,
    private readonly leads: LeadsService,
  ) {}

  async create(dto: CreateRegistrationDto) {
    const instance = await this.prisma.eventInstance.findUnique({
      where: { id: dto.instanceId },
      include: { series: { include: { page: true } } },
    });
    if (!instance) throw new NotFoundException('Event instance not found');
    if (instance.status !== 'OPEN') {
      throw new ForbiddenException('Zapisy na to wydarzenie są już zamknięte.');
    }

    // Event „na zaproszenie": udział potwierdza się wyłącznie zaproszeniem (link /i/:token
    // albo dopasowanie danych do listy gości). Zwykła rejestracja jest zabroniona także
    // na poziomie API — samo ukrycie formularza w UI to nie jest zabezpieczenie.
    const seriesType = (instance.series as { type?: string })?.type;
    if (seriesType === 'INVITE') {
      throw new ForbiddenException(
        'To jest wydarzenie tylko dla zaproszonych gości — rejestracja odbywa się przez osobisty link z zaproszenia.',
      );
    }

    // Pokoje (nocleg) — przy noclegu opcjonalnym osoby bez pokoju płacą formację + wyżywienie.
    const cfg = (instance.pricingConfig ?? null) as unknown as PricingConfig | null;

    // Zaliczka u lidera: tylko gdy event ją włączył i gość wybrał wspólnotę z listy (nie „Inna").
    if (dto.paymentMethod === 'LEADER_DEPOSIT') {
      const allowed = ((instance as { paymentMethods?: string[] }).paymentMethods ?? []).includes('LEADER_DEPOSIT');
      const c = dto.contact as unknown as { community?: string; communityOther?: boolean };
      if (!allowed) throw new BadRequestException('Zaliczka u lidera nie jest dostępna dla tego wydarzenia.');
      if (!c.community?.trim() || c.communityOther) {
        throw new BadRequestException('Zaliczka u lidera jest dostępna tylko dla członków wspólnot z listy ICPE.');
      }
    }
    const n = dto.participants.length;
    const rooms = normalizeRooms(dto.rooms, n, cfg);
    assertRooms(rooms, n, cfg);
    // Limit pokoi: nie przyjmujemy zgłoszenia na wyczerpany typ pokoju (409).
    await assertRoomStock(this.prisma, dto.instanceId, cfg, rooms);
    const priceInput = buildPriceInput(
      dto.participants.map((p) => ({ type: p.type, age: p.age ?? 0 })),
      rooms,
      // Gość nie może sam ustawić korekty ceny — tylko transport/pościel.
      { transport: !!dto.options?.transport, bedding: !!dto.options?.bedding },
      dto.discountCode,
    );

    // Cena wiążąca — obliczona server-side na podstawie config eventu (lub DEFAULT_PRICING)
    const priceResult = await this.pricing.quote(priceInput, dto.instanceId);

    const editToken = uuid();

    const registration = await this.prisma.registration.create({
      data: {
        instanceId: dto.instanceId,
        locale: dto.locale,
        contact: dto.contact as object,
        // roomsJson — skład pokoi (nowy model kompozycji); pole dodane do schematu Prisma
        ...(({ roomsJson: rooms as unknown }) as { roomsJson: unknown }),
        optionsJson: { transport: !!dto.options?.transport, bedding: !!dto.options?.bedding } as unknown,
        discountCode: dto.discountCode,
        dietaryNotes: dto.dietaryNotes,
        totalPrice: priceResult.total,
        currency: priceResult.currency,
        paymentMethod: dto.paymentMethod,
        editToken,
        status: dto.paymentMethod === 'ONLINE' ? 'PENDING_PAYMENT' : 'AWAITING_TRANSFER',
        participants: {
          create: dto.participants.map(p => ({
            type: p.type === 'adult' ? 'ADULT' : 'CHILD' as 'ADULT' | 'CHILD',
            firstName: p.firstName,
            lastName: p.lastName ?? '',
            age: p.age,
            gender: (p.gender === 'F' ? 'FEMALE' : p.gender === 'M' ? 'MALE' : 'OTHER') as 'MALE' | 'FEMALE' | 'OTHER',
            dietary: p.dietary,
          })),
        },
      } as any,
      include: { participants: true },
    });

    // Rejestracja z osobistego zaproszenia (gość dodany przez uczestnika lub admina na zwykłym
    // evencie): spinamy zaproszenie ze zgłoszeniem, żeby lista gości pokazała „zarejestrowany".
    // Nieważny token nie blokuje zapisu — zgłoszenie jest ważne samo w sobie.
    let isParticipantGuest = false;
    if (dto.invitationToken) {
      try {
        const inv = await this.prisma.invitation.findUnique({ where: { token: dto.invitationToken } });
        const rec = inv as unknown as {
          id: string; instanceId: string; registrationId: string | null; confirmedAt: Date | null;
          invitedByInvitationId?: string | null; invitedByRegistrationId?: string | null;
        } | null;
        if (rec && rec.instanceId === dto.instanceId && !rec.registrationId) {
          await this.prisma.invitation.update({
            where: { id: rec.id },
            data: { registrationId: registration.id, confirmedAt: rec.confirmedAt ?? new Date() } as never,
          });
        }
        isParticipantGuest = !!(rec && (rec.invitedByInvitationId || rec.invitedByRegistrationId));
      } catch (e) {
        console.error('Linking invitation to registration failed:', (e as Error).message);
      }
    }

    // Link „Zaproś gościa" w mailu — gdy event ma włączoną tę ścieżkę, a zapisany sam nie jest
    // gościem innego uczestnika (bez łańcucha zaproszeń).
    const gi = guestInviteConfig(instance.series?.page?.customFields);
    const guestInviteLink = gi.enabled && !isParticipantGuest ? guestInvitePageLink(editToken) : undefined;

    // Send confirmation mail (fire-and-forget)
    const title = titleFor(instance.title, mailLang(dto.locale)) || 'Event';
    this.notifications.sendConfirmation({
      to: (dto.contact as { email: string }).email,
      locale: dto.locale,
      registrationId: registration.id,
      eventTitle: title,
      startsAt: instance.startsAt,
      totalPrice: priceResult.total,
      currency: priceResult.currency,
      paymentMethod: dto.paymentMethod,
      editToken,
      guestInviteLink,
      leaderDepositPct: cfg?.leaderDepositPct,
      accommodation: mailAccommodation(cfg, rooms, n, mailLang(dto.locale)),
      manageLink: hasAccommodation(cfg) ? manageRegistrationLink(editToken) : undefined,
    }).catch(console.error);

    // Formacja online: kurs z `grantOn = ANY_ACTIVE` daje dostęp już od zapisu.
    this.courseAccess.syncRegistrationSafe(registration.id);

    // Rozpoczęte zgłoszenie (lead) → dokończone: bez przypomnienia.
    void this.leads.markConverted(dto.instanceId, (dto.contact as { email: string }).email, registration.id);

    return {
      registration: this.mapToDto(registration),
      summary: priceResult,
      // Front pokazuje przycisk „Zaproś gościa" na ekranie sukcesu tylko, gdy to true.
      canInviteGuests: !!guestInviteLink,
      payment:
        dto.paymentMethod === 'BANK_TRANSFER'
          ? { method: 'BANK_TRANSFER', transferTitle: `REG-${registration.id}` }
          : dto.paymentMethod === 'CASH'
            ? { method: 'CASH', note: 'Płatność gotówką na miejscu' }
            : dto.paymentMethod === 'LEADER_DEPOSIT'
              ? { method: 'LEADER_DEPOSIT', ...leaderDepositSplit(priceResult.total, cfg) }
            : { method: 'ONLINE', registrationId: registration.id },
    };
  }

  /**
   * Edycja zgłoszenia przez admina (Personal OS / panel). Przyjmuje pełny nowy skład
   * (kontakt, uczestnicy, pokoje, opcje) i PONOWNIE przelicza cenę. Podmienia uczestników,
   * aktualizuje roomsJson, totalPrice i ewentualną płatność PENDING. Nie zmienia statusu ani
   * metody płatności.
   */
  async adminUpdate(id: string, dto: {
    contact?: Record<string, unknown>;
    participants: Array<{ type: 'adult' | 'child'; firstName: string; lastName?: string; age?: number; gender?: string; dietary?: string }>;
    rooms: Array<{ roomId: string; participantIndexes: number[] }>;
    options?: { transport?: boolean; bedding?: boolean; adjustment?: unknown };
    discountCode?: string;
    dietaryNotes?: string | null;
    locale?: string;
    /** Pokoje z puli zarezerwowanej dla gości specjalnych (nie zmniejszają puli publicznej). */
    roomsReserved?: boolean;
  }) {
    const reg = await this.prisma.registration.findUnique({ where: { id }, include: { instance: { select: { pricingConfig: true } } } });
    if (!reg) throw new NotFoundException('Registration not found');

    // Opcje + ręczna korekta ceny (rabat % / kwotowy / kwota końcowa) — tylko z panelu admina.
    const adj = cleanAdjustment(dto.options?.adjustment);
    const adminOptions = { transport: !!dto.options?.transport, bedding: !!dto.options?.bedding, ...(adj ? { adjustment: adj } : {}) };
    // Admin może zostawić osoby bez pokoju (np. ktoś zrezygnował z noclegu) — bez blokady.
    const cfg = ((reg as { instance?: { pricingConfig?: unknown } }).instance?.pricingConfig ?? null) as PricingConfig | null;
    const rooms = normalizeRooms(dto.rooms, dto.participants.length, cfg);
    const priceInput = buildPriceInput(
      dto.participants.map((pp) => ({ type: pp.type, age: pp.age ?? 0 })),
      rooms,
      adminOptions,
      dto.discountCode,
    );
    const priceResult = await this.pricing.quote(priceInput, reg.instanceId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = this.prisma;
    await this.prisma.$transaction([
      // Fizyczne przydziały pokoi i uczestnicy są tworzeni od nowa.
      p.roomAssignment.deleteMany({ where: { registrationId: id } }),
      p.participant.deleteMany({ where: { registrationId: id } }),
      p.payment.updateMany({
        where: { registrationId: id, status: 'PENDING' },
        data: { amount: priceResult.total, currency: priceResult.currency },
      }),
      p.registration.update({
        where: { id },
        data: {
          // Scalamy z istniejącym kontaktem — formularz admina edytuje tylko część pól
          // (adres, parafia, wspólnota zostają).
          ...(dto.contact ? { contact: { ...((reg.contact ?? {}) as object), ...dto.contact } as object } : {}),
          ...(dto.locale ? { locale: dto.locale } : {}),
          roomsJson: rooms as unknown,
          ...(typeof dto.roomsReserved === 'boolean' ? { roomsReserved: dto.roomsReserved } : {}),
          optionsJson: adminOptions as unknown,
          discountCode: dto.discountCode ?? null,
          dietaryNotes: dto.dietaryNotes ?? null,
          totalPrice: priceResult.total,
          currency: priceResult.currency,
          participants: {
            create: dto.participants.map((pp) => ({
              type: (pp.type === 'adult' ? 'ADULT' : 'CHILD') as 'ADULT' | 'CHILD',
              firstName: pp.firstName,
              lastName: pp.lastName ?? '',
              age: pp.age,
              gender: (pp.gender === 'F' ? 'FEMALE' : pp.gender === 'M' ? 'MALE' : 'OTHER') as 'MALE' | 'FEMALE' | 'OTHER',
              dietary: pp.dietary,
            })),
          },
        },
      }),
    ]);

    const updated = await this.prisma.registration.findUnique({ where: { id }, include: { participants: true } });
    if (!updated) throw new NotFoundException('Registration not found');
    this.courseAccess.syncRegistrationSafe(id); // mógł się zmienić e-mail
    return { registration: this.mapToDto(updated), summary: priceResult };
  }

  // ── Strona zgłoszenia gościa (/z/:token): podgląd + zmiana / domówienie noclegu ─────────

  /** Dlaczego gość nie może sam zmienić noclegu (null = może). */
  private accommodationLock(reg: { status: string }, instance: { status: string; startsAt: Date }, cfg: PricingConfig | null): string | null {
    if (!hasAccommodation(cfg)) return 'NO_ACCOMMODATION';
    if (reg.status === 'CANCELLED') return 'CANCELLED';
    // Opłacone (przelew/online) — zmiana kwoty wymaga rozliczenia z organizatorem.
    if (reg.status === 'CONFIRMED') return 'PAID';
    if (instance.status !== 'OPEN') return 'CLOSED';
    if (instance.startsAt.getTime() <= Date.now()) return 'STARTED';
    return null;
  }

  private async loadByToken(token: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { editToken: token },
      include: {
        participants: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        instance: { include: { series: { include: { page: true } } } },
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    return reg;
  }

  async getByManageToken(token: string) {
    const reg = await this.loadByToken(token);
    const inst = reg.instance;
    const cfg = (inst.pricingConfig ?? null) as unknown as PricingConfig | null;
    const page = inst.series?.page as { slug?: string; locales?: unknown; theme?: unknown } | null | undefined;
    const c = (reg.contact ?? {}) as { firstName?: string; lastName?: string; email?: string };
    const n = reg.participants.length;
    const rooms = normalizeRooms((reg.roomsJson ?? []) as RoomsInput, n, null);
    return {
      id: reg.id,
      status: reg.status,
      locale: reg.locale,
      contact: { firstName: c.firstName ?? '', lastName: c.lastName ?? '', email: c.email ?? '' },
      participants: reg.participants.map((p: { type: string; firstName: string; lastName: string | null; age: number | null }) => ({
        type: p.type === 'ADULT' ? 'adult' : 'child',
        name: `${p.firstName} ${p.lastName ?? ''}`.trim(),
        age: p.age ?? 0,
      })),
      rooms,
      options: storedOptions(reg.optionsJson),
      discountCode: reg.discountCode ?? undefined,
      totalPrice: parseFloat(reg.totalPrice.toString()),
      currency: reg.currency,
      paymentMethod: reg.paymentMethod ?? undefined,
      event: {
        title: inst.title,
        startsAt: inst.startsAt.toISOString(),
        endsAt: inst.endsAt?.toISOString() ?? null,
        location: inst.location ?? null,
        slug: page?.slug ?? null,
        locales: page?.locales ?? null,
        theme: page?.theme ?? null,
      },
      pricing: cfg,
      // Wolne pokoje dla TEGO zgłoszenia (jego własne pokoje wracają do puli).
      // Gość specjalny (pokoje z rezerwy) — bez ograniczeń puli publicznej.
      roomAvailability: (reg as { roomsReserved?: boolean }).roomsReserved
        ? {}
        : await instanceRoomAvailability(this.prisma, reg.instanceId, cfg, reg.id),
      lock: this.accommodationLock(reg, inst, cfg),
    };
  }

  async updateAccommodationByToken(token: string, dto: { rooms: RoomsInput }) {
    const reg = await this.loadByToken(token);
    const inst = reg.instance;
    const cfg = (inst.pricingConfig ?? null) as unknown as PricingConfig | null;
    const lock = this.accommodationLock(reg, inst, cfg);
    if (lock) throw new ForbiddenException(`Nocleg nie może być teraz zmieniony (${lock}). Skontaktuj się z organizatorem.`);

    const n = reg.participants.length;
    const rooms = normalizeRooms(dto.rooms, n, cfg);
    assertRooms(rooms, n, cfg);
    // Gość specjalny (pokoje z rezerwy) nie jest ograniczany pulą publiczną.
    if (!(reg as { roomsReserved?: boolean }).roomsReserved) {
      await assertRoomStock(this.prisma, reg.instanceId, cfg, rooms, reg.id);
    }
    const people = reg.participants.map((p: { type: string; age: number | null }) => ({ type: (p.type === 'ADULT' ? 'adult' : 'child') as 'adult' | 'child', age: p.age ?? 0 }));
    // Zachowujemy ręczną korektę admina (rabat / kwota ustalona z gościem).
    const priceResult = await this.pricing.quote(
      buildPriceInput(people, rooms, storedOptions(reg.optionsJson), reg.discountCode ?? undefined),
      reg.instanceId,
    );
    const before = normalizeRooms((reg.roomsJson ?? []) as RoomsInput, n, null);
    const oldTotal = parseFloat(reg.totalPrice.toString());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = this.prisma;
    await this.prisma.$transaction([
      p.payment.updateMany({
        where: { registrationId: reg.id, status: 'PENDING' },
        data: { amount: priceResult.total, currency: priceResult.currency },
      }),
      p.registration.update({
        where: { id: reg.id },
        data: { roomsJson: rooms as unknown, totalPrice: priceResult.total, currency: priceResult.currency },
      }),
    ]);

    const titleMap = inst.title as Record<string, string>;
    const c = (reg.contact ?? {}) as { firstName?: string; lastName?: string; email?: string };
    if (c.email) {
      this.notifications.sendAccommodationChanged({
        to: c.email,
        locale: reg.locale,
        registrationId: reg.id,
        eventTitle: titleFor(titleMap, mailLang(reg.locale)) || 'Event',
        totalPrice: priceResult.total,
        oldTotal,
        currency: priceResult.currency,
        paymentMethod: reg.paymentMethod ?? 'BANK_TRANSFER',
        accommodation: mailAccommodation(cfg, rooms, n, mailLang(reg.locale)),
        before: mailAccommodation(cfg, before, n, 'pl'),
        manageLink: manageRegistrationLink(reg.editToken),
        leaderDepositPct: cfg?.leaderDepositPct,
        guestName: `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
      }).catch(console.error);
    }
    return this.getByManageToken(token);
  }

  async findById(id: string, token?: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include: { participants: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 }, assignments: { include: { room: { include: { roomType: true } } } } },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (token && reg.editToken !== token) throw new ForbiddenException('Invalid token');
    return this.mapToDto(reg);
  }

  async update(id: string, token: string, dto: Partial<CreateRegistrationDto>) {
    const reg = await this.prisma.registration.findUnique({ where: { id } });
    if (!reg) throw new NotFoundException();
    if (reg.editToken !== token) throw new ForbiddenException('Invalid token');
    if (['CONFIRMED', 'CANCELLED'].includes(reg.status)) {
      throw new BadRequestException('Cannot edit registration in current status');
    }

    const updated = await this.prisma.registration.update({
      where: { id },
      data: {
        locale: dto.locale ?? reg.locale,
        contact: dto.contact ? { ...((reg.contact ?? {}) as object), ...dto.contact } as object : reg.contact as object,
        dietaryNotes: dto.dietaryNotes ?? reg.dietaryNotes ?? undefined,
      },
      include: { participants: true, payments: true },
    });
    this.courseAccess.syncRegistrationSafe(id);
    return this.mapToDto(updated);
  }

  async getIcs(id: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include: { instance: true },
    });
    if (!reg) throw new NotFoundException();
    const title = titleFor(reg.instance.title, reg.locale) || 'ICPE Event';
    return buildIcs({
      uid: `reg-${id}@icpemission.pl`,
      title,
      startsAt: reg.instance.startsAt,
      endsAt: reg.instance.endsAt,
      location: reg.instance.location ?? undefined,
      details: `Zgłoszenie REG-${id}`,
    });
  }

  async getGoogleCalendarUrl(id: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include: { instance: true },
    });
    if (!reg) throw new NotFoundException();
    const title = titleFor(reg.instance.title, reg.locale) || 'ICPE Event';
    return googleCalendarUrl({
      uid: `reg-${id}@icpemission.pl`,
      title,
      startsAt: reg.instance.startsAt,
      endsAt: reg.instance.endsAt,
      location: reg.instance.location ?? undefined,
      details: `Zgłoszenie REG-${id}`,
    });
  }

  async listForInstance(instanceId: string, status?: string, q?: string) {
    const statusSet = status ? contractStatusFilter(status) : undefined;
    // Mapa id pokoju → nazwa (z cennika instancji) do podsumowania pokoi w zgłoszeniu.
    const instance = await this.prisma.eventInstance.findUnique({
      where: { id: instanceId },
      select: { pricingConfig: true },
    });
    const roomNames = new Map<string, string>();
    const pcRooms =
      ((instance?.pricingConfig as { rooms?: Array<{ id: unknown; name: unknown }> })?.rooms) ?? [];
    // Nazwa pokoju może być stringiem (legacy) lub mapą { pl, en, it } → dla Personal OS bierzemy PL.
    const resolveName = (n: unknown): string => {
      if (n && typeof n === 'object') {
        const m = n as Record<string, string>;
        return m.pl ?? m.en ?? m.it ?? Object.values(m)[0] ?? '';
      }
      return String(n ?? '');
    };
    for (const r of pcRooms) roomNames.set(String(r.id), resolveName(r.name));

    const regs = await this.prisma.registration.findMany({
      where: {
        instanceId,
        ...(statusSet ? { status: { in: statusSet as never } } : {}),
        ...(q ? { OR: [
          { contact: { path: ['firstName'], string_contains: q } },
          { contact: { path: ['lastName'], string_contains: q } },
          { contact: { path: ['email'], string_contains: q } },
        ] } : {}),
      },
      include: {
        participants: true,
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        assignments: { include: { room: true }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    return regs.map((r: Parameters<RegistrationsService['toContractRegistration']>[0]) =>
      this.toContractRegistration(r, roomNames),
    );
  }

  /** Mapowanie zgłoszenia → dokładny kontrakt Personal OS. */
  private toContractRegistration(
    reg: {
      id: string; instanceId: string; status: string; locale: string; contact: unknown;
      participants: Array<{ type: string; firstName: string; lastName: string; age: number | null; gender: string | null; dietary: string | null }>;
      preferredRoomTypeId?: string | null;
      roomsJson?: unknown;
      optionsJson?: unknown;
      discountCode?: string | null;
      dietaryNotes?: string | null;
      totalPrice: { toString(): string }; currency: string; paymentMethod?: string | null;
      checkedInAt?: Date | null;
      roomLabel?: string | null;
      roomNote?: string | null;
      roomsReserved?: boolean | null;
      createdAt: Date;
      payments?: Array<{ status: string }>;
      assignments?: Array<{ room?: { label: string } | null }>;
    },
    roomNames?: Map<string, string>,
  ) {
    const c = (reg.contact ?? {}) as { firstName?: string; lastName?: string; email?: string; phone?: string; address?: string; parish?: string; community?: string; communityOther?: boolean };
    // Skomponowane pokoje (roomsJson) → czytelne podsumowanie typów pokoi.
    const comp = (Array.isArray(reg.roomsJson) ? reg.roomsJson : []) as Array<{ roomId?: string }>;
    const summaryParts = comp
      .map((rb) => roomNames?.get(String(rb.roomId)) ?? (rb.roomId ? String(rb.roomId) : ''))
      .filter(Boolean);
    // Event z pokojami (mapa nazw niepusta) → osoby bez pokoju opisujemy jako „bez noclegu".
    const inRooms = (comp as Array<{ participantIndexes?: unknown }>).reduce(
      (s, rb) => s + (Array.isArray(rb.participantIndexes) ? rb.participantIndexes.length : 0),
      0,
    );
    const noRoomCount = Math.max(0, reg.participants.length - inRooms);
    if (roomNames && roomNames.size > 0 && noRoomCount > 0) {
      summaryParts.push(summaryParts.length ? `bez noclegu: ${noRoomCount} os.` : 'bez noclegu');
    }
    const roomSummary = summaryParts.join(', ') + (reg.roomsReserved && summaryParts.length ? ' (rezerwa gości specjalnych)' : '');
    return {
      id: reg.id,
      instanceId: reg.instanceId,
      status: mapRegStatus(reg.status),
      locale: reg.locale,
      contact: {
        firstName: c.firstName ?? '',
        lastName: c.lastName ?? '',
        email: c.email,
        phone: c.phone,
        // Pola dodatkowe formularza (puste → pominięte): adres, parafia, wspólnota.
        ...(c.address ? { address: c.address } : {}),
        ...(c.parish ? { parish: c.parish } : {}),
        ...(c.community ? { community: c.community, communityOther: !!c.communityOther } : {}),
      },
      participants: reg.participants.map((p) => ({
        type: mapParticipantType(p.type),
        firstName: p.firstName,
        lastName: p.lastName,
        age: p.age ?? undefined,
        gender: mapGender(p.gender),
        dietary: p.dietary ?? undefined,
      })),
      preferredRoomType: reg.preferredRoomTypeId ?? (roomSummary || undefined),
      assignedRoom: reg.assignments?.[0]?.room?.label ?? (roomSummary || undefined),
      roomSummary: roomSummary || undefined,
      // Ile osób jest bez noclegu (nocleg opcjonalny) — panel pokazuje „bez noclegu".
      withoutRoom: noRoomCount,
      totalPrice: num(reg.totalPrice),
      currency: reg.currency || 'EUR',
      paymentMethod: mapPaymentMethod(reg.paymentMethod),
      paymentStatus: mapPaymentStatus(reg.status, reg.payments?.[0]?.status),
      checkedInAt: reg.checkedInAt ? iso(reg.checkedInAt) : null,
      roomLabel: reg.roomLabel ?? null,
      roomNote: reg.roomNote ?? null,
      roomsReserved: !!reg.roomsReserved,
      createdAt: iso(reg.createdAt),
      // Do edycji przez admina: pełny skład pokoi + opcje + notatki.
      rooms: (Array.isArray(reg.roomsJson) ? reg.roomsJson : []) as Array<{ roomId: string; participantIndexes: number[] }>,
      options: storedOptions(reg.optionsJson),
      discountCode: reg.discountCode ?? undefined,
      dietaryNotes: reg.dietaryNotes ?? undefined,
    };
  }

  async updateStatus(id: string, status: string) {
    const updated = await this.prisma.registration.update({
      where: { id },
      data: { status: status as 'DRAFT' | 'PENDING_PAYMENT' | 'AWAITING_TRANSFER' | 'CONFIRMED' | 'WAITLIST' | 'CANCELLED' },
    });
    this.courseAccess.syncRegistrationSafe(id);
    return updated;
  }

  async markPaid(id: string) {
    await this.prisma.registration.update({ where: { id }, data: { status: 'CONFIRMED' } });
    this.courseAccess.syncRegistrationSafe(id);
    return this.prisma.payment.create({
      data: {
        registrationId: id,
        provider: 'manual',
        method: 'BANK_TRANSFER',
        amount: (await this.prisma.registration.findUniqueOrThrow({ where: { id } })).totalPrice,
        currency: 'PLN',
        status: 'PAID',
      },
    });
  }

  private mapToDto(reg: {
    id: string; instanceId: string; status: string; locale: string; contact: unknown;
    participants: Array<{ id: string; type: string; firstName: string; lastName: string; age: number | null; gender: string; dietary: string | null }>;
    preferredRoomTypeId?: string | null; dietaryNotes?: string | null;
    totalPrice: { toString(): string }; currency: string; paymentMethod?: string | null;
    editToken: string; createdAt: Date;
    payments?: Array<{ status: string }>;
    assignments?: Array<{ room?: { roomType?: { name: unknown } } }>;
  }) {
    const paymentStatus = reg.payments?.[0]?.status ?? (reg.status === 'AWAITING_TRANSFER' ? 'AWAITING_TRANSFER' : 'PENDING');
    return {
      id: reg.id,
      instanceId: reg.instanceId,
      status: reg.status,
      locale: reg.locale,
      contact: reg.contact,
      participants: reg.participants.map(p => ({
        id: p.id,
        type: p.type === 'ADULT' ? 'adult' : 'child',
        firstName: p.firstName,
        lastName: p.lastName,
        age: p.age ?? 0,
        gender: p.gender === 'FEMALE' ? 'F' : p.gender === 'MALE' ? 'M' : 'other',
        dietary: p.dietary ?? undefined,
      })),
      preferredRoomId: reg.preferredRoomTypeId ?? undefined,
      dietaryNotes: reg.dietaryNotes ?? undefined,
      totalPrice: parseFloat(reg.totalPrice.toString()),
      currency: reg.currency,
      paymentMethod: reg.paymentMethod ?? undefined,
      paymentStatus,
      editToken: reg.editToken,
      createdAt: reg.createdAt.toISOString(),
    };
  }
}
