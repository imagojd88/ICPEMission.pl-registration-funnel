import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvitationsService, isParticipantGuest, type InvitationRecord } from './invitations.service';
import {
  ACTIVE_REGISTRATION_STATUSES,
  guestInviteConfig,
  type GuestInviteConfig,
} from './guest-invite-config';

/** Dane gościa wpisywane przez uczestnika — wszystkie pola wymagane. */
export interface GuestInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

/** Dlaczego uczestnik nie może (już) zapraszać — front tłumaczy to na komunikat. */
export type BlockedReason = 'DISABLED' | 'NOT_CONFIRMED' | 'GUEST_CANNOT_INVITE' | 'CLOSED' | 'LIMIT' | null;

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InstanceWithPage = {
  id: string;
  title: unknown;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  status: string;
  registrationClosesAt: Date;
  series: { type?: string; page: { slug: string; theme: unknown; customFields: unknown } | null };
};

/**
 * Kto zaprasza. Dwa źródła tożsamości, oba to sekretne tokeny z maila/strony sukcesu:
 *  - INVITATION: token osobistego zaproszenia (event „na zaproszenie"),
 *  - REGISTRATION: editToken zgłoszenia z lejka (zwykły event).
 */
interface Inviter {
  kind: 'INVITATION' | 'REGISTRATION';
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  instance: InstanceWithPage;
  config: GuestInviteConfig;
  blocked: BlockedReason;
}

/**
 * Ścieżka „uczestnik zaprasza gościa". Gość ląduje w tabeli `Invitation` — dokładnie tam,
 * gdzie osoby dodane przez admina w edycji eventu — z adnotacją, kto go zaprosił.
 * Łańcuch zaproszeń jest zablokowany: gość uczestnika nie może zapraszać dalej.
 */
@Injectable()
export class GuestInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationsService,
  ) {}

  private async resolve(token: string): Promise<Inviter> {
    const include = { instance: { include: { series: { include: { page: true } } } } } as const;

    const inv = await this.prisma.invitation.findUnique({ where: { token }, include });
    if (inv) {
      const rec = inv as unknown as InvitationRecord;
      const instance = inv.instance as unknown as InstanceWithPage;
      const config = guestInviteConfig(instance.series.page?.customFields);
      let blocked: BlockedReason = null;
      if (instance.series.type !== 'INVITE') blocked = 'GUEST_CANNOT_INVITE'; // zaproszenie na zwykły event = gość
      else if (isParticipantGuest(rec)) blocked = 'GUEST_CANNOT_INVITE';
      else if (!inv.confirmedAt) blocked = 'NOT_CONFIRMED';
      return {
        kind: 'INVITATION',
        id: inv.id,
        firstName: inv.firstName,
        lastName: inv.lastName,
        email: inv.email,
        instance,
        config,
        blocked,
      };
    }

    const reg = await this.prisma.registration.findUnique({ where: { editToken: token }, include });
    if (!reg) throw new NotFoundException('Link jest nieprawidłowy lub wygasł.');
    const instance = reg.instance as unknown as InstanceWithPage;
    // Zgłoszenia na evencie INVITE powstają z potwierdzeń zaproszeń — tam tożsamością jest
    // token zaproszenia, nie editToken (którego gość nigdy nie widział).
    if (instance.series.type === 'INVITE') throw new NotFoundException('Link jest nieprawidłowy lub wygasł.');
    const contact = (reg.contact ?? {}) as { firstName?: string; lastName?: string; email?: string };
    const config = guestInviteConfig(instance.series.page?.customFields);
    let blocked: BlockedReason = null;
    const asGuest = await this.prisma.invitation.findFirst({
      where: {
        registrationId: reg.id,
        OR: [{ invitedByInvitationId: { not: null } }, { invitedByRegistrationId: { not: null } }],
      } as never,
    });
    if (asGuest) blocked = 'GUEST_CANNOT_INVITE';
    else if (!ACTIVE_REGISTRATION_STATUSES.includes(reg.status)) blocked = 'NOT_CONFIRMED';
    return {
      kind: 'REGISTRATION',
      id: reg.id,
      firstName: contact.firstName ?? '',
      lastName: contact.lastName ?? '',
      email: contact.email ?? '',
      instance,
      config,
      blocked,
    };
  }

  private whereInvitedBy(inviter: Inviter) {
    return inviter.kind === 'INVITATION'
      ? { invitedByInvitationId: inviter.id }
      : { invitedByRegistrationId: inviter.id };
  }

  private isClosed(inst: InstanceWithPage): boolean {
    const now = Date.now();
    if (inst.status !== 'OPEN') return true;
    if (inst.endsAt.getTime() < now) return true;
    // Zwykły event: gość musi zdążyć się zarejestrować.
    if (inst.series.type !== 'INVITE' && inst.registrationClosesAt.getTime() < now) return true;
    return false;
  }

  /** Stan strony „Zaproś gościa": event, limit, lista moich gości i czy mogę dodać kolejnego. */
  async view(token: string) {
    const inviter = await this.resolve(token);
    return this.buildView(inviter);
  }

  private async buildView(inviter: Inviter) {
    const inst = inviter.instance;
    const guests = (await this.prisma.invitation.findMany({
      where: { instanceId: inst.id, ...this.whereInvitedBy(inviter) } as never,
      orderBy: { createdAt: 'asc' },
    })) as InvitationRecord[];
    const used = guests.length;
    const max = inviter.config.maxPerInviter;
    let blocked: BlockedReason = inviter.blocked;
    if (!blocked && !inviter.config.enabled) blocked = 'DISABLED';
    if (!blocked && this.isClosed(inst)) blocked = 'CLOSED';
    if (!blocked && used >= max) blocked = 'LIMIT';
    const registerFlow = inst.series.type !== 'INVITE';
    return {
      inviter: { firstName: inviter.firstName },
      event: {
        title: inst.title,
        startsAt: inst.startsAt.toISOString(),
        endsAt: inst.endsAt.toISOString(),
        location: inst.location,
        theme: inst.series.page?.theme ?? null,
        slug: inst.series.page?.slug ?? null,
        type: inst.series.type ?? null,
      },
      // Gość zwykłego eventu musi przejść rejestrację (z płatnością) — front to komunikuje.
      guestFlow: registerFlow ? 'REGISTER' : 'CONFIRM',
      maxGuests: max,
      used,
      remaining: Math.max(0, max - used),
      canInvite: blocked === null,
      blockedReason: blocked,
      guests: guests.map((g) => ({
        id: g.id,
        firstName: g.firstName,
        lastName: g.lastName,
        email: g.email,
        status: g.confirmedAt ? 'CONFIRMED' : 'PENDING',
        sentAt: g.sentAt ? g.sentAt.toISOString() : null,
      })),
    };
  }

  /** Dodanie gościa przez uczestnika + mail z osobistym zaproszeniem. */
  async add(token: string, input: GuestInput) {
    const inviter = await this.resolve(token);
    const firstName = (input.firstName ?? '').trim().slice(0, 80);
    const lastName = (input.lastName ?? '').trim().slice(0, 80);
    const email = (input.email ?? '').trim().slice(0, 160);
    const phone = (input.phone ?? '').trim().slice(0, 40);
    if (!firstName || !lastName) throw new BadRequestException('Podaj imię i nazwisko gościa.');
    if (!EMAIL_RE.test(email)) throw new BadRequestException('Podaj poprawny adres e-mail gościa.');
    if (phone.replace(/\D/g, '').length < 7) throw new BadRequestException('Podaj numer telefonu gościa.');

    const state = await this.buildView(inviter);
    if (!state.canInvite) throw new ForbiddenException(this.blockedMessage(state.blockedReason, state.maxGuests));

    const instanceId = inviter.instance.id;
    if (norm(email) === norm(inviter.email)) {
      throw new ConflictException('To Twój adres e-mail — podaj adres osoby, którą zapraszasz.');
    }
    // Ta sama osoba nie może trafić na listę dwa razy (dwa tokeny, dwa maile, dwie rodziny w panelu).
    const invitations = (await this.prisma.invitation.findMany({
      where: { instanceId },
      select: { email: true },
    })) as Array<{ email: string }>;
    if (invitations.some((i) => norm(i.email) === norm(email))) {
      throw new ConflictException('Ta osoba jest już na liście gości tego wydarzenia.');
    }
    const regs = (await this.prisma.registration.findMany({
      where: { instanceId, status: { not: 'CANCELLED' } },
      select: { contact: true },
    })) as Array<{ contact: unknown }>;
    if (regs.some((r) => norm((r.contact as { email?: string } | null)?.email) === norm(email))) {
      throw new ConflictException('Ta osoba jest już zapisana na to wydarzenie.');
    }

    const row = (await this.prisma.invitation.create({
      data: {
        instanceId,
        firstName,
        lastName,
        email,
        phone,
        invitedByName: `${inviter.firstName} ${inviter.lastName}`.trim() || null,
        ...this.whereInvitedBy(inviter),
      } as never,
    })) as InvitationRecord;

    const mailStatus = await this.invitations.sendInviteMail(row);
    return { ...(await this.buildView(inviter)), added: { id: row.id, mailStatus } };
  }

  /** Uczestnik może wycofać swojego gościa, dopóki ten nie potwierdził / nie zarejestrował się. */
  async remove(token: string, guestId: string) {
    const inviter = await this.resolve(token);
    const guest = (await this.prisma.invitation.findUnique({ where: { id: guestId } })) as InvitationRecord | null;
    const mine =
      guest &&
      (inviter.kind === 'INVITATION'
        ? guest.invitedByInvitationId === inviter.id
        : guest.invitedByRegistrationId === inviter.id);
    if (!guest || !mine) throw new NotFoundException('Nie znaleziono gościa.');
    if (guest.confirmedAt || guest.registrationId) {
      throw new ForbiddenException('Gość już potwierdził udział — w sprawie zmian skontaktuj się z organizatorem.');
    }
    await this.prisma.invitation.delete({ where: { id: guestId } });
    return this.buildView(inviter);
  }

  private blockedMessage(reason: BlockedReason, max: number): string {
    switch (reason) {
      case 'DISABLED':
        return 'Zapraszanie gości nie jest włączone dla tego wydarzenia.';
      case 'NOT_CONFIRMED':
        return 'Gości mogą zapraszać tylko osoby z potwierdzonym udziałem.';
      case 'GUEST_CANNOT_INVITE':
        return 'Osoba zaproszona przez uczestnika nie może zapraszać kolejnych gości.';
      case 'CLOSED':
        return 'Zapisy na to wydarzenie są zamknięte.';
      case 'LIMIT':
        return `Wykorzystano limit gości (${max}).`;
      default:
        return 'Nie można dodać gościa.';
    }
  }
}
