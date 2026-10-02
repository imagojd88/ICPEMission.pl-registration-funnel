import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CourseAccessService } from '../courses/course-access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { guestInviteConfig, guestInvitePageLink, personalInviteLink } from './guest-invite-config';

/** Personalizacja maila z zaproszeniem — ustawiana w panelu per osoba. */
export interface MailPersonalization {
  mailSalutation?: string | null;
  mailNote?: string | null;
  mailSubject?: string | null;
  mailFormal?: boolean;
}

interface Invitee extends MailPersonalization {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

/** Przycięcie pól personalizacji do zapisu (undefined = bez zmiany). */
function mailData(p: MailPersonalization): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const clip = (v: string | null | undefined, n: number) => (v ?? '').trim().slice(0, n) || null;
  if (p.mailSalutation !== undefined) out.mailSalutation = clip(p.mailSalutation, 120);
  if (p.mailNote !== undefined) out.mailNote = clip(p.mailNote, 3000);
  if (p.mailSubject !== undefined) out.mailSubject = clip(p.mailSubject, 200);
  if (p.mailFormal !== undefined) out.mailFormal = p.mailFormal === true;
  return out;
}

/** Wpis dziecka w deklaracji gościa. `dietary` — wymagania żywieniowe dziecka (opcjonalne). */
export interface ChildEntry {
  firstName?: string;
  age: number;
  dietary?: string;
}

/**
 * Gospodarstwo domowe wpisywane przez admina („Dodaj jako potwierdzonego", „Potwierdź ręcznie",
 * „Edytuj skład"). Osoba główna (kontakt, link) + opcjonalny małżonek + dzieci.
 * Przy edycji istniejącego rekordu: `undefined` = bez zmian, `spouse: null` = bez małżonka.
 */
export interface HouseholdInput extends MailPersonalization {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dietaryNotes?: string | null;
  spouse?: { firstName?: string; lastName?: string; dietaryNotes?: string | null } | null;
  children?: ChildEntry[];
  adminNote?: string | null;
}

/** Konflikt przy dodawaniu potwierdzonych — panel pokazuje go adminowi do decyzji. */
export interface HouseholdConflict {
  /** Indeks gospodarstwa w żądaniu. */
  index: number;
  /**
   * SAME_PERSON_PENDING — ta osoba już jest na liście i czeka (albo odmówiła) → można potwierdzić istniejący rekord,
   * SAME_PERSON_CONFIRMED — ta osoba już jest potwierdzona → zamiast dodawać, edytuj jej skład,
   * SPOUSE_ON_LIST — małżonek ma osobny rekord albo jest w składzie innej rodziny (posiłki liczone podwójnie),
   * PERSON_IS_SPOUSE — osoba główna jest już małżonkiem w innej rodzinie.
   */
  kind: 'SAME_PERSON_PENDING' | 'SAME_PERSON_CONFIRMED' | 'SPOUSE_ON_LIST' | 'PERSON_IS_SPOUSE';
  existingId: string;
  label: string;
  /** true = rekord nie został dodany i bez decyzji admina nie zostanie (ignoreWarnings nie pomoże). */
  blocking: boolean;
}

export type DietStatus = 'PROVIDED' | 'NONE' | 'UNKNOWN';
export type InvitationStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED';

/** Payload deklaracji przy potwierdzeniu udziału (link imienny lub dopasowanie po danych). */
export interface ConfirmPayload {
  dietaryNotes?: string;
  spouseAttending?: boolean;
  spouseFirstName?: string;
  spouseLastName?: string;
  spouseDietaryNotes?: string;
  children?: ChildEntry[];
}

/** Wiersz zaproszenia w kształcie, jaki dostaje panel admina / Personal OS. */
export interface InvitationRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  token: string;
  link: string;
  confirmedAt: string | null;
  sentAt: string | null;
  dietaryNotes: string | null;
  spouseAttending: boolean | null;
  spouseFirstName: string | null;
  spouseLastName: string | null;
  spouseDietaryNotes: string | null;
  children: ChildEntry[];
  // Zgłoszenie (Registration) powiązane przy potwierdzeniu — null, gdy panel jeszcze nie zsynchronizowany.
  registrationId: string | null;
  // Ścieżka „uczestnik zaprasza gościa": kto dodał (null = admin).
  invitedByName: string | null;
  invitedByParticipant: boolean;
  // Link „Zaproś gościa" tej osoby (/g/:token) — tylko potwierdzeni, nie-goście, gdy ścieżka włączona.
  guestInviteLink: string | null;
  // Personalizacja maila (null/false = standardowa treść).
  mailSalutation: string | null;
  mailNote: string | null;
  mailSubject: string | null;
  mailFormal: boolean;
  /** PENDING / CONFIRMED / DECLINED — wyliczone z confirmedAt i declinedAt. */
  status: InvitationStatus;
  /** Kto potwierdził: GUEST (link/dopasowanie) albo ADMIN (panel). null = niepotwierdzone. */
  confirmedBy: 'GUEST' | 'ADMIN' | null;
  guestRespondedAt: string | null;
  declinedAt: string | null;
  /** Status diety rodziny (tylko potwierdzeni): PROVIDED / NONE (potwierdzone „bez wymagań") / UNKNOWN. */
  dietStatus: DietStatus | null;
  adminNote: string | null;
}

/** Kontekst eventu potrzebny do złożenia osobistego linku (zależy od typu eventu). */
export interface InviteLinkCtx {
  type?: string;
  slug?: string | null;
  guestInvitesEnabled?: boolean;
}

export type InvitationRecord = {
  id: string;
  instanceId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  token: string;
  confirmedAt: Date | null;
  sentAt: Date | null;
  dietaryNotes: string | null;
  spouseAttending: boolean | null;
  spouseFirstName: string | null;
  spouseLastName: string | null;
  spouseDietaryNotes: string | null;
  childrenJson: unknown;
  registrationId: string | null;
  invitedByInvitationId?: string | null;
  invitedByRegistrationId?: string | null;
  invitedByName?: string | null;
  mailSalutation?: string | null;
  mailNote?: string | null;
  mailSubject?: string | null;
  mailFormal?: boolean | null;
  confirmedBy?: string | null;
  guestRespondedAt?: Date | null;
  declinedAt?: Date | null;
  adminNote?: string | null;
};

/** Czy zaproszenie powstało w ścieżce „uczestnik zaprasza gościa". */
export function isParticipantGuest(r: {
  invitedByInvitationId?: string | null;
  invitedByRegistrationId?: string | null;
}): boolean {
  return !!(r.invitedByInvitationId || r.invitedByRegistrationId);
}

const norm = (s: string) => (s ?? '').trim().toLowerCase();

/** Waliduje/przycina listę dzieci z payloadu — patrz specyfikacja: max 12, wiek 0–25, imię max 60 znaków. */
function sanitizeChildren(children: ChildEntry[] | undefined): ChildEntry[] {
  if (!Array.isArray(children)) return [];
  const out: ChildEntry[] = [];
  for (const c of children) {
    if (out.length >= 12) break;
    const ageNum = Number(c?.age);
    if (!Number.isFinite(ageNum)) continue;
    const age = Math.min(25, Math.max(0, Math.round(ageNum)));
    const firstNameRaw = String(c?.firstName ?? '').trim().slice(0, 60);
    const dietaryRaw = String(c?.dietary ?? '').trim().slice(0, 300);
    out.push({ age, ...(firstNameRaw ? { firstName: firstNameRaw } : {}), ...(dietaryRaw ? { dietary: dietaryRaw } : {}) });
  }
  return out;
}

/** Zwraca dane do zapisu w Prisma dla deklaracji małżonka/dzieci — wspólne dla obu ścieżek potwierdzenia. */
function declarationData(payload: ConfirmPayload): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (payload.dietaryNotes !== undefined) data.dietaryNotes = clipText(payload.dietaryNotes, 500);
  if (payload.spouseAttending === undefined) {
    // Zapis samej diety (bez deklaracji składu) — skład zostaje, zmienia się tylko dieta małżonka.
    if (payload.spouseDietaryNotes !== undefined) data.spouseDietaryNotes = clipText(payload.spouseDietaryNotes, 500);
  } else {
    data.spouseAttending = payload.spouseAttending;
    if (payload.spouseAttending === true) {
      data.spouseFirstName = (payload.spouseFirstName ?? '').trim() || null;
      data.spouseLastName = (payload.spouseLastName ?? '').trim() || null;
      data.spouseDietaryNotes = clipText(payload.spouseDietaryNotes, 500);
    } else {
      // Zmiana deklaracji na „sam/sama" — nie zostawiamy w panelu danych po niedoszłym małżonku.
      data.spouseFirstName = null;
      data.spouseLastName = null;
      data.spouseDietaryNotes = null;
    }
  }
  if (payload.children !== undefined) data.childrenJson = sanitizeChildren(payload.children);
  return data;
}

function childrenOf(r: { childrenJson: unknown }): ChildEntry[] {
  return Array.isArray(r.childrenJson) ? (r.childrenJson as ChildEntry[]) : [];
}

/**
 * Notatka o dietach rodziny do `Registration.dietaryNotes`. Sama dieta osoby głównej → sam tekst
 * (jak dotąd); gdy diety ma więcej osób → „Jan: bez glutenu | Anna: wegetariańska | Ola: orzechy".
 */
export function composeDietaryNotes(rec: InvitationRecord): string | null {
  const parts: Array<[string, string]> = [];
  const guest = (rec.dietaryNotes ?? '').trim();
  if (guest) parts.push([rec.firstName, guest]);
  if (rec.spouseAttending === true) {
    const sd = (rec.spouseDietaryNotes ?? '').trim();
    if (sd) parts.push([(rec.spouseFirstName ?? '').trim() || 'Współmałżonek', sd]);
  }
  for (const c of childrenOf(rec)) {
    const cd = (c.dietary ?? '').trim();
    if (cd) parts.push([(c.firstName ?? '').trim() || `Dziecko (${c.age})`, cd]);
  }
  if (parts.length === 0) return null;
  if (parts.length === 1 && guest) return guest;
  return parts.map(([n, d]) => `${n}: ${d}`).join(' | ');
}

/** Przycięty tekst albo null (pusty). */
function clipText(v: unknown, n: number): string | null {
  return String(v ?? '').trim().slice(0, n) || null;
}

/** PENDING / CONFIRMED / DECLINED. */
export function invitationStatus(r: { confirmedAt: Date | null; declinedAt?: Date | null }): InvitationStatus {
  if (r.confirmedAt) return 'CONFIRMED';
  if (r.declinedAt) return 'DECLINED';
  return 'PENDING';
}

/** Kto potwierdził (null w bazie przy potwierdzonym = potwierdzenie sprzed wprowadzenia pola → gość). */
export function confirmedByOf(r: { confirmedAt: Date | null; confirmedBy?: string | null }): 'GUEST' | 'ADMIN' | null {
  if (!r.confirmedAt) return null;
  return r.confirmedBy === 'ADMIN' ? 'ADMIN' : 'GUEST';
}

/**
 * Status diety potwierdzonej rodziny — dla cateringu kluczowe jest odróżnienie
 * „nikt nie ma wymagań" (gość odpowiedział) od „nie wiemy" (potwierdził admin, gość milczy).
 */
export function dietStatusOf(r: InvitationRecord): DietStatus | null {
  if (!r.confirmedAt) return null;
  const anyDiet =
    !!(r.dietaryNotes ?? '').trim() ||
    (r.spouseAttending === true && !!(r.spouseDietaryNotes ?? '').trim()) ||
    childrenOf(r).some((c) => !!(c.dietary ?? '').trim());
  if (anyDiet) return 'PROVIDED';
  if (confirmedByOf(r) === 'ADMIN' && !r.guestRespondedAt) return 'UNKNOWN';
  return 'NONE';
}

/** Czy wydarzenie już się zaczęło — od tego momentu gość nie zmienia odpowiedzi. */
export function eventStarted(startsAt: Date, now = new Date()): boolean {
  return now.getTime() >= startsAt.getTime();
}

/** Klucz osoby do wykrywania duplikatów: „imię nazwisko" po normalizacji. */
const personKey = (first: string | null | undefined, last: string | null | undefined) =>
  `${norm(first ?? '')} ${norm(last ?? '')}`.trim();

/**
 * Dane Prisma z gospodarstwa wpisanego przez admina. `isNew` — nowy rekord: brakujące pola
 * składu oznaczają „brak" (sam/sama, bez dzieci, bez diety); przy edycji `undefined` = bez zmian.
 */
export function householdData(h: HouseholdInput, isNew: boolean): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (h.firstName !== undefined) data.firstName = String(h.firstName ?? '').trim().slice(0, 80);
  if (h.lastName !== undefined) data.lastName = String(h.lastName ?? '').trim().slice(0, 80);
  if (h.email !== undefined) data.email = String(h.email ?? '').trim().slice(0, 200);
  if (h.phone !== undefined) data.phone = clipText(h.phone, 40);
  if (h.dietaryNotes !== undefined) data.dietaryNotes = clipText(h.dietaryNotes, 500);
  else if (isNew) data.dietaryNotes = null;
  if (h.spouse !== undefined || isNew) {
    const sp = h.spouse ?? null;
    const has = !!sp && !!String(sp.firstName ?? '').trim();
    data.spouseAttending = has;
    data.spouseFirstName = has ? clipText(sp?.firstName, 80) : null;
    data.spouseLastName = has ? clipText(sp?.lastName, 80) : null;
    data.spouseDietaryNotes = has ? clipText(sp?.dietaryNotes, 500) : null;
  }
  if (h.children !== undefined || isNew) data.childrenJson = sanitizeChildren(h.children ?? []);
  if (h.adminNote !== undefined) data.adminNote = clipText(h.adminNote, 500);
  else if (isNew) data.adminNote = null;
  Object.assign(data, mailData(h));
  return data;
}

/** Walidacja gospodarstwa — komunikat po polsku dla panelu albo null. */
function householdError(h: HouseholdInput, isNew: boolean): string | null {
  if (isNew || h.firstName !== undefined) {
    if (!String(h.firstName ?? '').trim()) return 'Podaj imię osoby głównej.';
  }
  if (isNew || h.lastName !== undefined) {
    if (!String(h.lastName ?? '').trim()) return 'Podaj nazwisko osoby głównej.';
  }
  const email = String(h.email ?? '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return `Niepoprawny e-mail: ${email}`;
  if (h.spouse && !String(h.spouse.firstName ?? '').trim()) return 'Podaj imię małżonka (albo wybierz „Osoba").';
  if (Array.isArray(h.children)) {
    if (h.children.length > 12) return 'Maksymalnie 12 dzieci w jednej rodzinie.';
    for (const c of h.children) {
      const n = Number(c?.age);
      if (!Number.isFinite(n) || n < 0 || n > 25) return 'Wiek dziecka musi być liczbą od 0 do 25.';
    }
  }
  return null;
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly courseAccess: CourseAccessService,
  ) {}

  /** Typ serii + slug strony dla instancji — do składania linków. */
  async linkCtx(instanceId: string): Promise<InviteLinkCtx> {
    const inst = await this.prisma.eventInstance.findUnique({
      where: { id: instanceId },
      include: { series: { include: { page: true } } },
    });
    return {
      type: (inst?.series as { type?: string } | undefined)?.type,
      slug: inst?.series?.page?.slug ?? null,
      guestInvitesEnabled: guestInviteConfig(inst?.series?.page?.customFields).enabled,
    };
  }

  linkFor(token: string, ctx: InviteLinkCtx): string {
    return personalInviteLink(token, ctx.type, ctx.slug);
  }

  private toRow(r: InvitationRecord, ctx: InviteLinkCtx = { type: 'INVITE' }): InvitationRow {
    return {
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone ?? null,
      token: r.token,
      link: this.linkFor(r.token, ctx),
      confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      dietaryNotes: r.dietaryNotes ?? null,
      spouseAttending: r.spouseAttending ?? null,
      spouseFirstName: r.spouseFirstName ?? null,
      spouseLastName: r.spouseLastName ?? null,
      spouseDietaryNotes: r.spouseDietaryNotes ?? null,
      children: childrenOf(r),
      registrationId: r.registrationId ?? null,
      invitedByName: r.invitedByName ?? null,
      invitedByParticipant: isParticipantGuest(r),
      guestInviteLink:
        ctx.type === 'INVITE' && ctx.guestInvitesEnabled && r.confirmedAt && !isParticipantGuest(r)
          ? guestInvitePageLink(r.token)
          : null,
      mailSalutation: r.mailSalutation ?? null,
      mailNote: r.mailNote ?? null,
      mailSubject: r.mailSubject ?? null,
      mailFormal: r.mailFormal === true,
      status: invitationStatus(r),
      confirmedBy: confirmedByOf(r),
      guestRespondedAt: r.guestRespondedAt ? r.guestRespondedAt.toISOString() : null,
      declinedAt: r.declinedAt ? r.declinedAt.toISOString() : null,
      dietStatus: dietStatusOf(r),
      adminNote: r.adminNote ?? null,
    };
  }

  /** Tytuł eventu po polsku (title bywa mapą {pl,en,it}). */
  titleOf(title: unknown): string {
    if (typeof title === 'string') return title;
    const m = (title ?? {}) as Record<string, string>;
    return m.pl ?? m.en ?? m.it ?? Object.values(m)[0] ?? 'wydarzenie';
  }

  whenOf(startsAt: Date, endsAt: Date): string {
    const f = (d: Date) =>
      d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
    const same = startsAt.toDateString() === endsAt.toDateString();
    return same ? f(startsAt) : `${f(startsAt)} – ${f(endsAt)}`;
  }

  /**
   * Dodaje listę zaproszonych do eventu (instancji) i od razu wysyła im maile
   * z osobistym linkiem. Zwraca aktualną listę.
   */
  async createMany(instanceId: string, invitees: Invitee[], sendEmails = true) {
    const inst = await this.prisma.eventInstance.findUnique({ where: { id: instanceId } });
    if (!inst) throw new NotFoundException('Instance not found');
    const clean = (invitees ?? []).filter((i) => (i.firstName || '').trim() && (i.lastName || '').trim());
    // Deduplikacja — bez tego ponowne wklejenie listy tworzy drugi token i drugi mail
    // dla tej samej osoby. Klucz: e-mail, a przy jego braku imię+nazwisko.
    const existing = (await this.prisma.invitation.findMany({ where: { instanceId } })) as InvitationRecord[];
    const keyOf = (i: { firstName: string; lastName: string; email?: string }) =>
      norm(i.email ?? '') || `${norm(i.firstName)} ${norm(i.lastName)}`;
    const seen = new Set(existing.map((e) => keyOf(e)));
    const created: InvitationRecord[] = [];
    for (const i of clean) {
      const key = keyOf(i);
      if (seen.has(key)) continue;
      seen.add(key);
      const row = await this.prisma.invitation.create({
        data: {
          instanceId,
          firstName: i.firstName.trim(),
          lastName: i.lastName.trim(),
          email: (i.email || '').trim(),
          phone: (i.phone || '').trim() || null,
          ...mailData(i),
        } as never,
      });
      created.push(row as InvitationRecord);
    }
    if (sendEmails) {
      for (const row of created) {
        if (row.email) await this.sendInviteMail(row);
      }
    }
    return this.list(instanceId);
  }

  async list(instanceId: string): Promise<InvitationRow[]> {
    const [rows, ctx] = await Promise.all([
      this.prisma.invitation.findMany({ where: { instanceId }, orderBy: { createdAt: 'asc' } }),
      this.linkCtx(instanceId),
    ]);
    return (rows as InvitationRecord[]).map((r) => this.toRow(r, ctx));
  }

  /**
   * Usunięcie zaproszenia. Powiązane zgłoszenie dostaje CANCELLED (nie kasujemy — zostaje historia
   * i check-in); bez tego rodzina dalej wisiałaby w Zgłoszeniach i Obecności.
   */
  async remove(id: string) {
    const inv = (await this.prisma.invitation.findUnique({ where: { id } })) as InvitationRecord | null;
    if (!inv) throw new NotFoundException('Invitation not found');
    await this.cancelRegistration(inv);
    await this.prisma.invitation.delete({ where: { id } });
    return { ok: true };
  }

  /** Zgłoszenie powiązane z zaproszeniem → CANCELLED (+ odebranie dostępu do kursów z eventu). */
  private async cancelRegistration(inv: InvitationRecord): Promise<void> {
    if (!inv.registrationId) return;
    try {
      await this.prisma.registration.update({
        where: { id: inv.registrationId },
        data: { status: 'CANCELLED' } as never,
      });
      this.courseAccess.syncRegistrationSafe(inv.registrationId);
    } catch (e) {
      // Zgłoszenie mogło zostać usunięte ręcznie — nie blokujemy operacji na zaproszeniu.
      this.logger.warn(`cancelRegistration ${inv.registrationId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Aktualizacja danych zaproszonego (np. dopisanie telefonu do WhatsAppa). */
  async update(id: string, patch: Partial<Invitee>) {
    const data: Record<string, unknown> = {};
    if (patch.firstName !== undefined) data.firstName = patch.firstName.trim();
    if (patch.lastName !== undefined) data.lastName = patch.lastName.trim();
    if (patch.email !== undefined) data.email = patch.email.trim();
    if (patch.phone !== undefined) data.phone = patch.phone.trim() || null;
    Object.assign(data, mailData(patch));
    const row = (await this.prisma.invitation.update({ where: { id }, data: data as never })) as InvitationRecord;
    return this.toRow(row, await this.linkCtx(row.instanceId));
  }

  /**
   * Wysyłka maila z zaproszeniem — wspólna dla auto-wysyłki, „wyślij ponownie" i gości
   * dodanych przez uczestników. Szablon i link zależą od typu eventu i od tego, kto zaprosił:
   *  - gość uczestnika → GUEST_INVITATION („X zaprasza Cię…"),
   *  - dodany przez admina → INVITATION,
   *  - event na zaproszenie → potwierdzenie `/i/:token`, zwykły → lejek `/r/:slug?inv=`.
   */
  /** Payload maila z zaproszeniem (wspólny dla wysyłki i podglądu w panelu). */
  private async inviteMailPayload(row: InvitationRecord, opts: { reminder?: boolean } = {}) {
    const inst = await this.prisma.eventInstance.findUnique({
      where: { id: row.instanceId },
      include: { series: { include: { page: true } } },
    });
    if (!inst) throw new NotFoundException('Instance not found');
    const type = (inst.series as { type?: string }).type;
    // Potwierdzony przez organizatora → zamiast zaproszenia („Potwierdzam udział") mail
    // „udział potwierdzony, podaj dietę". Wybór z rekordu sprawia, że „Wyślij ponownie",
    // „Wyślij niewysłane" i podgląd same używają właściwego szablonu.
    if (confirmedByOf(row) === 'ADMIN') {
      const gi = guestInviteConfig(inst.series.page?.customFields);
      const spouse = row.spouseAttending === true;
      const people: Array<{ name: string; age?: number }> = [{ name: `${row.firstName} ${row.lastName}`.trim() }];
      if (spouse) {
        // Bez nazwiska małżonka → samo imię (dziedziczenie nazwiska dałoby np. „Anna Kowalski").
        people.push({
          name: `${(row.spouseFirstName ?? '').trim() || 'Współmałżonek'} ${(row.spouseLastName ?? '').trim()}`.trim(),
        });
      }
      for (const c of childrenOf(row)) people.push({ name: (c.firstName ?? '').trim() || 'Dziecko', age: c.age });
      return {
        to: row.email,
        type: 'INVITE_PRECONFIRMED',
        locale: 'pl',
        data: {
          firstName: row.firstName,
          spouseFirstName: spouse ? (row.spouseFirstName ?? '').trim() : '',
          household: people.length > 1,
          people,
          eventTitle: this.titleOf(inst.title),
          when: this.whenOf(inst.startsAt, inst.endsAt),
          location: inst.location ?? '',
          link: personalInviteLink(row.token, 'INVITE', null),
          guestInviteLink: gi.enabled && !isParticipantGuest(row) ? guestInvitePageLink(row.token) : '',
          maxGuests: gi.maxPerInviter,
          privacyUrl: (process.env.PRIVACY_POLICY_URL || '').trim(),
          reminder: opts.reminder === true,
          salutation: row.mailSalutation ?? '',
          note: row.mailNote ?? '',
          subject: row.mailSubject ?? '',
          formal: row.mailFormal === true,
        },
      };
    }
    return {
      to: row.email,
      type: isParticipantGuest(row) ? 'GUEST_INVITATION' : 'INVITATION',
      locale: 'pl',
      data: {
        firstName: row.firstName,
        eventTitle: this.titleOf(inst.title),
        when: this.whenOf(inst.startsAt, inst.endsAt),
        location: inst.location ?? '',
        link: personalInviteLink(row.token, type, inst.series.page?.slug),
        mode: type === 'INVITE' ? 'CONFIRM' : 'REGISTER',
        inviterName: row.invitedByName ?? '',
        salutation: row.mailSalutation ?? '',
        note: row.mailNote ?? '',
        subject: row.mailSubject ?? '',
        formal: row.mailFormal === true,
      },
    };
  }

  /**
   * Podgląd maila z zaproszeniem. `draft` nadpisuje zapisane dane — panel pokazuje podgląd
   * jeszcze przed zapisem (nowy gość albo edycja treści). Bez `invId` = nowy gość w instancji.
   */
  async preview(opts: {
    invId?: string;
    instanceId?: string;
    draft?: Partial<Invitee>;
    /** true = podgląd maila „udział potwierdzony" (dodawanie/potwierdzanie przez admina). */
    preconfirmed?: boolean;
    household?: HouseholdInput;
  }) {
    let base: InvitationRecord;
    if (opts.invId) {
      const inv = await this.prisma.invitation.findUnique({ where: { id: opts.invId } });
      if (!inv) throw new NotFoundException('Invitation not found');
      base = inv as unknown as InvitationRecord;
    } else {
      if (!opts.instanceId) throw new NotFoundException('Instance not found');
      base = {
        id: 'preview', instanceId: opts.instanceId, firstName: '', lastName: '', email: '', phone: null,
        token: 'PODGLAD', confirmedAt: null, sentAt: null, dietaryNotes: null, spouseAttending: null,
        spouseFirstName: null, spouseLastName: null, spouseDietaryNotes: null, childrenJson: null, registrationId: null,
      };
    }
    const d = opts.draft ?? {};
    const merged: InvitationRecord = {
      ...base,
      ...(d.firstName !== undefined ? { firstName: d.firstName.trim() } : {}),
      ...(d.lastName !== undefined ? { lastName: d.lastName.trim() } : {}),
      ...(d.email !== undefined ? { email: d.email.trim() } : {}),
      ...(mailData(d) as Partial<InvitationRecord>),
    };
    // Podgląd maila dla osoby dodawanej (albo potwierdzanej) jako potwierdzona: skład z formularza.
    if (opts.preconfirmed) {
      Object.assign(merged, householdData(opts.household ?? {}, !opts.invId), {
        confirmedAt: merged.confirmedAt ?? new Date(),
        confirmedBy: 'ADMIN',
      });
    }
    const payload = await this.inviteMailPayload(merged);
    const { subject, html } = this.notifications.render(payload);
    return { to: merged.email || null, subject, html };
  }

  async sendInviteMail(
    row: InvitationRecord,
    opts: { reminder?: boolean } = {},
  ): Promise<'SENT' | 'FAILED' | 'LOGGED' | 'NO_EMAIL'> {
    if (!row.email) return 'NO_EMAIL';
    const status = await this.notifications.sendMail(await this.inviteMailPayload(row, opts));
    // `sentAt` stemplujemy WYŁĄCZNIE przy realnej wysyłce. Przy braku dostawcy mail nigdzie
    // nie poszedł, więc oznaczenie go jako wysłanego kłamałoby adminowi w panelu.
    if (status === 'SENT') {
      await this.prisma.invitation.update({
        where: { id: row.id },
        data: { sentAt: new Date() } as never,
      });
    }
    return status;
  }

  /** Ponowna (lub pierwsza ręczna) wysyłka zaproszenia do jednej osoby. */
  async resend(id: string) {
    const inv = await this.prisma.invitation.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Invitation not found');
    const status = await this.sendInviteMail(inv as unknown as InvitationRecord);
    return { ok: status === 'SENT', status };
  }

  /**
   * Wysyłka do wszystkich zaproszonych danego eventu.
   * `onlyUnsent=true` (domyślnie) pomija tych, którym mail już poszedł.
   */
  async resendAll(instanceId: string, onlyUnsent = true) {
    const inst = await this.prisma.eventInstance.findUnique({ where: { id: instanceId } });
    if (!inst) throw new NotFoundException('Instance not found');
    const rows = (await this.prisma.invitation.findMany({
      where: { instanceId },
      orderBy: { createdAt: 'asc' },
    })) as InvitationRecord[];
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let logged = 0;
    for (const row of rows) {
      // Pomijamy: bez e-maila, już wysłane (onlyUnsent), odmowy oraz osoby, które same potwierdziły
      // (zaproszenie „Potwierdzam udział" byłoby dla nich bez sensu). Potwierdzeni przez admina
      // dostają mail „udział potwierdzony" — szablon wybiera sendInviteMail.
      const st = invitationStatus(row);
      if (
        !row.email ||
        (onlyUnsent && row.sentAt) ||
        st === 'DECLINED' ||
        (st === 'CONFIRMED' && confirmedByOf(row) !== 'ADMIN')
      ) {
        skipped += 1;
        continue;
      }
      const status = await this.sendInviteMail(row);
      if (status === 'SENT') sent += 1;
      else if (status === 'LOGGED') logged += 1;
      else failed += 1;
    }
    return { sent, failed, skipped, logged };
  }

  /** Publiczne: dane zaproszenia po tokenie (do strony potwierdzenia). */
  async getByToken(token: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { token },
      include: { instance: { include: { series: { include: { page: true } } } } },
    });
    if (!inv) throw new NotFoundException('Invitation not found');
    const rec = inv as unknown as InvitationRecord;
    const inst = inv.instance;
    const page = inst.series.page;
    const type = (inst.series as { type?: string }).type;
    const gi = guestInviteConfig(page?.customFields);
    return {
      firstName: inv.firstName,
      lastName: inv.lastName,
      email: inv.email,
      phone: rec.phone ?? null,
      invitedByName: rec.invitedByName ?? null,
      // Strona /i/:token pokazuje „Zaproś gościa" po potwierdzeniu — tylko gdy event ma włączoną
      // ścieżkę gości, a ta osoba sama nie jest gościem uczestnika (bez łańcucha).
      guestInvitesEnabled: type === 'INVITE' && gi.enabled && !isParticipantGuest(rec),
      maxGuests: gi.maxPerInviter,
      confirmedAt: inv.confirmedAt ? inv.confirmedAt.toISOString() : null,
      confirmedBy: confirmedByOf(rec),
      guestRespondedAt: rec.guestRespondedAt ? rec.guestRespondedAt.toISOString() : null,
      declinedAt: rec.declinedAt ? rec.declinedAt.toISOString() : null,
      // Od startu wydarzenia odpowiedź jest tylko do odczytu (strona chowa przyciski, API odrzuca zapis).
      eventStarted: eventStarted(inst.startsAt),
      dietaryNotes: rec.dietaryNotes ?? null,
      spouseAttending: rec.spouseAttending ?? null,
      spouseFirstName: rec.spouseFirstName ?? null,
      spouseLastName: rec.spouseLastName ?? null,
      spouseDietaryNotes: rec.spouseDietaryNotes ?? null,
      children: childrenOf(rec),
      event: {
        title: inst.title,
        description: inst.description,
        startsAt: inst.startsAt.toISOString(),
        endsAt: inst.endsAt.toISOString(),
        location: inst.location,
        theme: page?.theme ?? null,
        customFields: page?.customFields ?? null,
        slug: page?.slug ?? null,
        type: type ?? null,
        locales: page?.locales ?? ['pl'],
      },
    };
  }

  /** Publiczne: potwierdź (lub zmień) udział po tokenie z osobistego linku. */
  async confirmByToken(token: string, payload: ConfirmPayload) {
    const inv = await this.prisma.invitation.findUnique({
      where: { token },
      include: { instance: { include: { series: true } } },
    });
    if (!inv) throw new NotFoundException('Invitation not found');
    // Na zwykłym evencie zaproszenie realizuje się rejestracją w lejku (z ceną, pokojem) —
    // „potwierdzenie" stworzyłoby darmowe zgłoszenie z pominięciem płatności.
    if ((inv.instance.series as { type?: string }).type !== 'INVITE') {
      throw new ForbiddenException('To zaproszenie realizuje się przez formularz rejestracji.');
    }
    if (eventStarted(inv.instance.startsAt)) {
      throw new ForbiddenException('Wydarzenie już się rozpoczęło — odpowiedzi nie można już zmienić.');
    }
    const rec = inv as unknown as InvitationRecord;
    const now = new Date();
    await this.prisma.invitation.update({
      where: { token },
      data: {
        confirmedAt: inv.confirmedAt ?? now,
        // Potwierdzenie przez organizatora zostaje „ADMIN" także po zapisie diety przez gościa.
        confirmedBy: inv.confirmedAt ? confirmedByOf(rec) : 'GUEST',
        guestRespondedAt: now,
        declinedAt: null,
        ...declarationData(payload),
      } as never,
    });
    // Gość ma zobaczyć „Udział potwierdzony" nawet gdy synchronizacja z panelem zawiedzie.
    try {
      await this.syncRegistration(inv.id);
    } catch (e) {
      this.logger.error(
        `syncRegistration (confirmByToken) failed for invitation ${inv.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!inv.confirmedAt) await this.sendConfirmedMail(inv.id);
    return { ok: true };
  }

  /** Bez linku: dopasowanie po imieniu + nazwisku + e-mailu w ramach eventu (slug), potem potwierdzenie. */
  async matchBySlug(slug: string, data: Invitee & ConfirmPayload) {
    const page = await this.prisma.registrationPage.findUnique({
      where: { slug },
      include: { series: { include: { instances: { where: { status: 'OPEN' }, orderBy: { startsAt: 'asc' }, take: 1 } } } },
    });
    if (!page) throw new NotFoundException('Event not found');
    if ((page.series as { type?: string }).type !== 'INVITE') {
      throw new NotFoundException('Event not found');
    }
    const inst = page.series.instances[0];
    if (!inst) throw new NotFoundException('No open instance');

    const all = await this.prisma.invitation.findMany({ where: { instanceId: inst.id } });
    const found = (all as InvitationRecord[]).find(
      (x) =>
        norm(x.firstName) === norm(data.firstName) &&
        norm(x.lastName) === norm(data.lastName) &&
        norm(x.email) === norm(data.email),
    );
    if (!found) throw new NotFoundException('Nie znaleziono zaproszenia na podane dane');
    if (eventStarted(inst.startsAt)) {
      throw new ForbiddenException('Wydarzenie już się rozpoczęło — odpowiedzi nie można już zmienić.');
    }
    // Udział potwierdził organizator: nie nadpisujemy składu wpisanego w panelu danymi z formularza
    // bez linku — wysyłamy osobisty link (tam dieta i ewentualna zmiana składu).
    if (confirmedByOf(found) === 'ADMIN') {
      if (found.email) {
        try {
          await this.sendInviteMail(found);
        } catch (e) {
          this.logger.error(`matchBySlug: resend preconfirmed ${found.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return { ok: true, firstName: found.firstName, alreadyConfirmed: true };
    }
    const now = new Date();
    await this.prisma.invitation.update({
      where: { id: found.id },
      data: {
        confirmedAt: found.confirmedAt ?? now,
        confirmedBy: 'GUEST',
        guestRespondedAt: now,
        declinedAt: null,
        ...declarationData(data),
      } as never,
    });
    // Jak wyżej: błąd synchronizacji nie może zablokować potwierdzenia gościa.
    try {
      await this.syncRegistration(found.id);
    } catch (e) {
      this.logger.error(
        `syncRegistration (matchBySlug) failed for invitation ${found.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    // Ścieżka bez linku: gość nie zna swojego tokenu, więc link do zapraszania (i do zmiany
    // odpowiedzi) dostaje mailem — na adres z listy, nie ten wpisany w formularzu.
    // Wysyłamy także przy ponownym potwierdzeniu: to jedyny samoobsługowy sposób, żeby osoba,
    // która potwierdziła wcześniej (np. przed włączeniem ścieżki gości), odzyskała swój link.
    await this.sendConfirmedMail(found.id);
    // Nie zwracamy `token` — publiczny endpoint nie powinien wydawać osobistego linku
    // komuś, kto zgadł dane. Potwierdzenie już zostało zapisane, front potrzebuje tylko imienia.
    return { ok: true, firstName: found.firstName };
  }

  /**
   * Mail „dziękujemy za potwierdzenie" z linkiem do zapraszania gości — tylko gdy event ma
   * włączoną ścieżkę gości i potwierdzający sam nie jest gościem (bez łańcucha zaproszeń).
   * Błąd wysyłki nie może zablokować potwierdzenia.
   */
  async sendConfirmedMail(invitationId: string): Promise<'SENT' | 'FAILED' | 'LOGGED' | 'SKIPPED'> {
    try {
      const inv = await this.prisma.invitation.findUnique({
        where: { id: invitationId },
        include: { instance: { include: { series: { include: { page: true } } } } },
      });
      if (!inv || !inv.email) return 'SKIPPED';
      const rec = inv as unknown as InvitationRecord;
      const gi = guestInviteConfig(inv.instance.series.page?.customFields);
      if (!gi.enabled || isParticipantGuest(rec)) return 'SKIPPED';
      return await this.notifications.sendMail({
        to: inv.email,
        type: 'INVITE_CONFIRMED',
        locale: 'pl',
        data: {
          firstName: inv.firstName,
          eventTitle: this.titleOf(inv.instance.title),
          when: this.whenOf(inv.instance.startsAt, inv.instance.endsAt),
          link: personalInviteLink(inv.token, 'INVITE', null),
          guestInviteLink: guestInvitePageLink(inv.token),
          maxGuests: gi.maxPerInviter,
        },
      });
    } catch (e) {
      this.logger.error(`sendConfirmedMail failed for ${invitationId}: ${e instanceof Error ? e.message : String(e)}`);
      return 'FAILED';
    }
  }

  /**
   * Spina potwierdzone zaproszenie ze zgłoszeniem (`Registration`), z którego czytają
   * WSZYSTKIE moduły panelu (Zgłoszenia, Obecność, Płatności, Zakwaterowanie, Dashboard).
   * Idempotentne:
   *  - jeśli `invitation.registrationId` już wskazuje zgłoszenie → aktualizuje je,
   *  - inaczej, jeśli w tej instancji istnieje zgłoszenie z tym samym e-mailem w `contact`
   *    → podpina się pod nie (bez duplikatu),
   *  - inaczej tworzy nowe zgłoszenie.
   * Uczestnicy są odtwarzani od zera przy każdym wywołaniu (gość + małżonek + dzieci),
   * żeby zmiana deklaracji („Zmień odpowiedź") zawsze była w pełni odzwierciedlona.
   */
  async syncRegistration(invitationId: string): Promise<string | null> {
    const invRaw = await this.prisma.invitation.findUnique({ where: { id: invitationId } });
    if (!invRaw) return null;
    const rec = invRaw as unknown as InvitationRecord;

    const instance = await this.prisma.eventInstance.findUnique({
      where: { id: rec.instanceId },
      select: { pricingConfig: true },
    });
    const currency = (instance?.pricingConfig as { currency?: string } | null)?.currency || 'PLN';

    // Kontrakt `toContractRegistration` czyta contact.firstName/lastName/email/phone 1:1 —
    // inny kształt = puste nazwisko w panelu.
    const contact = {
      firstName: rec.firstName,
      lastName: rec.lastName,
      email: rec.email,
      phone: rec.phone ?? undefined,
    };

    const dietaryNotes = this.composeDietaryNotes(rec);

    // `gender` jest wymagane przez schemat Participant, ale przy zaproszeniach nie zbieramy
    // płci (formularz pyta tylko o dietę/dzieci/małżonka) — 'OTHER' jako neutralna wartość.
    const gender = 'OTHER' as const;
    const participantsData: Array<{
      type: 'ADULT' | 'CHILD';
      firstName: string;
      lastName: string;
      age?: number;
      gender: 'OTHER';
      dietary?: string | null;
    }> = [
      {
        type: 'ADULT',
        firstName: rec.firstName,
        lastName: rec.lastName,
        gender,
        dietary: rec.dietaryNotes ?? undefined,
      },
    ];
    if (rec.spouseAttending === true) {
      participantsData.push({
        type: 'ADULT',
        firstName: (rec.spouseFirstName ?? '').trim() || 'Współmałżonek',
        lastName: (rec.spouseLastName ?? '').trim() || rec.lastName,
        gender,
        dietary: rec.spouseDietaryNotes ?? undefined,
      });
    }
    for (const child of childrenOf(rec)) {
      participantsData.push({
        type: 'CHILD',
        firstName: (child.firstName ?? '').trim() || 'Dziecko',
        lastName: rec.lastName,
        age: child.age,
        gender,
        dietary: (child.dietary ?? '').trim() || undefined,
      });
    }

    let registrationId: string | null = rec.registrationId ?? null;

    // Idempotencja po e-mailu, gdy zaproszenie jeszcze nie ma podpiętego zgłoszenia
    // (np. gość istniał już w Registration z wcześniejszej próby albo zwykłego lejka).
    if (!registrationId && rec.email) {
      const emailNorm = norm(rec.email);
      const candidates = await this.prisma.registration.findMany({
        where: { instanceId: rec.instanceId },
        select: { id: true, contact: true },
      });
      const match = candidates.find((c: { id: string; contact: unknown }) => {
        const cc = (c.contact ?? {}) as { email?: string };
        return norm(cc.email ?? '') === emailNorm;
      });
      if (match) registrationId = match.id;
    }

    if (registrationId) {
      // Uczestnicy są odtwarzani od zera — najpierw odczepiamy ewentualne przypisania
      // pokoju per-osoba (RoomAssignment.participantId), żeby kasowanie Participant nie
      // wywaliło się na FK. Sam przydział pokoju do RODZINY (registrationId) zostaje.
      await this.prisma.$transaction([
        this.prisma.roomAssignment.updateMany({
          where: { registrationId, participantId: { not: null } },
          data: { participantId: null },
        }),
        this.prisma.participant.deleteMany({ where: { registrationId } }),
        this.prisma.registration.update({
          where: { id: registrationId },
          data: {
            status: 'CONFIRMED',
            locale: 'pl',
            contact: contact as object,
            totalPrice: 0,
            currency,
            dietaryNotes,
            participants: { create: participantsData },
          } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        }),
      ]);
    } else {
      const created = await this.prisma.registration.create({
        data: {
          instanceId: rec.instanceId,
          status: 'CONFIRMED',
          locale: 'pl',
          contact: contact as object,
          totalPrice: 0,
          currency,
          dietaryNotes,
          paymentMethod: null,
          participants: { create: participantsData },
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      });
      registrationId = created.id;
    }

    if (registrationId !== rec.registrationId) {
      await this.prisma.invitation.update({
        where: { id: invitationId },
        data: { registrationId } as never,
      });
    }

    this.courseAccess.syncRegistrationSafe(registrationId);
    return registrationId;
  }

  /** Notatka o diecie do `Registration.dietaryNotes` — dopisuje wymagania małżonka, żeby nie zgubić informacji. */
  private composeDietaryNotes(rec: InvitationRecord): string | null {
    return composeDietaryNotes(rec);
  }

  /**
   * Backfill: dla wszystkich już potwierdzonych zaproszeń danej instancji dogania
   * zgłoszenia w panelu. Wołane ręcznie z panelu (przycisk „Synchronizuj z listą zgłoszeń")
   * — obsługuje gości, którzy potwierdzili udział zanim ta synchronizacja istniała.
   */
  async syncAllRegistrations(instanceId: string): Promise<{ created: number; updated: number; failed: number }> {
    const rows = (await this.prisma.invitation.findMany({
      where: { instanceId, confirmedAt: { not: null } },
    })) as InvitationRecord[];
    let created = 0;
    let updated = 0;
    let failed = 0;
    for (const row of rows) {
      const hadRegistration = !!row.registrationId;
      try {
        const id = await this.syncRegistration(row.id);
        if (!id) {
          failed += 1;
          continue;
        }
        if (hadRegistration) updated += 1;
        else created += 1;
      } catch (e) {
        failed += 1;
        this.logger.error(
          `syncAllRegistrations: sync failed for invitation ${row.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    return { created, updated, failed };
  }

  // ── Odmowa udziału ────────────────────────────────────────────────────────

  /**
   * Publiczne: gość odpowiada „Nie damy rady przyjść". Działa dla zaproszonych (czekających)
   * i potwierdzonych (także przez organizatora). Zgłoszenie → CANCELLED, rodzina znika z licznika.
   * Ponowne „Potwierdzam" (confirmByToken) cofa odmowę.
   */
  async declineByToken(token: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { token },
      include: { instance: { include: { series: true } } },
    });
    if (!inv) throw new NotFoundException('Invitation not found');
    if ((inv.instance.series as { type?: string }).type !== 'INVITE') {
      throw new ForbiddenException('To zaproszenie realizuje się przez formularz rejestracji.');
    }
    if (eventStarted(inv.instance.startsAt)) {
      throw new ForbiddenException('Wydarzenie już się rozpoczęło — odpowiedzi nie można już zmienić.');
    }
    const now = new Date();
    await this.prisma.invitation.update({
      where: { token },
      data: { declinedAt: now, confirmedAt: null, confirmedBy: null, guestRespondedAt: now } as never,
    });
    await this.cancelRegistration(inv as unknown as InvitationRecord);
    return { ok: true };
  }

  /** Admin: oznacz odmowę (np. gość powiedział telefonicznie, że nie przyjdzie). */
  async declineByAdmin(id: string): Promise<InvitationRow> {
    const inv = (await this.prisma.invitation.findUnique({ where: { id } })) as InvitationRecord | null;
    if (!inv) throw new NotFoundException('Invitation not found');
    const row = (await this.prisma.invitation.update({
      where: { id },
      data: { declinedAt: new Date(), confirmedAt: null, confirmedBy: null } as never,
    })) as InvitationRecord;
    await this.cancelRegistration(inv);
    return this.toRow(row, await this.linkCtx(row.instanceId));
  }

  /** Admin: cofnij potwierdzenie albo odmowę → z powrotem „czeka". Zgłoszenie → CANCELLED. */
  async unconfirm(id: string): Promise<InvitationRow> {
    const inv = (await this.prisma.invitation.findUnique({ where: { id } })) as InvitationRecord | null;
    if (!inv) throw new NotFoundException('Invitation not found');
    const row = (await this.prisma.invitation.update({
      where: { id },
      data: { confirmedAt: null, confirmedBy: null, declinedAt: null, guestRespondedAt: null } as never,
    })) as InvitationRecord;
    await this.cancelRegistration(inv);
    return this.toRow(row, await this.linkCtx(row.instanceId));
  }

  // ── Potwierdzeni przez organizatora ─────────────────────────────────────────

  /** Instancja eventu INVITE albo wyjątek (potwierdzanie przez admina ma sens tylko tam). */
  private async requireInviteInstance(instanceId: string) {
    const inst = await this.prisma.eventInstance.findUnique({
      where: { id: instanceId },
      include: { series: true },
    });
    if (!inst) throw new NotFoundException('Instance not found');
    if ((inst.series as { type?: string }).type !== 'INVITE') {
      throw new BadRequestException(
        'Dodawanie potwierdzonych uczestników działa tylko dla eventów „Na zaproszenie”. Na zwykłym evencie dodaj zgłoszenie.',
      );
    }
    return inst;
  }

  /**
   * Admin potwierdza istniejące zaproszenie („Potwierdź ręcznie") albo poprawia skład i diety
   * już potwierdzonego („Edytuj skład"). Idempotentne.
   *  - pierwsze potwierdzenie → confirmedBy=ADMIN, domyślnie mail „udział potwierdzony",
   *  - edycja potwierdzonego → confirmedBy bez zmian (korekta admina nie zmienia „potwierdził gość"),
   *    domyślnie bez maila.
   */
  async confirmByAdmin(id: string, household: HouseholdInput, opts: { sendEmail?: boolean } = {}) {
    const inv = (await this.prisma.invitation.findUnique({ where: { id } })) as InvitationRecord | null;
    if (!inv) throw new NotFoundException('Invitation not found');
    await this.requireInviteInstance(inv.instanceId);
    const err = householdError(household ?? {}, false);
    if (err) throw new BadRequestException(err);
    const wasConfirmed = !!inv.confirmedAt;
    const confirmedBy = wasConfirmed ? confirmedByOf(inv) : 'ADMIN';
    await this.prisma.invitation.update({
      where: { id },
      data: {
        ...householdData(household ?? {}, false),
        confirmedAt: inv.confirmedAt ?? new Date(),
        confirmedBy,
        declinedAt: null,
      } as never,
    });
    await this.syncSafe(id, 'confirmByAdmin');
    const send = opts.sendEmail ?? !wasConfirmed;
    let mail: 'SENT' | 'FAILED' | 'LOGGED' | 'NO_EMAIL' | 'SKIPPED' = 'SKIPPED';
    // Mail tylko dla potwierdzonych przez organizatora — rodzina, która potwierdziła sama,
    // dostałaby zaproszenie „Potwierdzam udział", czyli bez sensu.
    if (send && confirmedBy === 'ADMIN') {
      const fresh = (await this.prisma.invitation.findUnique({ where: { id } })) as InvitationRecord;
      mail = await this.sendInviteMail(fresh);
    }
    const row = (await this.prisma.invitation.findUnique({ where: { id } })) as InvitationRecord;
    return { item: this.toRow(row, await this.linkCtx(row.instanceId)), mail };
  }

  /**
   * Admin dodaje od razu potwierdzone osoby / małżeństwa / rodziny (jeden rekord = jedno gospodarstwo).
   * Bez zaproszenia; domyślnie mail „udział potwierdzony, podaj dietę" (sendEmails=false → bez maila).
   * Konflikty (duplikaty zawyżające catering) są raportowane, a rekord z konfliktem nie jest dodawany, chyba że:
   *  - confirmExisting=true → osoba czekająca/odmawiająca na liście zostaje potwierdzona z tym składem,
   *  - ignoreWarnings=true → ostrzeżenia o małżonku (SPOUSE_ON_LIST / PERSON_IS_SPOUSE) są pomijane.
   * SAME_PERSON_CONFIRMED blokuje zawsze (taką osobę się edytuje, nie dodaje drugi raz).
   */
  async createConfirmed(
    instanceId: string,
    households: HouseholdInput[],
    opts: { sendEmails?: boolean; confirmExisting?: boolean; ignoreWarnings?: boolean } = {},
  ) {
    await this.requireInviteInstance(instanceId);
    const list = Array.isArray(households) ? households.slice(0, 300) : [];
    if (list.length === 0) throw new BadRequestException('Brak osób do dodania.');
    list.forEach((h, i) => {
      const err = householdError(h ?? {}, true);
      if (err) throw new BadRequestException(list.length > 1 ? `Wiersz ${i + 1}: ${err}` : err);
    });

    const existing = (await this.prisma.invitation.findMany({ where: { instanceId } })) as InvitationRecord[];
    // Indeksy do wykrywania duplikatów — aktualizowane w trakcie, żeby łapać też powtórki w jednej partii.
    type Ref = { id: string; label: string; rec: InvitationRecord | null };
    const byEmail = new Map<string, Ref>();
    const byMainName = new Map<string, Ref>();
    const bySpouseName = new Map<string, Ref>();
    const label = (r: InvitationRecord) => {
      const st = invitationStatus(r);
      const stLabel = st === 'CONFIRMED' ? 'potwierdzony' : st === 'DECLINED' ? 'odmówił' : 'czeka';
      return `${r.firstName} ${r.lastName} (${stLabel})`;
    };
    const index = (r: InvitationRecord, ref: Ref) => {
      if (norm(r.email)) byEmail.set(norm(r.email), ref);
      byMainName.set(personKey(r.firstName, r.lastName), ref);
      if (r.spouseAttending === true && (r.spouseFirstName ?? '').trim()) {
        bySpouseName.set(personKey(r.spouseFirstName, r.spouseLastName || r.lastName), ref);
      }
    };
    for (const r of existing) index(r, { id: r.id, label: label(r), rec: r });

    const conflicts: HouseholdConflict[] = [];
    const createdIds: string[] = [];
    const confirmedExistingIds: string[] = [];

    for (let i = 0; i < list.length; i += 1) {
      const h = list[i];
      const first = String(h.firstName ?? '').trim();
      const last = String(h.lastName ?? '').trim();
      const email = norm(h.email ?? '');
      const mainKey = personKey(first, last);
      const spouseKey =
        h.spouse && String(h.spouse.firstName ?? '').trim()
          ? personKey(h.spouse.firstName, String(h.spouse.lastName ?? '').trim() || last)
          : '';

      const own: HouseholdConflict[] = [];
      // Ta sama osoba: po e-mailu, a gdy go brak — po imieniu i nazwisku (jak createMany).
      const same = (email && byEmail.get(email)) || byMainName.get(mainKey);
      if (same) {
        const confirmed = same.rec ? invitationStatus(same.rec) === 'CONFIRMED' : true;
        own.push({
          index: i,
          kind: confirmed ? 'SAME_PERSON_CONFIRMED' : 'SAME_PERSON_PENDING',
          existingId: same.id,
          label: same.label,
          blocking: true,
        });
      }
      const asSpouse = bySpouseName.get(mainKey);
      if (asSpouse && asSpouse.id !== same?.id) {
        own.push({ index: i, kind: 'PERSON_IS_SPOUSE', existingId: asSpouse.id, label: asSpouse.label, blocking: false });
      }
      if (spouseKey) {
        const sp = byMainName.get(spouseKey) || bySpouseName.get(spouseKey);
        if (sp && sp.id !== same?.id) {
          own.push({ index: i, kind: 'SPOUSE_ON_LIST', existingId: sp.id, label: sp.label, blocking: false });
        }
      }

      const samePending = own.find((c) => c.kind === 'SAME_PERSON_PENDING');
      const sameConfirmed = own.find((c) => c.kind === 'SAME_PERSON_CONFIRMED');
      const warnings = own.filter((c) => !c.blocking);
      const warningsBlock = warnings.length > 0 && !opts.ignoreWarnings;

      if (sameConfirmed || (samePending && !opts.confirmExisting) || warningsBlock) {
        conflicts.push(...own);
        continue;
      }

      const data = householdData(h, true);
      if (samePending) {
        // Potwierdzenie istniejącego zaproszenia (zachowuje token — stary link dalej działa).
        // Personalizacji maila nie nadpisujemy pustymi wartościami z formularza.
        for (const k of ['mailSalutation', 'mailNote', 'mailSubject', 'mailFormal', 'adminNote']) {
          if ((h as Record<string, unknown>)[k] === undefined) delete data[k];
        }
        if (!email) delete data.email;
        if (h.phone === undefined || !String(h.phone).trim()) delete data.phone;
        await this.prisma.invitation.update({
          where: { id: samePending.existingId },
          data: { ...data, confirmedAt: new Date(), confirmedBy: 'ADMIN', declinedAt: null } as never,
        });
        confirmedExistingIds.push(samePending.existingId);
        const ref: Ref = { id: samePending.existingId, label: `${first} ${last} (potwierdzony)`, rec: null };
        index({ ...(data as object), firstName: first, lastName: last, email: email } as InvitationRecord, ref);
        continue;
      }
      const row = (await this.prisma.invitation.create({
        data: {
          instanceId,
          ...data,
          email: String(h.email ?? '').trim(),
          confirmedAt: new Date(),
          confirmedBy: 'ADMIN',
        } as never,
      })) as InvitationRecord;
      createdIds.push(row.id);
      index(row, { id: row.id, label: `${first} ${last} (potwierdzony)`, rec: null });
    }

    const touched = [...createdIds, ...confirmedExistingIds];
    for (const id of touched) await this.syncSafe(id, 'createConfirmed');

    const mail = { sent: 0, failed: 0, logged: 0, noEmail: 0 };
    if (opts.sendEmails !== false) {
      for (const id of touched) {
        const row = (await this.prisma.invitation.findUnique({ where: { id } })) as InvitationRecord;
        const st = await this.sendInviteMail(row);
        if (st === 'SENT') mail.sent += 1;
        else if (st === 'LOGGED') mail.logged += 1;
        else if (st === 'NO_EMAIL') mail.noEmail += 1;
        else mail.failed += 1;
      }
    }
    return {
      items: await this.list(instanceId),
      conflicts,
      added: createdIds.length,
      confirmedExisting: confirmedExistingIds.length,
      mail,
    };
  }

  /**
   * „Przypomnij o diecie": ponowny mail „udział potwierdzony" (wariant przypomnienia) do rodzin
   * potwierdzonych przez organizatora, które nie odpowiedziały i nie mają wpisanej diety.
   */
  async sendDietReminders(instanceId: string) {
    const rows = (await this.prisma.invitation.findMany({
      where: { instanceId, confirmedAt: { not: null } },
      orderBy: { createdAt: 'asc' },
    })) as InvitationRecord[];
    let sent = 0;
    let failed = 0;
    let logged = 0;
    let skipped = 0;
    for (const row of rows) {
      if (dietStatusOf(row) !== 'UNKNOWN' || !row.email) {
        skipped += 1;
        continue;
      }
      const st = await this.sendInviteMail(row, { reminder: true });
      if (st === 'SENT') sent += 1;
      else if (st === 'LOGGED') logged += 1;
      else failed += 1;
    }
    return { sent, failed, logged, skipped };
  }

  /** syncRegistration z logowaniem błędu — zapis w panelu nie może paść przez synchronizację. */
  private async syncSafe(id: string, where: string): Promise<void> {
    try {
      await this.syncRegistration(id);
    } catch (e) {
      this.logger.error(`syncRegistration (${where}) failed for invitation ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
