import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeployHookService } from '../content/deploy-hook.service';
import { BunnyStreamService } from './bunny-stream.service';
import { CourseAccessService } from './course-access.service';
import { CourseTrackingService } from './course-tracking.service';
import { courseUrl, isEmail, normEmail, normLangText, pickText, slugify, slugProblem } from './course-utils';

export interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

const MAX_PDF = 25 * 1024 * 1024;

type ItemRow = {
  id: string; kind: string; title: unknown; description: unknown; order: number; published: boolean;
  videoId: string | null; videoState: string | null; durationSec: number | null; thumbnailUrl: string | null;
  fileId: string | null; fileIdEn: string | null; createdAt: Date;
};

export type FileLang = 'pl' | 'en';
const fileField = (lang: FileLang) => (lang === 'en' ? 'fileIdEn' : 'fileId');
export const parseLang = (v: unknown): FileLang => (v === 'en' ? 'en' : 'pl');

/** Logika panelu admina „Formacja online" — kursy, pozycje (wideo/PDF), kursanci. */
@Injectable()
export class CoursesService {
  private readonly logger = new Logger('Courses');

  constructor(
    private readonly prisma: PrismaService,
    private readonly bunny: BunnyStreamService,
    private readonly access: CourseAccessService,
    private readonly deployHook: DeployHookService,
    private readonly tracking: CourseTrackingService,
  ) {}

  config() {
    return { video: this.bunny.status(), siteCourseBase: courseUrl('').replace(/\/$/, '') };
  }

  // ── Kursy ────────────────────────────────────────────────────────────────────

  async list() {
    const rows = await this.prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });
    const counts = await this.prisma.courseEnrollment.groupBy({
      by: ['courseId'],
      where: { revokedAt: null },
      _count: { _all: true },
    });
    const byCourse = new Map(counts.map((c: { courseId: string; _count: { _all: number } }) => [c.courseId, c._count._all]));
    return rows.map((c: { id: string; slug: string; title: unknown; status: string; createdAt: Date; _count: { items: number } }) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      status: c.status,
      url: courseUrl(c.slug),
      items: c._count.items,
      members: byCourse.get(c.id) ?? 0,
      createdAt: c.createdAt,
    }));
  }

  async slugCheck(slug: string, excludeId?: string) {
    const s = String(slug ?? '').trim();
    const problem = slugProblem(s);
    if (problem) return { ok: false, reason: problem, suggestion: slugify(s) || null };
    const taken = await this.findSlugOwner(s);
    if (taken && taken !== excludeId) return { ok: false, reason: 'Ten adres jest już zajęty przez inny kurs.', suggestion: await this.uniqueSlug(s, excludeId) };
    return { ok: true, url: courseUrl(s) };
  }

  /** Id kursu, który używa slugu (aktualnie albo w historii). */
  private async findSlugOwner(slug: string): Promise<string | null> {
    const c = await this.prisma.course.findFirst({
      where: { OR: [{ slug }, { slugHistory: { has: slug } }] },
      select: { id: true },
    });
    return c?.id ?? null;
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    const root = slugify(base) || 'kurs';
    for (let i = 0; i < 50; i++) {
      const cand = i === 0 ? root : `${root.slice(0, 56)}-${i + 1}`;
      if (slugProblem(cand)) continue;
      const owner = await this.findSlugOwner(cand);
      if (!owner || owner === excludeId) return cand;
    }
    return `${root.slice(0, 50)}-${Date.now().toString(36)}`;
  }

  async create(body: { title?: unknown; slug?: string; description?: unknown }) {
    const title = normLangText(body.title);
    if (!title?.pl && !title?.en) throw new BadRequestException('Podaj nazwę kursu.');
    let slug: string;
    if (body.slug) {
      slug = String(body.slug).trim();
      const chk = await this.slugCheck(slug);
      if (!chk.ok) throw new BadRequestException(chk.reason);
    } else {
      slug = await this.uniqueSlug(pickText(title, 'pl'));
    }
    const c = await this.prisma.course.create({
      data: { slug, title, description: normLangText(body.description) ?? undefined },
    });
    return this.get(c.id);
  }

  private async mustGet(id: string) {
    const c = await this.prisma.course.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Nie znaleziono kursu');
    return c;
  }

  /** Szczegóły kursu dla panelu. Odświeża stan wideo, które jeszcze się przetwarzają. */
  async get(id: string) {
    const c = await this.mustGet(id);
    const items = (await this.prisma.courseItem.findMany({ where: { courseId: id }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] })) as ItemRow[];
    if (this.bunny.isConfigured()) {
      await Promise.all(
        items
          .filter((i) => i.kind === 'VIDEO' && i.videoId && i.videoState !== 'READY' && i.videoState !== 'FAILED')
          .map(async (i) => {
            const updated = await this.refreshVideo(i).catch(() => null);
            if (updated) Object.assign(i, updated);
          }),
      );
    }
    const files = await this.prisma.privateFile.findMany({
      where: { id: { in: items.flatMap((i) => [i.fileId, i.fileIdEn]).filter((x): x is string => !!x) } },
      select: { id: true, size: true, originalName: true },
    });
    const fileMap = new Map(files.map((f: { id: string; size: number; originalName: string | null }) => [f.id, f]));
    const [members, pendingWelcome] = await Promise.all([
      this.prisma.courseEnrollment.count({ where: { courseId: id, revokedAt: null } }),
      this.prisma.courseEnrollment.count({ where: { courseId: id, revokedAt: null, welcomeSentAt: null } }),
    ]);
    return {
      ...c,
      url: courseUrl(c.slug),
      members,
      pendingWelcome,
      items: items.map((i) => ({
        ...i,
        file: i.fileId ? fileMap.get(i.fileId) ?? null : null,
        fileEn: i.fileIdEn ? fileMap.get(i.fileIdEn) ?? null : null,
      })),
    };
  }

  async update(
    id: string,
    body: {
      title?: unknown; description?: unknown; slug?: string; status?: string;
      sourceInstanceIds?: string[]; grantOn?: string; accessUntil?: string | null;
    },
  ) {
    const c = await this.mustGet(id);
    const data: Record<string, unknown> = {};
    let rebuild = false;
    let reconcile = false;

    if (body.title !== undefined) {
      const t = normLangText(body.title);
      if (!t) throw new BadRequestException('Nazwa kursu nie może być pusta.');
      data.title = t;
      rebuild = true;
    }
    if (body.description !== undefined) data.description = normLangText(body.description) ?? null;
    if (body.slug !== undefined && body.slug !== c.slug) {
      const slug = String(body.slug).trim();
      const chk = await this.slugCheck(slug, id);
      if (!chk.ok) throw new BadRequestException(chk.reason);
      data.slug = slug;
      // Stary adres przekierowuje (tylko gdy kurs był już publiczny); nowy nie może wisieć w historii.
      const hist = new Set(c.slugHistory.filter((s: string) => s !== slug));
      if (c.status !== 'DRAFT') hist.add(c.slug);
      data.slugHistory = [...hist];
      rebuild = true;
    }
    if (body.status !== undefined) {
      if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(body.status)) throw new BadRequestException('Nieprawidłowy status');
      data.status = body.status;
      rebuild = true;
    }
    if (body.sourceInstanceIds !== undefined) {
      if (!Array.isArray(body.sourceInstanceIds)) throw new BadRequestException('sourceInstanceIds musi być listą');
      data.sourceInstanceIds = [...new Set(body.sourceInstanceIds.map(String))];
      reconcile = true;
    }
    if (body.grantOn !== undefined) {
      if (!['CONFIRMED', 'ANY_ACTIVE'].includes(body.grantOn)) throw new BadRequestException('Nieprawidłowe grantOn');
      data.grantOn = body.grantOn;
      reconcile = true;
    }
    if (body.accessUntil !== undefined) {
      data.accessUntil = body.accessUntil ? new Date(body.accessUntil) : null;
      if (data.accessUntil && Number.isNaN((data.accessUntil as Date).getTime())) throw new BadRequestException('Nieprawidłowa data');
    }

    await this.prisma.course.update({ where: { id }, data: data as never });
    if (rebuild) this.deployHook.trigger(`kurs ${c.slug}`);
    let welcome: { sent: number; failed: number } | undefined;
    if (reconcile) await this.access.reconcileCourse(id);
    if (body.status === 'PUBLISHED' && c.status !== 'PUBLISHED') welcome = await this.access.sendPendingWelcomes(id);
    return { ...(await this.get(id)), welcome };
  }

  async remove(id: string) {
    const c = await this.mustGet(id);
    const items = await this.prisma.courseItem.findMany({ where: { courseId: id } });
    for (const i of items as ItemRow[]) {
      if (i.videoId) await this.bunny.deleteVideo(i.videoId);
      for (const fid of [i.fileId, i.fileIdEn]) if (fid) await this.prisma.privateFile.delete({ where: { id: fid } }).catch(() => null);
    }
    await this.tracking.purge({ courseId: id });
    await this.prisma.course.delete({ where: { id } });
    if (c.status !== 'DRAFT') this.deployHook.trigger(`usunięto kurs ${c.slug}`);
    return { ok: true };
  }

  // ── Pozycje ──────────────────────────────────────────────────────────────────

  private async nextOrder(courseId: string) {
    const last = await this.prisma.courseItem.findFirst({ where: { courseId }, orderBy: { order: 'desc' }, select: { order: true } });
    return (last?.order ?? -1) + 1;
  }

  async createVideo(courseId: string, body: { title?: unknown }) {
    await this.mustGet(courseId);
    const title = normLangText(body.title);
    if (!title) throw new BadRequestException('Podaj tytuł filmu.');
    const videoId = await this.bunny.createVideo(pickText(title, 'pl'));
    const item = await this.prisma.courseItem.create({
      data: { courseId, kind: 'VIDEO', title, videoId, videoState: 'UPLOADING', order: await this.nextOrder(courseId) },
    });
    return { item, upload: this.bunny.tusUpload(videoId) };
  }

  /** Ponowne dane do uploadu (np. wznowienie po zamknięciu karty / wymiana pliku). */
  async videoUpload(courseId: string, itemId: string) {
    const item = await this.mustGetItem(courseId, itemId);
    if (item.kind !== 'VIDEO' || !item.videoId) throw new BadRequestException('To nie jest film.');
    return { item, upload: this.bunny.tusUpload(item.videoId) };
  }

  /** Walidacja + zapis PDF-a jako PrivateFile. */
  private async savePdf(file: UploadedFileLike | undefined): Promise<string> {
    if (!file) throw new BadRequestException('Brak pliku');
    const isPdf = file.mimetype === 'application/pdf' || file.buffer.subarray(0, 5).toString('latin1') === '%PDF-';
    if (!isPdf) throw new BadRequestException('Dozwolone tylko pliki PDF.');
    if (file.size > MAX_PDF) throw new BadRequestException('Maksymalny rozmiar PDF to 25 MB.');
    const f = await this.prisma.privateFile.create({
      data: { mimeType: 'application/pdf', size: file.size, originalName: fixLatin1(file.originalname ?? null), data: file.buffer },
      select: { id: true },
    });
    return f.id;
  }

  /** Nowy materiał PDF. `lang` = język wgrywanego pliku (druga wersja językowa: setItemFile). */
  async createPdf(courseId: string, file: UploadedFileLike | undefined, rawTitle: unknown, rawLang?: unknown) {
    await this.mustGet(courseId);
    const lang = parseLang(rawLang);
    let title = normLangText(typeof rawTitle === 'string' && rawTitle.trim().startsWith('{') ? safeJson(rawTitle) : rawTitle);
    if (!title) title = { [lang]: (fixLatin1(file?.originalname ?? null) ?? 'Materiał').replace(/\.pdf$/i, '') };
    const fileId = await this.savePdf(file);
    const item = await this.prisma.courseItem.create({
      data: { courseId, kind: 'PDF', title, [fileField(lang)]: fileId, order: await this.nextOrder(courseId) } as never,
    });
    return { item };
  }

  /** Wgranie / podmiana wersji językowej PDF-a (PL albo EN) w istniejącym materiale. */
  async setItemFile(courseId: string, itemId: string, file: UploadedFileLike | undefined, rawLang: unknown) {
    const item = await this.mustGetItem(courseId, itemId);
    if (item.kind !== 'PDF') throw new BadRequestException('To nie jest materiał PDF.');
    const lang = parseLang(rawLang);
    const newId = await this.savePdf(file);
    const oldId = lang === 'en' ? item.fileIdEn : item.fileId;
    const updated = await this.prisma.courseItem.update({ where: { id: itemId }, data: { [fileField(lang)]: newId } as never });
    if (oldId) await this.prisma.privateFile.delete({ where: { id: oldId } }).catch(() => null);
    return updated;
  }

  /** Usunięcie jednej wersji językowej — materiał musi zachować co najmniej jeden plik. */
  async removeItemFile(courseId: string, itemId: string, rawLang: unknown) {
    const item = await this.mustGetItem(courseId, itemId);
    const lang = parseLang(rawLang);
    const target = lang === 'en' ? item.fileIdEn : item.fileId;
    const other = lang === 'en' ? item.fileId : item.fileIdEn;
    if (!target) return item;
    if (!other) throw new BadRequestException('To jedyna wersja pliku — usuń cały materiał albo najpierw dodaj drugą wersję.');
    const updated = await this.prisma.courseItem.update({ where: { id: itemId }, data: { [fileField(lang)]: null } as never });
    await this.prisma.privateFile.delete({ where: { id: target } }).catch(() => null);
    return updated;
  }

  private async mustGetItem(courseId: string, itemId: string): Promise<ItemRow> {
    const item = await this.prisma.courseItem.findFirst({ where: { id: itemId, courseId } });
    if (!item) throw new NotFoundException('Nie znaleziono pozycji kursu');
    return item as ItemRow;
  }

  async updateItem(courseId: string, itemId: string, body: { title?: unknown; description?: unknown; published?: boolean }) {
    await this.mustGetItem(courseId, itemId);
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const t = normLangText(body.title);
      if (!t) throw new BadRequestException('Tytuł nie może być pusty.');
      data.title = t;
    }
    if (body.description !== undefined) data.description = normLangText(body.description) ?? null;
    if (body.published !== undefined) data.published = !!body.published;
    return this.prisma.courseItem.update({ where: { id: itemId }, data: data as never });
  }

  async removeItem(courseId: string, itemId: string) {
    const item = await this.mustGetItem(courseId, itemId);
    await this.prisma.courseItem.delete({ where: { id: itemId } });
    await this.tracking.purge({ courseId, itemId });
    if (item.videoId) await this.bunny.deleteVideo(item.videoId);
    for (const fid of [item.fileId, item.fileIdEn]) if (fid) await this.prisma.privateFile.delete({ where: { id: fid } }).catch(() => null);
    return { ok: true };
  }

  async reorder(courseId: string, ids: string[]) {
    if (!Array.isArray(ids)) throw new BadRequestException('ids musi być listą');
    await this.prisma.$transaction(
      ids.map((id, idx) => this.prisma.courseItem.updateMany({ where: { id, courseId }, data: { order: idx } })),
    );
    return { ok: true };
  }

  /** Pobiera stan wideo z Bunny i zapisuje. */
  async refreshVideo(item: ItemRow) {
    if (!item.videoId) return null;
    const info = await this.bunny.getVideo(item.videoId);
    return this.prisma.courseItem.update({
      where: { id: item.id },
      data: {
        videoState: info.state,
        durationSec: info.durationSec ?? item.durationSec,
        thumbnailUrl: info.thumbnailUrl ?? item.thumbnailUrl,
      },
    });
  }

  async refreshItem(courseId: string, itemId: string) {
    const item = await this.mustGetItem(courseId, itemId);
    const updated = await this.refreshVideo(item);
    return updated ?? item;
  }

  /** Webhook Bunny = sygnał; stan zawsze pobieramy z API (sfałszowany webhook nic nie zmieni). */
  async onVideoWebhook(videoId: string) {
    const item = await this.prisma.courseItem.findFirst({ where: { videoId } });
    if (!item) return { ok: true, known: false };
    await this.refreshVideo(item as ItemRow);
    return { ok: true, known: true };
  }

  // ── Kursanci ─────────────────────────────────────────────────────────────────

  async enrollments(courseId: string) {
    await this.mustGet(courseId);
    const rows = await this.prisma.courseEnrollment.findMany({
      where: { courseId },
      include: { guest: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((e: {
      id: string; source: string; registrationId: string | null; revokedAt: Date | null; revokedReason: string | null;
      welcomeSentAt: Date | null; lastSeenAt: Date | null; createdAt: Date;
      guest: { email: string; firstName: string; lastName: string; passwordHash: string | null; lastLoginAt: Date | null; locale: string };
    }) => ({
      id: e.id,
      email: e.guest.email,
      firstName: e.guest.firstName,
      lastName: e.guest.lastName,
      locale: e.guest.locale,
      source: e.source,
      registrationId: e.registrationId,
      active: !e.revokedAt,
      revokedAt: e.revokedAt,
      revokedReason: e.revokedReason,
      passwordSet: !!e.guest.passwordHash,
      welcomeSentAt: e.welcomeSentAt,
      lastLoginAt: e.guest.lastLoginAt,
      lastSeenAt: e.lastSeenAt,
      createdAt: e.createdAt,
    }));
  }

  async addManual(courseId: string, body: { email?: string; firstName?: string; lastName?: string; locale?: string; sendWelcome?: boolean }) {
    const course = await this.mustGet(courseId);
    const email = normEmail(body.email);
    if (!isEmail(email)) throw new BadRequestException('Nieprawidłowy adres e-mail.');
    const r = await this.access.grant(
      course as never,
      { email, firstName: body.firstName, lastName: body.lastName, locale: body.locale },
      'MANUAL',
      undefined,
      { sendWelcome: body.sendWelcome !== false },
    );
    return { ...r, courseStatus: course.status };
  }

  /** Import listy: linie „e-mail; imię; nazwisko" (separator ; , lub tab). */
  async importList(courseId: string, text: string, sendWelcome = true) {
    const course = await this.mustGet(courseId);
    const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 500) throw new BadRequestException('Najwyżej 500 osób w jednym imporcie.');
    const result = { added: 0, existing: 0, invalid: [] as string[] };
    for (const line of lines) {
      const [rawEmail, firstName, lastName] = line.split(/[;,\t]/).map((x) => x.trim());
      const email = normEmail(rawEmail);
      if (!isEmail(email)) {
        if (!/e-?mail/i.test(line)) result.invalid.push(line); // pomijamy nagłówek CSV
        continue;
      }
      const r = await this.access.grant(course as never, { email, firstName, lastName }, 'MANUAL', undefined, { sendWelcome });
      if (r.created || r.restored) result.added++;
      else result.existing++;
    }
    return result;
  }

  async setRevoked(courseId: string, enrollmentId: string, revoked: boolean) {
    const e = await this.prisma.courseEnrollment.findFirst({ where: { id: enrollmentId, courseId } });
    if (!e) throw new NotFoundException('Nie znaleziono kursanta');
    await this.prisma.courseEnrollment.update({
      where: { id: e.id },
      data: revoked ? { revokedAt: new Date(), revokedReason: 'ADMIN' } : { revokedAt: null, revokedReason: null, source: 'MANUAL' },
    });
    return { ok: true };
  }

  async resend(courseId: string, enrollmentId: string) {
    const e = await this.prisma.courseEnrollment.findFirst({ where: { id: enrollmentId, courseId }, include: { course: true } });
    if (!e) throw new NotFoundException('Nie znaleziono kursanta');
    if (e.revokedAt) throw new ConflictException('Dostęp jest odebrany — najpierw go przywróć.');
    if (e.course.status !== 'PUBLISHED') throw new ConflictException('Kurs nie jest opublikowany — powitanie wyjdzie automatycznie przy publikacji.');
    const status = await this.access.sendWelcome(e.id);
    return { status };
  }

  async sync(courseId: string) {
    await this.mustGet(courseId);
    return this.access.reconcileCourse(courseId);
  }

  // ── Dla strony (build Astro) ─────────────────────────────────────────────────

  async publicList() {
    const rows = await this.prisma.course.findMany({
      where: { status: { in: ['PUBLISHED', 'ARCHIVED'] } },
      select: { slug: true, title: true, description: true, status: true, slugHistory: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      courses: rows.map((r: { slug: string; title: unknown; description: unknown; status: string }) => ({
        slug: r.slug, title: r.title, description: r.description, status: r.status,
      })),
      redirects: rows.flatMap((r: { slug: string; slugHistory: string[] }) => r.slugHistory.map((from) => ({ from, to: r.slug }))),
    };
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/** Multer dekoduje nazwę pliku jako latin1 — przywracamy UTF-8 (polskie znaki). */
function fixLatin1(name: string | null): string | null {
  if (!name) return name;
  try {
    const fixed = Buffer.from(name, 'latin1').toString('utf8');
    return fixed.includes('�') ? name : fixed;
  } catch {
    return name;
  }
}
