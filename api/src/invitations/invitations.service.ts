import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

interface Invitee {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

/** Wpis dziecka w deklaracji gościa. */
export interface ChildEntry {
  firstName?: string;
  age: number;
}

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
}

type InvitationRecord = {
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
};

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
    const firstNameRaw = (c?.firstName ?? '').trim().slice(0, 60);
    out.push({ age, ...(firstNameRaw ? { firstName: firstNameRaw } : {}) });
  }
  return out;
}

/** Zwraca dane do zapisu w Prisma dla deklaracji małżonka/dzieci — wspólne dla obu ścieżek potwierdzenia. */
function declarationData(payload: ConfirmPayload): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (payload.dietaryNotes !== undefined) data.dietaryNotes = payload.dietaryNotes.trim() || null;
  if (payload.spouseAttending !== undefined) {
    data.spouseAttending = payload.spouseAttending;
    if (payload.spouseAttending === true) {
      data.spouseFirstName = (payload.spouseFirstName ?? '').trim() || null;
      data.spouseLastName = (payload.spouseLastName ?? '').trim() || null;
      data.spouseDietaryNotes = (payload.spouseDietaryNotes ?? '').trim() || null;
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

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /** Bazowy adres publicznego frontu — z niego składamy link /i/:token do maila. */
  private baseUrl(): string {
    // `||`, nie `??` — pusty ENV na Renderze dałby link względny („/i/token"), martwy w mailu.
    const raw =
      this.config.get<string>('PUBLIC_APP_URL') ||
      this.config.get<string>('CORS_ORIGIN') ||
      'https://rejestracja.icpemission.pl';
    return raw.split(',')[0].trim().replace(/\/+$/, '');
  }

  private toRow(r: InvitationRecord): InvitationRow {
    return {
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone ?? null,
      token: r.token,
      link: `${this.baseUrl()}/i/${r.token}`,
      confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      dietaryNotes: r.dietaryNotes ?? null,
      spouseAttending: r.spouseAttending ?? null,
      spouseFirstName: r.spouseFirstName ?? null,
      spouseLastName: r.spouseLastName ?? null,
      spouseDietaryNotes: r.spouseDietaryNotes ?? null,
      children: childrenOf(r),
      registrationId: r.registrationId ?? null,
    };
  }

  /** Tytuł eventu po polsku (title bywa mapą {pl,en,it}). */
  private titleOf(title: unknown): string {
    if (typeof title === 'string') return title;
    const m = (title ?? {}) as Record<string, string>;
    return m.pl ?? m.en ?? m.it ?? Object.values(m)[0] ?? 'wydarzenie';
  }

  private whenOf(startsAt: Date, endsAt: Date): string {
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
        } as never,
      });
      created.push(row as InvitationRecord);
    }
    if (sendEmails) {
      for (const row of created) {
        if (row.email) await this.sendInviteMail(row, inst);
      }
    }
    return this.list(instanceId);
  }

  async list(instanceId: string): Promise<InvitationRow[]> {
    const rows = await this.prisma.invitation.findMany({
      where: { instanceId },
      orderBy: { createdAt: 'asc' },
    });
    return (rows as InvitationRecord[]).map((r) => this.toRow(r));
  }

  async remove(id: string) {
    await this.prisma.invitation.delete({ where: { id } });
    return { ok: true };
  }

  /** Aktualizacja danych zaproszonego (np. dopisanie telefonu do WhatsAppa). */
  async update(id: string, patch: Partial<Invitee>) {
    const data: Record<string, unknown> = {};
    if (patch.firstName !== undefined) data.firstName = patch.firstName.trim();
    if (patch.lastName !== undefined) data.lastName = patch.lastName.trim();
    if (patch.email !== undefined) data.email = patch.email.trim();
    if (patch.phone !== undefined) data.phone = patch.phone.trim() || null;
    const row = await this.prisma.invitation.update({ where: { id }, data: data as never });
    return this.toRow(row as InvitationRecord);
  }

  /** Wysyłka maila z zaproszeniem — wspólna dla auto-wysyłki i „wyślij ponownie". */
  private async sendInviteMail(
    row: InvitationRecord,
    inst: { title: unknown; startsAt: Date; endsAt: Date; location: string | null },
  ): Promise<'SENT' | 'FAILED' | 'LOGGED' | 'NO_EMAIL'> {
    if (!row.email) return 'NO_EMAIL';
    const status = await this.notifications.sendMail({
      to: row.email,
      type: 'INVITATION',
      locale: 'pl',
      data: {
        firstName: row.firstName,
        eventTitle: this.titleOf(inst.title),
        when: this.whenOf(inst.startsAt, inst.endsAt),
        location: inst.location ?? '',
        link: `${this.baseUrl()}/i/${row.token}`,
      },
    });
    // `sentAt` stemplujemy WYŁĄCZNIE przy realnej wysyłce. Przy MAIL_MODE=log mail nigdzie
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
    const inv = await this.prisma.invitation.findUnique({
      where: { id },
      include: { instance: true },
    });
    if (!inv) throw new NotFoundException('Invitation not found');
    const status = await this.sendInviteMail(inv as unknown as InvitationRecord, inv.instance);
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
      if (!row.email || (onlyUnsent && row.sentAt)) {
        skipped += 1;
        continue;
      }
      const status = await this.sendInviteMail(row, inst);
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
    return {
      firstName: inv.firstName,
      lastName: inv.lastName,
      email: inv.email,
      confirmedAt: inv.confirmedAt ? inv.confirmedAt.toISOString() : null,
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
      },
    };
  }

  /** Publiczne: potwierdź (lub zmień) udział po tokenie z osobistego linku. */
  async confirmByToken(token: string, payload: ConfirmPayload) {
    const inv = await this.prisma.invitation.findUnique({ where: { token } });
    if (!inv) throw new NotFoundException('Invitation not found');
    await this.prisma.invitation.update({
      where: { token },
      data: {
        confirmedAt: inv.confirmedAt ?? new Date(),
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
    await this.prisma.invitation.update({
      where: { id: found.id },
      data: {
        confirmedAt: found.confirmedAt ?? new Date(),
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
    // Nie zwracamy `token` — publiczny endpoint nie powinien wydawać osobistego linku
    // komuś, kto zgadł dane. Potwierdzenie już zostało zapisane, front potrzebuje tylko imienia.
    return { ok: true, firstName: found.firstName };
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
  private async syncRegistration(invitationId: string): Promise<string | null> {
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

    return registrationId;
  }

  /** Notatka o diecie do `Registration.dietaryNotes` — dopisuje wymagania małżonka, żeby nie zgubić informacji. */
  private composeDietaryNotes(rec: InvitationRecord): string | null {
    const guest = (rec.dietaryNotes ?? '').trim();
    const spouseAttending = rec.spouseAttending === true;
    const spouseDiet = spouseAttending ? (rec.spouseDietaryNotes ?? '').trim() : '';
    const spouseLabel = (rec.spouseFirstName ?? '').trim() || 'Współmałżonek';
    if (guest && spouseDiet) return `${rec.firstName}: ${guest} | ${spouseLabel}: ${spouseDiet}`;
    if (guest) return guest;
    if (spouseDiet) return `${spouseLabel}: ${spouseDiet}`;
    return null;
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
}
