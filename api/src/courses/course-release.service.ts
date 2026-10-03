import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { courseUrl, pickText } from './course-utils';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Materiały publikowane w odstępie do 10 min → jeden wspólny mail (wysłany z ostatnim z nich). */
const GROUP_WINDOW_MS = 10 * 60 * 1000;
/** Ale mail o materiale nie czeka dłużej niż 30 min (łańcuch publikacji co kilka minut). */
const MAX_HOLD_MS = 30 * 60 * 1000;

/**
 * Publikacja stopniowa („incremental publishing"): materiały z datą `publishAt` stają się widoczne
 * dla kursantów same w chwili publikacji (filtr przy odczycie — działa nawet, gdy serwer spał),
 * a ta usługa wysyła wtedy kursantom maila „Nowe materiały czekają na Ciebie".
 *
 * Grupowanie: materiały z tym samym czasem publikacji — zawsze jeden mail; odstęp do 10 min —
 * też jeden mail (wysłany z ostatnim materiałem paczki, maks. 30 min opóźnienia).
 *
 * Wyzwalacze (idempotentne — `releaseNotifiedAt` zapobiega podwójnym mailom):
 *  - co minutę, gdy API działa,
 *  - przy wejściu kursanta/admina do kursu,
 *  - zewnętrzny ping `GET /cron/course-releases` (np. UptimeRobot co 5 min — budzi też uśpiony Render).
 */
@Injectable()
export class CourseReleaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CourseRelease');
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;
  private lastRun = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: NotificationsService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.releaseDue().catch(() => undefined), 60_000);
    setTimeout(() => void this.releaseDue().catch(() => undefined), 15_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Tanie „szturchnięcie" z ruchu na stronie (najwyżej raz na 30 s). */
  kick() {
    if (Date.now() - this.lastRun < 30_000) return;
    void this.releaseDue().catch((e: Error) => this.logger.warn(`kick: ${e.message}`));
  }

  async releaseDue(now = new Date()) {
    if (this.running) return this.running as Promise<{ courses: number; items: number; mails: number }>;
    this.lastRun = Date.now();
    this.running = this.run(now).finally(() => {
      this.running = null;
    });
    return this.running as Promise<{ courses: number; items: number; mails: number }>;
  }

  private async run(now: Date) {
    const due = (await this.prisma.courseItem.findMany({
      where: { published: true, publishAt: { lte: now }, releaseNotifiedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    })) as Array<{ id: string; courseId: string; kind: string; title: unknown; publishAt: Date | null }>;
    const result = { courses: 0, items: 0, mails: 0 };
    if (!due.length) return result;

    const byCourse = new Map<string, typeof due>();
    for (const it of due) byCourse.set(it.courseId, [...(byCourse.get(it.courseId) ?? []), it]);

    for (const [courseId, items] of byCourse) {
      // Jeden mail na „paczkę": jeśli w tym kursie kolejny materiał publikuje się za chwilę
      // (≤ GROUP_WINDOW), czekamy na niego i wysyłamy wspólny mail. Materiały i tak są już
      // widoczne (filtr przy odczycie) — opóźnia się tylko mail, najwyżej o MAX_HOLD.
      const oldest = Math.min(...items.map((i) => (i.publishAt ? new Date(i.publishAt).getTime() : now.getTime())));
      if (now.getTime() - oldest < MAX_HOLD_MS) {
        const soon = await this.prisma.courseItem.findFirst({
          where: {
            courseId,
            published: true,
            releaseNotifiedAt: null,
            publishAt: { gt: now, lte: new Date(now.getTime() + GROUP_WINDOW_MS) },
          },
          select: { id: true },
        });
        if (soon) continue;
      }
      // Najpierw „zajmujemy" pozycje — równoległy przebieg nie wyśle drugi raz.
      const claimed = await this.prisma.courseItem.updateMany({
        where: { id: { in: items.map((i) => i.id) }, releaseNotifiedAt: null },
        data: { releaseNotifiedAt: now },
      });
      if (!claimed.count) continue;
      result.courses++;
      result.items += items.length;

      const course = await this.prisma.course.findUnique({ where: { id: courseId } });
      // Kurs nieopublikowany / zamknięty: materiał i tak jest oznaczony, ale bez maili
      // (inaczej publikacja kursu po czasie wysłałaby lawinę starych powiadomień).
      if (!course || course.status !== 'PUBLISHED' || (course.accessUntil && course.accessUntil.getTime() < now.getTime())) continue;

      const enrollments = (await this.prisma.courseEnrollment.findMany({
        where: { courseId, revokedAt: null },
        include: { guest: true },
      })) as Array<{ guest: { email: string; firstName: string; locale: string; passwordHash: string | null } }>;

      let sent = 0;
      for (const e of enrollments) {
        const lng = e.guest.locale === 'en' ? 'en' : 'pl';
        const status = await this.mail
          .sendMail({
            to: e.guest.email,
            type: 'COURSE_NEW_MATERIALS',
            locale: lng,
            data: {
              courseTitle: pickText(course.title, lng),
              firstName: e.guest.firstName,
              items: items.map((i) => ({ kind: i.kind, title: pickText(i.title, lng) })),
              link: courseUrl(course.slug),
              hasPassword: !!e.guest.passwordHash,
            },
          })
          .catch(() => 'FAILED');
        if (status === 'SENT') {
          result.mails++;
          sent++;
        }
        await sleep(600); // limit dostawcy (Resend ~2 maile/s)
      }
      await this.prisma.courseItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { releaseMails: sent } });
      this.logger.log(`Kurs ${course.slug}: opublikowano ${items.length} materiał(y), maile: ${sent}/${enrollments.length}`);
    }
    return result;
  }
}
