import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { DeployHookService } from '../content/deploy-hook.service';
import { randomBytes } from 'crypto';
import { R2StorageService, PART_SIZE } from './r2-storage.service';
import { sortModules } from './course-progress';
import { CourseAccessService } from './course-access.service';
import { CourseTrackingService } from './course-tracking.service';
import { resumeUptimeMonitor } from '../integrations/uptime-keepalive';
import { courseUrl, siteBase, isEmail, normEmail, normLangText, pickText, slugify, slugProblem } from './course-utils';

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
  videoKey?: string | null; videoSizeMb?: number | null; uploadId?: string | null; uploadKey?: string | null; thumbKey?: string | null;
  moduleId?: string | null; courseId?: string;
  fileId: string | null; fileIdEn: string | null; createdAt: Date;
  publishAt?: Date | null; releaseNotifiedAt?: Date | null;
};

export type FileLang = 'pl' | 'en';
const fileField = (lang: FileLang) => (lang === 'en' ? 'fileIdEn' : 'fileId');
export const parseLang = (v: unknown): FileLang => (v === 'en' ? 'en' : 'pl');

/**
 * Data publikacji z body: pusta → null (od razu). Data przeszła → oznaczamy jako już „ogłoszoną"
 * (bez maila), przyszła → mail „nowe materiały" wyjdzie w chwili publikacji.
 */
function publishFields(raw: unknown): { publishAt: Date | null; releaseNotifiedAt: Date | null; releaseMails: null } | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return { publishAt: null, releaseNotifiedAt: null, releaseMails: null };
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Nieprawidłowa data publikacji.');
  // Zaplanowana publikacja → niech monitor UptimeRobot budzi API (mail wyjdzie o czasie).
  if (d.getTime() > Date.now()) void resumeUptimeMonitor();
  return { publishAt: d, releaseNotifiedAt: d.getTime() <= Date.now() ? new Date() : null, releaseMails: null };
}

/** Logika panelu admina „Formacja online" — kursy, pozycje (wideo/PDF), kursanci. */
@Injectable()
export class CoursesService {
  private readonly logger = new Logger('Courses');

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2StorageService,
    private readonly access: CourseAccessService,
    private readonly deployHook: DeployHookService,
    private readonly tracking: CourseTrackingService,
  ) {}

  config() {
    return { video: this.r2.status(), siteCourseBase: courseUrl('').replace(/\/+$/, '') };
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
    const storage = await this.storageByCourse();
    return rows.map((c: { id: string; slug: string; title: unknown; status: string; createdAt: Date; _count: { items: number } }) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      status: c.status,
      url: courseUrl(c.slug),
      items: c._count.items,
      members: byCourse.get(c.id) ?? 0,
      storage: storage.get(c.id) ?? emptyStorage(),
      createdAt: c.createdAt,
    }));
  }

  /**
   * Rozmiar plików kursów: filmy (R2, rozmiar zapisany przy wysyłce) i PDF-y (baza danych, obie wersje językowe).
   * Bez `courseId` — wszystkie kursy (lista). Treści plików nie pobieramy, tylko ich rozmiary.
   */
  private async storageByCourse(courseId?: string): Promise<Map<string, CourseStorage>> {
    const items = (await this.prisma.courseItem.findMany({
      where: courseId ? { courseId } : {},
      select: { courseId: true, kind: true, videoKey: true, videoSizeMb: true, fileId: true, fileIdEn: true },
    })) as Array<{ courseId: string; kind: string; videoKey: string | null; videoSizeMb: number | null; fileId: string | null; fileIdEn: string | null }>;
    const fileIds = items.flatMap((i) => [i.fileId, i.fileIdEn]).filter((x): x is string => !!x);
    const files = fileIds.length
      ? ((await this.prisma.privateFile.findMany({ where: { id: { in: fileIds } }, select: { id: true, size: true } })) as Array<{ id: string; size: number }>)
      : [];
    const size = new Map(files.map((f) => [f.id, f.size]));
    const out = new Map<string, CourseStorage>();
    for (const i of items) {
      const st = out.get(i.courseId) ?? emptyStorage();
      if (i.kind === 'VIDEO' && i.videoKey) {
        st.videos++;
        st.videoBytes += (i.videoSizeMb ?? 0) * 1024 * 1024;
      }
      if (i.kind === 'PDF') {
        const n = [i.fileId, i.fileIdEn].filter((x): x is string => !!x);
        st.pdfFiles += n.length;
        st.pdfBytes += n.reduce((sum, id) => sum + (size.get(id) ?? 0), 0);
      }
      out.set(i.courseId, st);
    }
    return out;
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

  /** Szczegóły kursu dla panelu (materiały, moduły, pliki). */
  async get(id: string) {
    const c = await this.mustGet(id);
    const [items, modules] = await Promise.all([
      this.prisma.courseItem.findMany({ where: { courseId: id }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }) as Promise<ItemRow[]>,
      this.prisma.courseModule.findMany({ where: { courseId: id } }),
    ]);
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
      storage: (await this.storageByCourse(id)).get(id) ?? emptyStorage(),
      modules: sortModules(modules as Array<{ id: string; order: number; createdAt: Date; title: unknown; description: unknown }>).map((m) => ({
        id: m.id, title: m.title, description: m.description, order: m.order,
      })),
      items: items.map((i) => this.adminItem(i, fileMap)),
    };
  }

  /** Pozycja dla panelu: bez wewnętrznych kluczy R2, z podpisanym linkiem do miniatury. */
  private adminItem(i: ItemRow, fileMap?: Map<string, unknown>) {
    const { videoKey, uploadKey, thumbKey, uploadId, ...rest } = i;
    return {
      ...rest,
      // Film ze starego hostingu (Bunny) bez pliku w R2 = trzeba wgrać ponownie.
      legacyVideo: i.kind === 'VIDEO' && !videoKey && !!i.videoId,
      hasFile: !!videoKey,
      uploading: !!uploadId,
      thumbnailUrl: this.r2.thumbUrl(thumbKey),
      file: fileMap && i.fileId ? fileMap.get(i.fileId) ?? null : null,
      fileEn: fileMap && i.fileIdEn ? fileMap.get(i.fileIdEn) ?? null : null,
    };
  }

  async update(
    id: string,
    body: {
      title?: unknown; description?: unknown; slug?: string; status?: string;
      sourceInstanceIds?: string[]; grantOn?: string; accessUntil?: string | null; sequential?: boolean;
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
    if (body.sequential !== undefined) data.sequential = !!body.sequential;
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
      await this.deleteVideoObjects(i);
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

  /** Moduł z body: undefined = bez zmian, ''/null = bez modułu, id = musi należeć do kursu. */
  private async moduleField(courseId: string, raw: unknown): Promise<string | null | undefined> {
    if (raw === undefined) return undefined;
    if (raw === null || raw === '') return null;
    const m = await this.prisma.courseModule.findFirst({ where: { id: String(raw), courseId }, select: { id: true } });
    if (!m) throw new BadRequestException('Nie znaleziono modułu w tym kursie.');
    return m.id;
  }

  /** Klucz obiektu w R2: courses/<kurs>/<materiał>/<losowe>.<rozszerzenie> — nowy przy każdej podmianie pliku. */
  private objectKey(courseId: string, itemId: string, prefix: string, ext: string) {
    return `courses/${courseId}/${itemId}/${prefix}-${randomBytes(6).toString('hex')}.${ext}`;
  }

  /**
   * Nowy film: pozycja w kursie + rozpoczęty upload wieloczęściowy do R2.
   * Przeglądarka admina wysyła części prosto do R2 (podpisane linki z uploadParts), potem woła completeUpload.
   */
  async createVideo(
    courseId: string,
    body: { title?: unknown; publishAt?: unknown; moduleId?: unknown; fileName?: unknown; size?: unknown; contentType?: unknown },
  ) {
    await this.mustGet(courseId);
    const pub = publishFields(body.publishAt);
    const title = normLangText(body.title);
    if (!title) throw new BadRequestException('Podaj tytuł filmu.');
    const moduleId = await this.moduleField(courseId, body.moduleId);
    this.r2.assertConfigured(); // czytelny błąd, gdy R2 nieskonfigurowany — zanim powstanie pusta pozycja
    const item = await this.prisma.courseItem.create({
      data: { courseId, kind: 'VIDEO', title, videoState: 'UPLOADING', order: await this.nextOrder(courseId), moduleId: moduleId ?? null, ...(pub ?? {}) },
    });
    try {
      return { item: this.adminItem(item as ItemRow), upload: await this.beginUpload(item as ItemRow, body) };
    } catch (e) {
      await this.prisma.courseItem.delete({ where: { id: item.id } }).catch(() => null);
      throw e;
    }
  }

  /** Rozpoczęcie (lub wznowienie) wysyłki pliku do istniejącego filmu — także podmiana pliku. */
  async videoUpload(courseId: string, itemId: string, body: { fileName?: unknown; size?: unknown; contentType?: unknown; resumeUploadId?: unknown }) {
    const item = await this.mustGetItem(courseId, itemId);
    if (item.kind !== 'VIDEO') throw new BadRequestException('To nie jest film.');
    const size = videoSize(body.size);
    // Wznowienie przerwanej wysyłki: ten sam upload → lista już wgranych części.
    if (body.resumeUploadId && item.uploadId && body.resumeUploadId === item.uploadId && item.uploadKey) {
      const parts = await this.r2.listParts(item.uploadKey, item.uploadId);
      return {
        item: this.adminItem(item),
        upload: { uploadId: item.uploadId, partSize: PART_SIZE, partCount: this.r2.partCount(size), doneParts: parts.filter((p) => p.size > 0).map((p) => p.partNumber) },
      };
    }
    return { item: this.adminItem(item), upload: await this.beginUpload(item, body) };
  }

  private async beginUpload(item: ItemRow, body: { size?: unknown; contentType?: unknown }) {
    const size = videoSize(body.size);
    const contentType = /^video\/[a-z0-9.+-]+$/i.test(String(body.contentType ?? '')) ? String(body.contentType) : 'video/mp4';
    // Poprzedni, niedokończony upload tej pozycji — porzucamy.
    if (item.uploadId && item.uploadKey) await this.r2.abortMultipart(item.uploadKey, item.uploadId);
    const ext = contentType === 'video/quicktime' ? 'mov' : contentType === 'video/webm' ? 'webm' : 'mp4';
    const key = this.objectKey(item.courseId ?? '', item.id, 'video', ext);
    const uploadId = await this.r2.createMultipart(key, contentType);
    await this.prisma.courseItem.update({
      where: { id: item.id },
      data: { uploadId, uploadKey: key, ...(item.videoKey ? {} : { videoState: 'UPLOADING' }) },
    });
    return { uploadId, partSize: PART_SIZE, partCount: this.r2.partCount(size), doneParts: [] as number[] };
  }

  /** Podpisane linki PUT do części (najwyżej 50 naraz). */
  async uploadParts(courseId: string, itemId: string, body: { uploadId?: unknown; partNumbers?: unknown }) {
    const item = await this.mustGetItem(courseId, itemId);
    if (!item.uploadId || !item.uploadKey || body.uploadId !== item.uploadId) {
      throw new BadRequestException('Ta wysyłka została przerwana albo zastąpiona — wybierz plik ponownie.');
    }
    const nums = (Array.isArray(body.partNumbers) ? body.partNumbers : [])
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 10000)
      .slice(0, 50);
    if (!nums.length) throw new BadRequestException('Brak numerów części.');
    return { urls: this.r2.partUrls(item.uploadKey, item.uploadId, nums) };
  }

  /**
   * Zakończenie wysyłki: składamy części (ETagi bierzemy z R2 — przeglądarka nie musi ich widzieć),
   * sprawdzamy plik, zapisujemy czas trwania z przeglądarki. Stary plik (przy podmianie) kasujemy.
   * Zwraca link PUT do miniatury (klatka filmu z przeglądarki), gdy `thumbnail: true`.
   */
  async completeUpload(courseId: string, itemId: string, body: { uploadId?: unknown; size?: unknown; durationSec?: unknown; thumbnail?: unknown }) {
    const item = await this.mustGetItem(courseId, itemId);
    if (!item.uploadId || !item.uploadKey || body.uploadId !== item.uploadId) {
      throw new BadRequestException('Ta wysyłka została przerwana albo zastąpiona — wybierz plik ponownie.');
    }
    const size = videoSize(body.size);
    const expected = this.r2.partCount(size);
    const parts = await this.r2.listParts(item.uploadKey, item.uploadId);
    const missing: number[] = [];
    for (let n = 1; n <= expected; n++) if (!parts.some((p) => p.partNumber === n)) missing.push(n);
    if (missing.length) throw new BadRequestException(`Nie wszystkie części pliku dotarły (brakuje ${missing.length}). Wznów wysyłkę tym samym plikiem.`);
    await this.r2.completeMultipart(item.uploadKey, item.uploadId, parts.filter((p) => p.partNumber <= expected));
    const head = await this.r2.head(item.uploadKey);
    if (!head || head.size !== size) {
      throw new BadRequestException(`Plik w R2 ma inny rozmiar niż wysłany (${head?.size ?? 0} zamiast ${size} B) — wyślij go ponownie.`);
    }
    const dur = Math.round(Number(body.durationSec));
    const oldKey = item.videoKey && item.videoKey !== item.uploadKey ? item.videoKey : null;
    const thumbKey = body.thumbnail ? this.objectKey(courseId, item.id, 'thumb', 'jpg') : null;
    const updated = await this.prisma.courseItem.update({
      where: { id: item.id },
      data: {
        videoKey: item.uploadKey,
        videoSizeMb: Math.max(1, Math.round(size / 1024 / 1024)),
        uploadId: null,
        uploadKey: null,
        videoState: 'READY',
        durationSec: Number.isFinite(dur) && dur > 0 && dur < 24 * 3600 ? dur : item.durationSec,
        ...(thumbKey ? { thumbKey } : {}),
      },
    });
    if (oldKey) await this.r2.deleteObject(oldKey);
    if (thumbKey && item.thumbKey) await this.r2.deleteObject(item.thumbKey);
    return { item: this.adminItem(updated as ItemRow), thumbnailUpload: thumbKey ? { url: this.r2.putUrl(thumbKey), contentType: 'image/jpeg' } : null };
  }

  /** Nowa miniatura (np. inna klatka) — link PUT. */
  async thumbnailUpload(courseId: string, itemId: string) {
    const item = await this.mustGetItem(courseId, itemId);
    if (item.kind !== 'VIDEO' || !item.videoKey) throw new BadRequestException('Najpierw wgraj film.');
    const thumbKey = this.objectKey(courseId, item.id, 'thumb', 'jpg');
    await this.prisma.courseItem.update({ where: { id: item.id }, data: { thumbKey } });
    if (item.thumbKey) await this.r2.deleteObject(item.thumbKey);
    return { url: this.r2.putUrl(thumbKey), contentType: 'image/jpeg' };
  }

  /** Przerwanie wysyłki z panelu. */
  async abortUpload(courseId: string, itemId: string) {
    const item = await this.mustGetItem(courseId, itemId);
    if (item.uploadId && item.uploadKey) await this.r2.abortMultipart(item.uploadKey, item.uploadId);
    const updated = await this.prisma.courseItem.update({ where: { id: item.id }, data: { uploadId: null, uploadKey: null } });
    return this.adminItem(updated as ItemRow);
  }

  private async deleteVideoObjects(i: ItemRow) {
    if (i.uploadId && i.uploadKey) await this.r2.abortMultipart(i.uploadKey, i.uploadId);
    await this.r2.deleteObject(i.videoKey);
    await this.r2.deleteObject(i.thumbKey);
  }

  /** Ustawia regułę CORS bucketu (przycisk w panelu, gdy wysyłka z przeglądarki jest blokowana). */
  async setupCors() {
    return this.r2.ensureCors();
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
  async createPdf(courseId: string, file: UploadedFileLike | undefined, rawTitle: unknown, rawLang?: unknown, rawPublishAt?: unknown, rawModuleId?: unknown) {
    await this.mustGet(courseId);
    const moduleId = await this.moduleField(courseId, rawModuleId);
    const pub = publishFields(rawPublishAt || undefined);
    const lang = parseLang(rawLang);
    let title = normLangText(typeof rawTitle === 'string' && rawTitle.trim().startsWith('{') ? safeJson(rawTitle) : rawTitle);
    if (!title) title = { [lang]: (fixLatin1(file?.originalname ?? null) ?? 'Materiał').replace(/\.pdf$/i, '') };
    const fileId = await this.savePdf(file);
    const item = await this.prisma.courseItem.create({
      data: { courseId, kind: 'PDF', title, [fileField(lang)]: fileId, order: await this.nextOrder(courseId), moduleId: moduleId ?? null, ...(pub ?? {}) } as never,
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

  async updateItem(courseId: string, itemId: string, body: { title?: unknown; description?: unknown; published?: boolean; publishAt?: unknown; moduleId?: unknown }) {
    const current = await this.mustGetItem(courseId, itemId);
    const data: Record<string, unknown> = {};
    const moduleId = await this.moduleField(courseId, body.moduleId);
    if (moduleId !== undefined) data.moduleId = moduleId;
    if (body.title !== undefined) {
      const t = normLangText(body.title);
      if (!t) throw new BadRequestException('Tytuł nie może być pusty.');
      data.title = t;
    }
    if (body.description !== undefined) data.description = normLangText(body.description) ?? null;
    if (body.published !== undefined) data.published = !!body.published;
    const pub = publishFields(body.publishAt);
    if (pub) {
      const same = (current.publishAt?.getTime() ?? null) === (pub.publishAt?.getTime() ?? null);
      // Bez zmiany daty nie ruszamy stanu powiadomienia (np. przy zmianie samego tytułu).
      if (!same) Object.assign(data, pub);
    }
    return this.adminItem((await this.prisma.courseItem.update({ where: { id: itemId }, data: data as never })) as ItemRow);
  }

  async removeItem(courseId: string, itemId: string) {
    const item = await this.mustGetItem(courseId, itemId);
    await this.prisma.courseItem.delete({ where: { id: itemId } });
    await this.tracking.purge({ courseId, itemId });
    await this.deleteVideoObjects(item);
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

  async diagnoseVideo(courseId: string, itemId: string) {
    const item = await this.mustGetItem(courseId, itemId);
    if (item.kind !== 'VIDEO') throw new BadRequestException('To nie jest film.');
    if (!item.videoKey) return { ok: false, verdict: 'Ten film nie ma jeszcze pliku w R2 — wgraj go (ikona wysyłania przy materiale).', details: {} };
    return this.r2.diagnose(item.videoKey);
  }

  async refreshItem(courseId: string, itemId: string) {
    return this.adminItem(await this.mustGetItem(courseId, itemId));
  }

  // ── Moduły ───────────────────────────────────────────────────────────────────

  async createModule(courseId: string, body: { title?: unknown; description?: unknown }) {
    await this.mustGet(courseId);
    const title = normLangText(body.title);
    if (!title) throw new BadRequestException('Podaj nazwę modułu.');
    const last = await this.prisma.courseModule.findFirst({ where: { courseId }, orderBy: { order: 'desc' }, select: { order: true } });
    return this.prisma.courseModule.create({
      data: { courseId, title, description: normLangText(body.description) ?? undefined, order: (last?.order ?? -1) + 1 },
    });
  }

  async updateModule(courseId: string, moduleId: string, body: { title?: unknown; description?: unknown }) {
    const m = await this.prisma.courseModule.findFirst({ where: { id: moduleId, courseId } });
    if (!m) throw new NotFoundException('Nie znaleziono modułu');
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const t = normLangText(body.title);
      if (!t) throw new BadRequestException('Nazwa modułu nie może być pusta.');
      data.title = t;
    }
    if (body.description !== undefined) data.description = normLangText(body.description) ?? null;
    return this.prisma.courseModule.update({ where: { id: moduleId }, data: data as never });
  }

  /** Usunięcie modułu — jego materiały zostają w kursie jako „bez modułu". */
  async removeModule(courseId: string, moduleId: string) {
    const m = await this.prisma.courseModule.findFirst({ where: { id: moduleId, courseId } });
    if (!m) throw new NotFoundException('Nie znaleziono modułu');
    await this.prisma.courseItem.updateMany({ where: { moduleId }, data: { moduleId: null } });
    await this.prisma.courseModule.delete({ where: { id: moduleId } });
    return { ok: true };
  }

  /**
   * Hurtowe utworzenie modułów z przypisaniem istniejących materiałów (np. „Podziel na moduły automatycznie”).
   * Moduły dochodzą na końcu (po istniejących), materiały tylko zmieniają moduł — pliki zostają bez zmian.
   */
  async createModulesBulk(courseId: string, body: { modules?: unknown }) {
    await this.mustGet(courseId);
    const list = Array.isArray(body.modules) ? (body.modules as Array<{ title?: unknown; itemIds?: unknown }>) : [];
    if (!list.length || list.length > 100) throw new BadRequestException('Podaj od 1 do 100 modułów.');
    const own = new Set(
      ((await this.prisma.courseItem.findMany({ where: { courseId }, select: { id: true } })) as Array<{ id: string }>).map((i) => i.id),
    );
    const seen = new Set<string>();
    const parsed = list.map((m, i) => {
      const title = normLangText(m.title);
      if (!title) throw new BadRequestException(`Moduł ${i + 1}: brak nazwy.`);
      const itemIds = (Array.isArray(m.itemIds) ? m.itemIds : []).map(String);
      for (const id of itemIds) {
        if (!own.has(id)) throw new BadRequestException('Materiał spoza tego kursu.');
        if (seen.has(id)) throw new BadRequestException('Ten sam materiał w dwóch modułach.');
        seen.add(id);
      }
      return { title, itemIds };
    });
    const last = await this.prisma.courseModule.findFirst({ where: { courseId }, orderBy: { order: 'desc' }, select: { order: true } });
    let order = (last?.order ?? -1) + 1;
    const created: string[] = [];
    for (const m of parsed) {
      const mod = (await this.prisma.courseModule.create({ data: { courseId, title: m.title, order: order++ } })) as { id: string };
      created.push(mod.id);
      if (m.itemIds.length) await this.prisma.courseItem.updateMany({ where: { courseId, id: { in: m.itemIds } }, data: { moduleId: mod.id } });
    }
    return { created: created.length, moduleIds: created };
  }

  async reorderModules(courseId: string, ids: string[]) {
    if (!Array.isArray(ids)) throw new BadRequestException('ids musi być listą');
    await this.prisma.$transaction(
      ids.map((id, idx) => this.prisma.courseModule.updateMany({ where: { id, courseId }, data: { order: idx } })),
    );
    return { ok: true };
  }

  // ── Kursanci ─────────────────────────────────────────────────────────────────

  async enrollments(courseId: string) {
    await this.mustGet(courseId);
    const rows = await this.prisma.courseEnrollment.findMany({
      where: { courseId },
      include: { guest: true },
      orderBy: { createdAt: 'desc' },
    });
    const completion = await this.tracking.courseCompletion(courseId);
    return rows.map((e: {
      id: string; guestId: string; source: string; registrationId: string | null; revokedAt: Date | null; revokedReason: string | null;
      welcomeSentAt: Date | null; lastSeenAt: Date | null; createdAt: Date; graduatedAt: Date | null;
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
      graduatedAt: e.graduatedAt,
      // Postęp w kursie: moduły (albo materiały, gdy kurs nie ma modułów) — do decyzji „przenieś do absolwentów”.
      progress: completion.get(e.guestId) ?? { done: 0, total: 0, complete: false },
    }));
  }

  /**
   * Absolwenci: przeniesienie z „bieżących” (graduated = true) albo z powrotem.
   * `completed: true` zamiast listy = wszyscy bieżący, którzy ukończyli kurs. Dostęp do kursu się nie zmienia.
   */
  async setGraduated(courseId: string, body: { ids?: unknown; completed?: unknown; graduated?: unknown }) {
    await this.mustGet(courseId);
    const graduated = body.graduated !== false;
    let ids: string[];
    if (body.completed === true) {
      const completion = await this.tracking.courseCompletion(courseId);
      const rows = (await this.prisma.courseEnrollment.findMany({
        where: { courseId, graduatedAt: null },
        select: { id: true, guestId: true },
      })) as Array<{ id: string; guestId: string }>;
      ids = rows.filter((r) => completion.get(r.guestId)?.complete).map((r) => r.id);
    } else {
      if (!Array.isArray(body.ids) || !body.ids.length) throw new BadRequestException('Brak kursantów do przeniesienia.');
      ids = body.ids.map(String).slice(0, 2000);
    }
    if (!ids.length) return { updated: 0 };
    const r = await this.prisma.courseEnrollment.updateMany({
      where: { courseId, id: { in: ids } },
      data: { graduatedAt: graduated ? new Date() : null },
    });
    return { updated: r.count };
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

  /**
   * Reset hasła z panelu: mail z linkiem do ustawienia nowego hasła (ważny 48 h).
   * Konto bez hasła dostaje zamiast tego powitanie z linkiem „Ustaw hasło".
   */
  async sendResetLink(courseId: string, enrollmentId: string) {
    const e = await this.prisma.courseEnrollment.findFirst({ where: { id: enrollmentId, courseId }, include: { course: true, guest: true } });
    if (!e) throw new NotFoundException('Nie znaleziono kursanta');
    if (e.revokedAt) throw new ConflictException('Dostęp jest odebrany — najpierw go przywróć.');
    if (e.course.status !== 'PUBLISHED') throw new ConflictException('Kurs nie jest opublikowany — link zadziała dopiero po publikacji.');
    if (!e.guest.passwordHash) return { status: await this.access.sendWelcome(e.id), kind: 'WELCOME' };
    const status = await this.access.sendPasswordReset(e.guestId, e.course, 48 * 3600 * 1000);
    this.tracking.log(courseId, e.guestId, 'RESET_REQUEST', null, { by: 'admin' });
    return { status, kind: 'RESET' };
  }

  /**
   * Ręczne ustawienie hasła przez admina (np. przekazanie telefonicznie). Hasło dotyczy KONTA —
   * działa we wszystkich kursach tej osoby. Wylogowuje ją ze wszystkich urządzeń (passwordSetAt).
   */
  async setPasswordManually(courseId: string, enrollmentId: string, password: string) {
    const e = await this.prisma.courseEnrollment.findFirst({ where: { id: enrollmentId, courseId } });
    if (!e) throw new NotFoundException('Nie znaleziono kursanta');
    const pw = String(password ?? '');
    if (pw.length < 8) throw new BadRequestException('Hasło musi mieć co najmniej 8 znaków.');
    if (pw.length > 200) throw new BadRequestException('Hasło jest za długie.');
    await this.prisma.guestAccount.update({
      where: { id: e.guestId },
      data: { passwordHash: await argon2.hash(pw), passwordSetAt: new Date() },
    });
    // Stare linki „ustaw hasło" przestają działać.
    await this.prisma.memberToken.updateMany({ where: { guestId: e.guestId, usedAt: null }, data: { usedAt: new Date() } });
    this.tracking.log(courseId, e.guestId, 'PASSWORD_SET', null, { by: 'admin' });
    return { ok: true };
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

export interface CourseStorage {
  /** Filmy z plikiem w R2. */
  videos: number;
  videoBytes: number;
  /** Pliki PDF (każda wersja językowa osobno). */
  pdfFiles: number;
  pdfBytes: number;
}
const emptyStorage = (): CourseStorage => ({ videos: 0, videoBytes: 0, pdfFiles: 0, pdfBytes: 0 });

/** Rozmiar wysyłanego filmu (bajty) — do 20 GB. */
function videoSize(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) throw new BadRequestException('Brak rozmiaru pliku.');
  if (n > 20 * 1024 * 1024 * 1024) throw new BadRequestException('Plik jest za duży (limit 20 GB) — wyeksportuj film w niższej jakości (720p/1080p).');
  return n;
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
