import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ACTIVE_REG_STATUSES, courseUrl, newRawToken, normEmail, pickText, sha256hex } from './course-utils';

type CourseLite = { id: string; slug: string; title: unknown; status: string; grantOn: string; sourceInstanceIds: string[] };
type Person = { email: string; firstName?: string; lastName?: string; locale?: string };

const DAY = 24 * 3600 * 1000;

/**
 * Dostęp do kursów „Formacji online": nadawanie (AUTO z zgłoszeń / MANUAL z panelu),
 * odbieranie, maile powitalne i tokeny ustawienia/resetu hasła.
 * Moduł globalny — `syncRegistrationSafe()` wołają serwisy zmieniające status zgłoszenia.
 */
@Injectable()
export class CourseAccessService {
  private readonly logger = new Logger('CourseAccess');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: NotificationsService,
  ) {}

  /** Fire-and-forget — do wołania po zmianie statusu zgłoszenia. Nigdy nie rzuca. */
  syncRegistrationSafe(registrationId: string | null | undefined): void {
    if (!registrationId) return;
    void this.syncRegistration(registrationId).catch((e: Error) =>
      this.logger.error(`sync ${registrationId}: ${e.message}`),
    );
  }

  private qualifies(course: CourseLite, status: string): boolean {
    return status === 'CONFIRMED' || (course.grantOn === 'ANY_ACTIVE' && ACTIVE_REG_STATUSES.includes(status));
  }

  /** Uzgadnia dostęp wynikający z jednego zgłoszenia (dla wszystkich kursów z jego eventem). */
  async syncRegistration(registrationId: string, onlyCourseId?: string): Promise<void> {
    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: { id: true, instanceId: true, status: true, contact: true, locale: true },
    });
    if (!reg) return;
    const courses = (await this.prisma.course.findMany({
      where: { sourceInstanceIds: { has: reg.instanceId }, ...(onlyCourseId ? { id: onlyCourseId } : {}) },
    })) as unknown as CourseLite[];
    for (const course of courses) {
      if (this.qualifies(course, reg.status)) {
        const c = (reg.contact ?? {}) as { email?: string; firstName?: string; lastName?: string };
        const email = normEmail(c.email);
        if (!email) continue;
        await this.grant(course, { email, firstName: c.firstName, lastName: c.lastName, locale: reg.locale }, 'AUTO', reg.id);
      } else {
        await this.prisma.courseEnrollment.updateMany({
          where: { courseId: course.id, registrationId: reg.id, source: 'AUTO', revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'AUTO' },
        });
      }
    }
  }

  /** Przegląd wszystkich zgłoszeń z eventów źródłowych kursu. Najpierw odbiera, potem nadaje. */
  async reconcileCourse(courseId: string): Promise<{ processed: number; active: number }> {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return { processed: 0, active: 0 };
    const regs = course.sourceInstanceIds.length
      ? await this.prisma.registration.findMany({
          where: { instanceId: { in: course.sourceInstanceIds } },
          select: { id: true, status: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const cl = course as unknown as CourseLite;
    const ordered = [
      ...regs.filter((r: { status: string }) => !this.qualifies(cl, r.status)),
      ...regs.filter((r: { status: string }) => this.qualifies(cl, r.status)),
    ];
    for (const r of ordered) await this.syncRegistration(r.id, courseId);
    const active = await this.prisma.courseEnrollment.count({ where: { courseId, revokedAt: null } });
    return { processed: regs.length, active };
  }

  /**
   * Leniwa synchronizacja przy logowaniu / „nie pamiętam hasła": jeśli ktoś ma zgłoszenie
   * w evencie źródłowym, a hook go ominął — dostęp powstaje teraz. Zwraca true, gdy nadano.
   */
  async syncByEmail(courseId: string, email: string): Promise<boolean> {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course || !course.sourceInstanceIds.length) return false;
    const e = normEmail(email);
    const regs = await this.prisma.registration.findMany({
      where: { instanceId: { in: course.sourceInstanceIds } },
      select: { id: true, status: true, contact: true },
      orderBy: { createdAt: 'desc' },
    });
    const mine = regs.filter((r: { contact: unknown }) => normEmail((r.contact as { email?: string } | null)?.email) === e);
    const ok = mine.find((r: { status: string }) => this.qualifies(course as unknown as CourseLite, r.status));
    if (!ok) return false;
    await this.syncRegistration(ok.id, courseId);
    return true;
  }

  async findGuestByEmail(email: string) {
    return this.prisma.guestAccount.findFirst({ where: { email: { equals: normEmail(email), mode: 'insensitive' } } });
  }

  private async findOrCreateGuest(p: Person) {
    const email = normEmail(p.email);
    const existing = await this.findGuestByEmail(email);
    if (existing) {
      const patch: Record<string, string> = {};
      if (!existing.firstName && p.firstName) patch.firstName = p.firstName.trim();
      if (!existing.lastName && p.lastName) patch.lastName = p.lastName.trim();
      return Object.keys(patch).length
        ? this.prisma.guestAccount.update({ where: { id: existing.id }, data: patch })
        : existing;
    }
    return this.prisma.guestAccount.create({
      data: {
        email,
        firstName: (p.firstName ?? '').trim(),
        lastName: (p.lastName ?? '').trim(),
        locale: p.locale === 'en' ? 'en' : 'pl',
      },
    });
  }

  /**
   * Nadaje dostęp (idempotentnie). AUTO nie przywraca dostępu odebranego ręcznie przez admina;
   * MANUAL zawsze przywraca i „przypina" dostęp (nie odbierze go anulowanie zgłoszenia).
   */
  async grant(
    course: CourseLite,
    person: Person,
    source: 'AUTO' | 'MANUAL',
    registrationId?: string,
    opts: { sendWelcome?: boolean } = {},
  ): Promise<{ enrollmentId: string; created: boolean; restored: boolean; mail?: string }> {
    const guest = await this.findOrCreateGuest(person);
    const existing = await this.prisma.courseEnrollment.findUnique({
      where: { courseId_guestId: { courseId: course.id, guestId: guest.id } },
    });
    let enrollmentId: string;
    let created = false;
    let restored = false;
    let welcomeSentAt: Date | null = null;

    if (!existing) {
      const e = await this.prisma.courseEnrollment.create({
        data: { courseId: course.id, guestId: guest.id, source, registrationId: registrationId ?? null },
      });
      enrollmentId = e.id;
      created = true;
    } else {
      enrollmentId = existing.id;
      welcomeSentAt = existing.welcomeSentAt;
      const data: Record<string, unknown> = {};
      if (existing.revokedAt) {
        if (source === 'MANUAL' || existing.revokedReason !== 'ADMIN') {
          data.revokedAt = null;
          data.revokedReason = null;
          restored = true;
        } else {
          return { enrollmentId, created: false, restored: false }; // admin odebrał — auto nie przywraca
        }
      }
      if (source === 'MANUAL' && existing.source !== 'MANUAL') data.source = 'MANUAL';
      if (source === 'AUTO' && registrationId && existing.registrationId !== registrationId) data.registrationId = registrationId;
      if (Object.keys(data).length) {
        await this.prisma.courseEnrollment.update({ where: { id: existing.id }, data: data as never });
      }
    }

    let mail: string | undefined;
    if ((opts.sendWelcome ?? true) && course.status === 'PUBLISHED' && !welcomeSentAt) {
      mail = await this.sendWelcome(enrollmentId);
    }
    return { enrollmentId, created, restored, mail };
  }

  /** Jednorazowy token (surowy w linku, w bazie tylko hash). */
  async issueToken(guestId: string, purpose: 'SET_PASSWORD' | 'RESET_PASSWORD', courseId: string | null, ttlMs: number) {
    const raw = newRawToken();
    await this.prisma.memberToken.create({
      data: { guestId, purpose, courseId, tokenHash: sha256hex(raw), expiresAt: new Date(Date.now() + ttlMs) },
    });
    return raw;
  }

  /**
   * Mail powitalny: bez hasła → link „Ustaw hasło" (14 dni); z hasłem → „Masz dostęp, zaloguj się".
   * welcomeSentAt ustawiamy tylko przy faktycznym wysłaniu (LOGGED/FAILED → ponowimy przy publikacji/„wyślij ponownie").
   */
  async sendWelcome(enrollmentId: string): Promise<string> {
    const e = await this.prisma.courseEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { guest: true, course: true },
    });
    if (!e || e.revokedAt) return 'SKIPPED';
    const lng = e.guest.locale === 'en' ? 'en' : 'pl';
    const base = courseUrl(e.course.slug);
    let type = 'COURSE_ACCESS';
    let link = base;
    if (!e.guest.passwordHash) {
      const raw = await this.issueToken(e.guest.id, 'SET_PASSWORD', e.course.id, 14 * DAY);
      type = 'COURSE_WELCOME';
      link = `${base}?haslo=${raw}`;
    }
    const status = await this.mail.sendMail({
      to: e.guest.email,
      type,
      locale: lng,
      data: { courseTitle: pickText(e.course.title, lng), firstName: e.guest.firstName, email: e.guest.email, link, courseLink: base },
    });
    if (status === 'SENT') {
      await this.prisma.courseEnrollment.update({ where: { id: e.id }, data: { welcomeSentAt: new Date() } });
    }
    return status;
  }

  /** Wysyła zaległe powitania (np. po publikacji kursu). */
  async sendPendingWelcomes(courseId: string): Promise<{ sent: number; failed: number }> {
    const pending = await this.prisma.courseEnrollment.findMany({
      where: { courseId, revokedAt: null, welcomeSentAt: null },
      select: { id: true },
    });
    let sent = 0;
    let failed = 0;
    for (const p of pending) {
      const st = await this.sendWelcome(p.id);
      if (st === 'SENT') sent++;
      else failed++;
    }
    return { sent, failed };
  }

  /** Mail z linkiem resetu hasła (1 h). */
  /** Mail z linkiem do ustawienia nowego hasła. Domyślnie 1 h (samoobsługa); z panelu admina dłużej. */
  async sendPasswordReset(guestId: string, course: { id: string; slug: string; title: unknown }, ttlMs = 3600 * 1000): Promise<string> {
    const guest = await this.prisma.guestAccount.findUnique({ where: { id: guestId } });
    if (!guest) return 'SKIPPED';
    const lng = guest.locale === 'en' ? 'en' : 'pl';
    const raw = await this.issueToken(guest.id, 'RESET_PASSWORD', course.id, ttlMs);
    return this.mail.sendMail({
      to: guest.email,
      type: 'MEMBER_PASSWORD_RESET',
      locale: lng,
      data: {
        courseTitle: pickText(course.title, lng),
        firstName: guest.firstName,
        link: `${courseUrl(course.slug)}?haslo=${raw}`,
        validHours: Math.round(ttlMs / 3600000),
      },
    });
  }
}
