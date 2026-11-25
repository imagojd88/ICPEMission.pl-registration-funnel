import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { publicAppUrl } from '../invitations/guest-invite-config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Powiadamiamy tylko, gdy start zapisów minął nie dawniej niż tyle temu (serwer mógł spać). */
const NOTIFY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Lista oczekujących na otwarcie zapisów: gość zostawia e-mail na stronie z licznikiem,
 * a w chwili startu rejestracji dostaje JEDEN mail z linkiem do zapisów.
 */
@Injectable()
export class WaitlistService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Waitlist');
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<{ sent: number; failed: number }> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: NotificationsService,
  ) {}

  private get db(): Db {
    return this.prisma as Db;
  }

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runDue().catch(() => undefined), 2 * 60_000);
    setTimeout(() => void this.runDue().catch(() => undefined), 45_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Publiczne: zapis na listę (tylko gdy event jest otwarty, a zapisy jeszcze nie ruszyły). */
  async join(dto: { instanceId?: string; email?: string; locale?: string }) {
    const email = String(dto.email ?? '').trim().toLowerCase();
    if (!dto.instanceId || !EMAIL_RE.test(email) || email.length > 200) throw new BadRequestException('Podaj poprawny adres e-mail.');
    const inst = await this.db.eventInstance.findUnique({ where: { id: dto.instanceId }, select: { id: true, status: true, registrationOpensAt: true } });
    if (!inst || inst.status !== 'OPEN') throw new BadRequestException('Lista oczekujących nie jest dostępna dla tego wydarzenia.');
    if (!inst.registrationOpensAt || inst.registrationOpensAt.getTime() <= Date.now()) {
      throw new BadRequestException('Zapisy na to wydarzenie już trwają.');
    }
    const locale = ['pl', 'en', 'it', 'ko', 'zh'].includes(String(dto.locale)) ? String(dto.locale) : 'pl';
    await this.db.waitlistEntry.upsert({
      where: { instanceId_email: { instanceId: dto.instanceId, email } },
      create: { instanceId: dto.instanceId, email, locale },
      update: { locale },
    });
    return { ok: true };
  }

  /** Panel: liczba i lista zapisanych na powiadomienie. */
  async listForInstance(instanceId: string) {
    const rows = (await this.db.waitlistEntry.findMany({ where: { instanceId }, orderBy: { createdAt: 'asc' } })) as Array<{
      id: string; email: string; locale: string; createdAt: Date; notifiedAt: Date | null; notifyStatus: string | null;
    }>;
    return {
      count: rows.length,
      notified: rows.filter((r) => r.notifiedAt).length,
      entries: rows.map((r) => ({
        id: r.id,
        email: r.email,
        locale: r.locale,
        createdAt: r.createdAt.toISOString(),
        notifiedAt: r.notifiedAt ? r.notifiedAt.toISOString() : null,
        notifyStatus: r.notifyStatus,
      })),
    };
  }

  runDue(now = new Date()): Promise<{ sent: number; failed: number }> {
    if (!this.running) {
      this.running = this.run(now).finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async run(now: Date): Promise<{ sent: number; failed: number }> {
    const result = { sent: 0, failed: 0 };
    const due = (await this.db.waitlistEntry.findMany({
      where: {
        notifiedAt: null,
        instance: { status: 'OPEN', registrationOpensAt: { lte: now, gte: new Date(now.getTime() - NOTIFY_WINDOW_MS) } },
      },
      include: { instance: { select: { title: true, series: { select: { page: { select: { slug: true } } } } } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })) as Array<{ id: string; email: string; locale: string; instance: { title: unknown; series?: { page?: { slug?: string } | null } | null } }>;
    for (const e of due) {
      const slug = e.instance.series?.page?.slug;
      if (!slug) continue;
      const titles = (e.instance.title ?? {}) as Record<string, string>;
      const lang = e.locale === 'pl' || e.locale === 'ko' || e.locale === 'zh' ? e.locale : 'en';
      const title = typeof e.instance.title === 'string'
        ? e.instance.title
        : titles[lang]?.trim() || titles.en?.trim() || titles.pl || 'Event';
      let status: string;
      try {
        status = await this.mail.sendMail({
          to: e.email,
          type: 'WAITLIST_OPEN',
          locale: e.locale,
          data: { eventTitle: title, link: `${publicAppUrl()}/r/${slug}` },
        });
      } catch (err) {
        this.logger.warn(`Waitlist ${e.id}: ${(err as Error).message}`);
        status = 'FAILED';
      }
      // Oznaczamy zawsze (także przy błędzie) — nie zasypujemy nikogo ponowieniami co 2 minuty.
      await this.db.waitlistEntry.update({ where: { id: e.id }, data: { notifiedAt: new Date(), notifyStatus: status } });
      if (status === 'SENT') result.sent += 1;
      else result.failed += 1;
    }
    if (due.length) this.logger.log(`Lista oczekujących: wysłano ${result.sent}, nieudane ${result.failed}`);
    return result;
  }
}
