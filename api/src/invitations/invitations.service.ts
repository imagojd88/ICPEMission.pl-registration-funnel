import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

interface Invitee {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
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
}

type InvitationRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  token: string;
  confirmedAt: Date | null;
  sentAt: Date | null;
};

const norm = (s: string) => (s ?? '').trim().toLowerCase();

@Injectable()
export class InvitationsService {
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
    const inst = inv.instance;
    const page = inst.series.page;
    return {
      firstName: inv.firstName,
      lastName: inv.lastName,
      email: inv.email,
      confirmedAt: inv.confirmedAt ? inv.confirmedAt.toISOString() : null,
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

  async confirmByToken(token: string, dietaryNotes?: string) {
    const inv = await this.prisma.invitation.findUnique({ where: { token } });
    if (!inv) throw new NotFoundException('Invitation not found');
    await this.prisma.invitation.update({
      where: { token },
      data: {
        confirmedAt: inv.confirmedAt ?? new Date(),
        ...(dietaryNotes !== undefined ? { dietaryNotes: dietaryNotes?.trim() || null } : {}),
      },
    });
    return { ok: true };
  }

  /** Bez linku: dopasowanie po imieniu + nazwisku + e-mailu w ramach eventu (slug), potem potwierdzenie. */
  async matchBySlug(slug: string, data: Invitee & { dietaryNotes?: string }) {
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
        ...(data.dietaryNotes ? { dietaryNotes: data.dietaryNotes.trim() } : {}),
      },
    });
    // Nie zwracamy `token` — publiczny endpoint nie powinien wydawać osobistego linku
    // komuś, kto zgadł dane. Potwierdzenie już zostało zapisane, front potrzebuje tylko imienia.
    return { ok: true, firstName: found.firstName };
  }
}
