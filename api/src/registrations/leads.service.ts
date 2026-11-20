import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { publicAppUrl } from '../invitations/guest-invite-config';

type RunResult = { sent: number; skipped: number; converted: number; deleted: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Po ilu godzinach bez aktywności wysyłamy przypomnienie. */
export const REMINDER_AFTER_MS = 3 * 60 * 60 * 1000;
/** Starszych porzuconych zgłoszeń nie przypominamy (np. po długiej przerwie serwera). */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Niedokończone zgłoszenia + JEDNO przypomnienie mailem po 3 h („Nie zapomnij dokończyć zgłoszenia”).
 *
 * - Lejek zapisuje „lead” po przejściu kroku „Dane” (imię, e-mail, język, krok) i aktualizuje krok.
 * - Przypomnienie: brak aktywności ≥ 3 h, brak zgłoszenia na ten e-mail, zapisy otwarte, są miejsca.
 *   Zawsze tylko jedno (`reminderSentAt`). Link: /r/<slug>?lead=<token> → imię i e-mail wpisane.
 * - Wysłane zgłoszenie oznacza lead jako „dokończony” (`convertedAt`).
 * - Dane leadów usuwamy dzień po zakończeniu eventu.
 * Wyzwalacze: co 5 min (gdy API działa) + `GET /cron/registration-reminders`.
 */
@Injectable()
export class LeadsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Leads');
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<RunResult> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: NotificationsService,
  ) {}

  private get db(): Db {
    return this.prisma as Db;
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runDue().catch(() => undefined), 5 * 60_000);
    setTimeout(() => void this.runDue().catch(() => undefined), 30_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Czy na ten e-mail jest już (nieanulowane) zgłoszenie w tej instancji. */
  private async registeredEmails(instanceId: string): Promise<Set<string>> {
    const regs = (await this.db.registration.findMany({
      where: { instanceId, status: { not: 'CANCELLED' } },
      select: { contact: true },
    })) as Array<{ contact: unknown }>;
    return new Set(
      regs
        .map((r) => String(((r.contact ?? {}) as { email?: string }).email ?? '').trim().toLowerCase())
        .filter(Boolean),
    );
  }

  /** Lejek: zapis / aktualizacja rozpoczętego zgłoszenia (publiczne, bez danych wrażliwych). */
  async upsert(dto: { instanceId?: string; email?: string; firstName?: string; lastName?: string; locale?: string; step?: number }) {
    const email = String(dto.email ?? '').trim().toLowerCase();
    const firstName = String(dto.firstName ?? '').trim().slice(0, 100);
    if (!dto.instanceId || !EMAIL_RE.test(email) || email.length > 200 || !firstName) {
      throw new BadRequestException('Invalid lead');
    }
    const inst = await this.db.eventInstance.findUnique({ where: { id: dto.instanceId }, select: { id: true, status: true } });
    if (!inst || inst.status !== 'OPEN') return { ok: true };
    const locale = ['pl', 'en', 'it', 'ko', 'zh'].includes(String(dto.locale)) ? String(dto.locale) : 'pl';
    const step = Math.min(10, Math.max(1, Math.trunc(Number(dto.step) || 1)));
    const lastName = String(dto.lastName ?? '').trim().slice(0, 100) || null;

    const existing = await this.db.registrationLead.findUnique({
      where: { instanceId_email: { instanceId: dto.instanceId, email } },
    });
    if (existing?.convertedAt) return { ok: true };
    const already = (await this.registeredEmails(dto.instanceId)).has(email);
    if (existing) {
      await this.db.registrationLead.update({
        where: { id: existing.id },
        data: {
          firstName,
          lastName,
          locale,
          step: Math.max(existing.step, step),
          lastActivityAt: new Date(),
          ...(already ? { convertedAt: new Date() } : {}),
        },
      });
    } else {
      await this.db.registrationLead.create({
        data: { instanceId: dto.instanceId, email, firstName, lastName, locale, step, ...(already ? { convertedAt: new Date() } : {}) },
      });
    }
    return { ok: true };
  }

  /** Link z przypomnienia: dane do wypełnienia formularza. */
  async byToken(token: string) {
    const lead = await this.db.registrationLead.findUnique({ where: { token } });
    if (!lead) throw new NotFoundException();
    return { firstName: lead.firstName, lastName: lead.lastName ?? '', email: lead.email, instanceId: lead.instanceId };
  }

  /** Wysłane zgłoszenie → lead dokończony (wywoływane z RegistrationsService.create). */
  async markConverted(instanceId: string, email: string, registrationId: string) {
    const e = String(email ?? '').trim().toLowerCase();
    if (!e) return;
    await this.db.registrationLead
      .updateMany({ where: { instanceId, email: e, convertedAt: null }, data: { convertedAt: new Date(), registrationId } })
      .catch((err: Error) => this.logger.warn(`markConverted: ${err.message}`));
  }

  /** Panel: lista rozpoczętych zgłoszeń eventu. */
  async listForInstance(instanceId: string) {
    const rows = (await this.db.registrationLead.findMany({
      where: { instanceId },
      orderBy: { lastActivityAt: 'desc' },
    })) as Array<Record<string, unknown>>;
    return rows.map((l) => ({
      id: l.id,
      email: l.email,
      firstName: l.firstName,
      lastName: l.lastName ?? '',
      locale: l.locale,
      step: l.step,
      lastActivityAt: (l.lastActivityAt as Date).toISOString(),
      reminderSentAt: l.reminderSentAt ? (l.reminderSentAt as Date).toISOString() : null,
      reminderStatus: l.reminderStatus ?? null,
      convertedAt: l.convertedAt ? (l.convertedAt as Date).toISOString() : null,
      createdAt: (l.createdAt as Date).toISOString(),
    }));
  }

  async runDue(now = new Date()): Promise<RunResult> {
    if (this.running) return this.running;
    this.running = this.run(now).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(now: Date): Promise<RunResult> {
    const result: RunResult = { sent: 0, skipped: 0, converted: 0, deleted: 0 };

    // Sprzątanie: dane leadów dzień po zakończeniu eventu.
    const del = await this.db.registrationLead.deleteMany({
      where: { instance: { endsAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } },
    });
    result.deleted = del?.count ?? 0;

    const due = (await this.db.registrationLead.findMany({
      where: {
        reminderSentAt: null,
        convertedAt: null,
        lastActivityAt: { lte: new Date(now.getTime() - REMINDER_AFTER_MS), gte: new Date(now.getTime() - MAX_AGE_MS) },
      },
      include: { instance: { include: { series: { include: { page: true } } } } },
      orderBy: { lastActivityAt: 'asc' },
      take: 50,
    })) as Array<{
      id: string; instanceId: string; email: string; firstName: string; locale: string; token: string;
      instance: {
        status: string; startsAt: Date; endsAt: Date; title: unknown; capacity: number | null;
        series?: { page?: { slug?: string } | null } | null;
      };
    }>;
    if (!due.length) return result;

    const regCache = new Map<string, Set<string>>();
    for (const lead of due) {
      const inst = lead.instance;
      const mark = (data: Record<string, unknown>) =>
        this.db.registrationLead.update({ where: { id: lead.id }, data });
      if (!regCache.has(lead.instanceId)) regCache.set(lead.instanceId, await this.registeredEmails(lead.instanceId));
      const registered = regCache.get(lead.instanceId)!;
      if (registered.has(lead.email)) {
        await mark({ convertedAt: now });
        result.converted++;
        continue;
      }
      const slug = inst.series?.page?.slug;
      if (inst.status !== 'OPEN' || inst.startsAt.getTime() <= now.getTime() || !slug) {
        await mark({ reminderSentAt: now, reminderStatus: 'SKIPPED_CLOSED' });
        result.skipped++;
        continue;
      }
      if (inst.capacity && inst.capacity > 0) {
        const taken = await this.db.participant.count({
          where: { registration: { instanceId: lead.instanceId, status: { not: 'CANCELLED' } } },
        });
        if (taken >= inst.capacity) {
          await mark({ reminderSentAt: now, reminderStatus: 'SKIPPED_FULL' });
          result.skipped++;
          continue;
        }
      }
      const titles = (inst.title ?? {}) as Record<string, string>;
      // Mail idzie po polsku albo (każdy inny język) po angielsku — tytuł w tym samym języku.
      const lang = lead.locale === 'pl' ? 'pl' : 'en';
      const title = typeof inst.title === 'string' ? inst.title : titles[lang] ?? titles.pl ?? titles.en ?? 'Event';
      const status = await this.mail.sendMail({
        to: lead.email,
        type: 'REGISTRATION_REMINDER',
        locale: lead.locale,
        data: {
          firstName: lead.firstName,
          eventTitle: title,
          when: whenOf(inst.startsAt, inst.endsAt, lang),
          link: `${publicAppUrl()}/r/${encodeURIComponent(slug)}?lead=${encodeURIComponent(lead.token)}`,
        },
      });
      await mark({ reminderSentAt: now, reminderStatus: status === 'FAILED' ? 'FAILED' : 'SENT' });
      result.sent++;
      await sleep(600); // limit dostawcy maili
    }
    if (result.sent || result.skipped) this.logger.log(`Przypomnienia: ${JSON.stringify(result)}`);
    return result;
  }
}

function whenOf(startsAt: Date, endsAt: Date, lang: 'pl' | 'en'): string {
  const loc = lang === 'en' ? 'en-GB' : 'pl-PL';
  const f = (d: Date) => d.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' });
  const same = f(startsAt) === f(endsAt);
  return same ? f(startsAt) : `${f(startsAt)} – ${f(endsAt)}`;
}
