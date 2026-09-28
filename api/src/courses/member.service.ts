import {
  BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { BunnyStreamService } from './bunny-stream.service';
import { CourseAccessService } from './course-access.service';
import { CourseTrackingService } from './course-tracking.service';
import type { MemberCtx } from './member-auth.guard';
import { courseUrl, memberJwtSecret, normEmail, rateLimit, sha256hex, signedFilePath } from './course-utils';

const GENERIC_LOGIN_ERROR =
  'Nieprawidłowy e-mail lub hasło. Jeśli logujesz się pierwszy raz, użyj linku z maila powitalnego albo „Nie pamiętam hasła".';

type CourseRow = { id: string; slug: string; title: unknown; description: unknown; status: string; accessUntil: Date | null; slugHistory: string[] };

/** Logowanie kursantów i treść kursu dla zalogowanych. */
@Injectable()
export class MemberService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly access: CourseAccessService,
    private readonly bunny: BunnyStreamService,
    private readonly tracking: CourseTrackingService,
  ) {}

  /**
   * Podgląd kursu przez admina: token kursanta z flagą `adm` (30 dni — jak „Zapamiętaj mnie" w panelu) — działa w każdym kursie, także w szkicu,
   * bez zapisu aktywności. Przekazywany w #fragmencie adresu (nie trafia do logów serwera).
   */
  async previewUrl(courseId: string, admin: { sub?: string; email?: string } | undefined) {
    const c = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!c) throw new NotFoundException('Nie znaleziono kursu');
    const token = this.jwt.sign(
      { sub: `admin:${admin?.sub ?? 'service'}`, email: admin?.email ?? 'admin', realm: 'member', adm: true },
      { secret: memberJwtSecret(), expiresIn: '30d' },
    );
    return { url: `${courseUrl(c.slug)}#podglad=${token}` };
  }

  private sign(guest: { id: string; email: string }) {
    return this.jwt.sign({ sub: guest.id, email: guest.email, realm: 'member' }, { secret: memberJwtSecret(), expiresIn: '7d' });
  }

  /** Kurs widoczny publicznie (opublikowany albo zarchiwizowany — ten drugi bez dostępu do treści). */
  private async courseBySlug(slug: string): Promise<CourseRow | null> {
    return (await this.prisma.course.findFirst({
      where: { slug: String(slug ?? ''), status: { in: ['PUBLISHED', 'ARCHIVED'] } },
    })) as CourseRow | null;
  }

  async publicCourse(slug: string) {
    const c = await this.courseBySlug(slug);
    if (c) return { slug: c.slug, title: c.title, description: c.description, status: c.status, open: this.isOpen(c) };
    const moved = await this.prisma.course.findFirst({
      where: { slugHistory: { has: String(slug ?? '') }, status: { in: ['PUBLISHED', 'ARCHIVED'] } },
      select: { slug: true },
    });
    if (moved) return { redirectTo: moved.slug };
    throw new NotFoundException('Nie znaleziono kursu');
  }

  private isOpen(c: CourseRow) {
    return c.status === 'PUBLISHED' && (!c.accessUntil || c.accessUntil.getTime() > Date.now());
  }

  private async activeEnrollment(courseId: string, guestId: string) {
    const e = await this.prisma.courseEnrollment.findUnique({ where: { courseId_guestId: { courseId, guestId } } });
    return e && !e.revokedAt ? e : null;
  }

  private limit(key: string, max: number, windowMs: number) {
    if (!rateLimit(key, max, windowMs)) {
      throw new HttpException('Zbyt wiele prób — spróbuj ponownie za kilka minut.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async login(body: { email?: string; password?: string; slug?: string }, ip: string) {
    const email = normEmail(body.email);
    const password = String(body.password ?? '');
    if (!email || !password) throw new BadRequestException('Podaj e-mail i hasło.');
    this.limit(`login:${ip}`, 30, 15 * 60 * 1000);
    this.limit(`login:${email}`, 10, 15 * 60 * 1000);

    const course = await this.courseBySlug(String(body.slug ?? ''));
    if (!course) throw new NotFoundException('Nie znaleziono kursu');

    const guest = await this.access.findGuestByEmail(email);
    if (!guest?.passwordHash) {
      // Ktoś ze zgłoszeniem, kogo hook ominął — nadaj dostęp i wyślij link do ustawienia hasła.
      if (this.isOpen(course)) await this.access.syncByEmail(course.id, email).catch(() => false);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }
    const ok = await argon2.verify(guest.passwordHash, password).catch(() => false);
    if (!ok) throw new UnauthorizedException(GENERIC_LOGIN_ERROR);

    if (!this.isOpen(course)) throw new ForbiddenException('Dostęp do tego kursu jest już zamknięty.');
    let enr = await this.activeEnrollment(course.id, guest.id);
    if (!enr && (await this.access.syncByEmail(course.id, email).catch(() => false))) {
      enr = await this.activeEnrollment(course.id, guest.id);
    }
    if (!enr) throw new ForbiddenException('To konto nie ma dostępu do tego kursu. Skontaktuj się z organizatorem.');

    await this.prisma.guestAccount.update({ where: { id: guest.id }, data: { lastLoginAt: new Date() } });
    this.tracking.log(course.id, guest.id, 'LOGIN');
    return { accessToken: this.sign(guest), member: { firstName: guest.firstName, email: guest.email } };
  }

  /** Ustawienie hasła z linku (powitanie lub reset). Zwraca od razu token logowania. */
  async setPassword(body: { token?: string; password?: string }, ip: string) {
    this.limit(`setpw:${ip}`, 20, 15 * 60 * 1000);
    const password = String(body.password ?? '');
    if (password.length < 8) throw new BadRequestException('Hasło musi mieć co najmniej 8 znaków.');
    if (password.length > 200) throw new BadRequestException('Hasło jest za długie.');
    const rec = await this.prisma.memberToken.findUnique({ where: { tokenHash: sha256hex(String(body.token ?? '')) } });
    if (!rec || rec.usedAt || rec.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Link wygasł albo został już użyty. Użyj „Nie pamiętam hasła", aby dostać nowy.');
    }
    const guest = await this.prisma.guestAccount.update({
      where: { id: rec.guestId },
      data: { passwordHash: await argon2.hash(password), passwordSetAt: new Date(), lastLoginAt: new Date() },
    });
    // Zużywamy ten i wszystkie inne niewykorzystane linki tej osoby.
    await this.prisma.memberToken.updateMany({ where: { guestId: guest.id, usedAt: null }, data: { usedAt: new Date() } });
    this.tracking.log(rec.courseId, guest.id, 'PASSWORD_SET', null, { via: rec.purpose });
    return { accessToken: this.sign(guest), member: { firstName: guest.firstName, email: guest.email } };
  }

  /** „Nie pamiętam hasła" — zawsze ta sama odpowiedź (bez ujawniania, czy konto istnieje). */
  async forgot(body: { email?: string; slug?: string }, ip: string) {
    const email = normEmail(body.email);
    this.limit(`forgot:${ip}`, 10, 15 * 60 * 1000);
    const done = { ok: true };
    if (!email) return done;
    if (!rateLimit(`forgot:${email}`, 3, 15 * 60 * 1000)) return done;
    const course = await this.courseBySlug(String(body.slug ?? ''));
    if (!course || !this.isOpen(course)) return done;

    let guest = await this.access.findGuestByEmail(email);
    let enr = guest ? await this.activeEnrollment(course.id, guest.id) : null;
    if (!enr) {
      const granted = await this.access.syncByEmail(course.id, email).catch(() => false);
      if (granted) {
        guest = await this.access.findGuestByEmail(email);
        enr = guest ? await this.activeEnrollment(course.id, guest.id) : null;
        // Świeżo nadany dostęp dla konta bez hasła = mail powitalny z linkiem już poszedł.
        if (enr?.welcomeSentAt && !guest?.passwordHash) return done;
      }
    }
    if (guest && enr) {
      await this.access.sendPasswordReset(guest.id, course);
      this.tracking.log(course.id, guest.id, 'RESET_REQUEST');
    }
    return done;
  }

  /**
   * Otwarcie linku z maila (?haslo=…): zapis kliknięcia + informacja, czy link jest jeszcze ważny
   * (strona od razu pokaże „link wygasł" zamiast formularza, który się nie uda).
   */
  async linkOpen(body: { token?: string }, ip: string) {
    this.limit(`link:${ip}`, 30, 15 * 60 * 1000);
    const rec = await this.prisma.memberToken.findUnique({ where: { tokenHash: sha256hex(String(body.token ?? '')) } });
    if (!rec) return { valid: false };
    this.tracking.log(rec.courseId, rec.guestId, 'EMAIL_LINK', null, { purpose: rec.purpose });
    return { valid: !rec.usedAt && rec.expiresAt.getTime() > Date.now() };
  }

  /** Kurs + pozycje widoczne dla kursanta. */
  async course(slug: string, m: MemberCtx) {
    const { course, enrollment } = await this.requireAccess(slug, m);
    if (enrollment && (!enrollment.lastSeenAt || Date.now() - enrollment.lastSeenAt.getTime() > 5 * 60 * 1000)) {
      await this.prisma.courseEnrollment.update({ where: { id: enrollment.id }, data: { lastSeenAt: new Date() } });
    }
    if (!m.admin) await this.tracking.logCourseView(course.id, m.guestId).catch(() => undefined);
    const items = await this.prisma.courseItem.findMany({
      where: { courseId: course.id, published: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    const guest = m.admin
      ? { firstName: '', email: m.email }
      : await this.prisma.guestAccount.findUnique({ where: { id: m.guestId }, select: { firstName: true, email: true } });
    return {
      preview: m.admin ? { status: course.status } : null,
      slug: course.slug,
      title: course.title,
      description: course.description,
      accessUntil: course.accessUntil,
      member: guest,
      items: items
        .filter((i: { kind: string; videoState: string | null; fileId: string | null; fileIdEn: string | null }) =>
          i.kind === 'VIDEO' ? i.videoState === 'READY' : !!(i.fileId || i.fileIdEn),
        )
        .map((i: {
          id: string; kind: string; title: unknown; description: unknown; durationSec: number | null; thumbnailUrl: string | null;
          fileId: string | null; fileIdEn: string | null;
        }) => ({
          id: i.id, kind: i.kind, title: i.title, description: i.description, durationSec: i.durationSec, thumbnailUrl: i.thumbnailUrl,
          // PDF: dostępne wersje językowe — strona pokaże „tylko po polsku / English only".
          ...(i.kind === 'PDF' ? { langs: [...(i.fileId ? ['pl'] : []), ...(i.fileIdEn ? ['en'] : [])] } : {}),
        })),
    };
  }

  private async requireAccess(slug: string, m: MemberCtx) {
    if (m.admin) {
      // Admin (podgląd): każdy kurs, także szkic i archiwum; brak enrollmentu.
      const c = (await this.prisma.course.findFirst({ where: { slug: String(slug ?? '') } })) as CourseRow | null;
      if (!c) throw new NotFoundException('Nie znaleziono kursu');
      return { course: c, enrollment: null };
    }
    const guestId = m.guestId;
    // Zmiana hasła (także przez admina) unieważnia wcześniejsze sesje na innych urządzeniach.
    const g = await this.prisma.guestAccount.findUnique({ where: { id: guestId }, select: { passwordSetAt: true } });
    if (!g) throw new UnauthorizedException('Sesja wygasła — zaloguj się ponownie.');
    if (g.passwordSetAt && m.iat && m.iat * 1000 < g.passwordSetAt.getTime() - 2000) {
      throw new UnauthorizedException('Hasło zostało zmienione — zaloguj się ponownie.');
    }
    const course = await this.courseBySlug(slug);
    if (!course) throw new NotFoundException('Nie znaleziono kursu');
    if (!this.isOpen(course)) throw new ForbiddenException('Dostęp do tego kursu jest zamknięty.');
    const enrollment = await this.activeEnrollment(course.id, guestId);
    if (!enrollment) throw new ForbiddenException('Nie masz dostępu do tego kursu.');
    return { course, enrollment };
  }

  private async requireItem(slug: string, itemId: string, m: MemberCtx) {
    const { course } = await this.requireAccess(slug, m);
    const item = await this.prisma.courseItem.findFirst({ where: { id: itemId, courseId: course.id, published: true } });
    if (!item) throw new NotFoundException('Nie znaleziono materiału');
    return item;
  }

  async play(slug: string, itemId: string, m: MemberCtx) {
    const item = await this.requireItem(slug, itemId, m);
    if (item.kind !== 'VIDEO' || !item.videoId || item.videoState !== 'READY') throw new NotFoundException('Film nie jest dostępny');
    const { url, expiresAt } = this.bunny.embedUrl(item.videoId);
    if (!m.admin) this.tracking.log(item.courseId, m.guestId, 'VIDEO_PLAY', item.id);
    // `track: false` dla podglądu admina — strona nie wysyła wtedy postępu oglądania.
    return { embedUrl: url, expiresAt, track: !m.admin };
  }

  /** Heartbeat postępu oglądania (co ~15 s z odtwarzacza). */
  async progress(slug: string, itemId: string, m: MemberCtx, body: { buckets?: unknown; position?: unknown; duration?: unknown }) {
    if (m.admin) return { ok: true, skipped: true };
    const item = await this.requireItem(slug, itemId, m);
    if (item.kind !== 'VIDEO') throw new BadRequestException('To nie jest film');
    return this.tracking.recordProgress(item.courseId, item.id, m.guestId, body);
  }

  /** Link do PDF w języku kursanta; gdy brak tej wersji — druga dostępna. */
  async fileLink(slug: string, itemId: string, m: MemberCtx, lang?: string, action?: string) {
    const item = await this.requireItem(slug, itemId, m);
    const fileId = lang === 'en' ? item.fileIdEn ?? item.fileId : item.fileId ?? item.fileIdEn;
    if (item.kind !== 'PDF' || !fileId) throw new NotFoundException('Plik nie jest dostępny');
    const view = signedFilePath(fileId, 600, false);
    const dl = signedFilePath(fileId, 600, true);
    if (!m.admin && (action === 'open' || action === 'download')) {
      this.tracking.log(item.courseId, m.guestId, action === 'open' ? 'PDF_OPEN' : 'PDF_DOWNLOAD', item.id, {
        lang: fileId === item.fileIdEn ? 'en' : 'pl',
      });
    }
    return { path: view.path, downloadPath: dl.path, expiresAt: view.expiresAt, lang: fileId === item.fileIdEn ? 'en' : 'pl' };
  }

  async file(fileId: string) {
    const f = await this.prisma.privateFile.findUnique({ where: { id: fileId } });
    if (!f) throw new NotFoundException('Nie znaleziono pliku');
    return f;
  }
}
