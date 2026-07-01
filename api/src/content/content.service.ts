import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeployHookService } from './deploy-hook.service';
import { COMMUNITY_SEED } from './community-seed';

/** Luźne wejście z Personal OS (whitelist=false globalnie) — pola wybieramy ręcznie. */
type AnyBody = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const strOrNull = (v: unknown): string | null | undefined =>
  v === null ? null : typeof v === 'string' ? v : undefined;

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deploy: DeployHookService,
  ) {}

  // ── Pola edytowalne (pick z luźnego body) ─────────────────────────
  private pagePatch(b: AnyBody) {
    const d: Record<string, unknown> = {};
    if (str(b.slug) !== undefined) d.slug = str(b.slug);
    if (str(b.title) !== undefined) d.title = str(b.title);
    if (str(b.locale) !== undefined) d.locale = str(b.locale);
    if (b.blocks !== undefined) d.blocks = b.blocks ?? [];
    if (strOrNull(b.seoTitle) !== undefined) d.seoTitle = strOrNull(b.seoTitle);
    if (strOrNull(b.seoDesc) !== undefined) d.seoDesc = strOrNull(b.seoDesc);
    if (strOrNull(b.ogImageUrl) !== undefined) d.ogImageUrl = strOrNull(b.ogImageUrl);
    if (typeof b.showInNav === 'boolean') d.showInNav = b.showInNav;
    if (b.navOrder === null || typeof b.navOrder === 'number') d.navOrder = b.navOrder as number | null;
    return d;
  }

  private articlePatch(b: AnyBody) {
    const d: Record<string, unknown> = {};
    if (str(b.slug) !== undefined) d.slug = str(b.slug);
    if (str(b.title) !== undefined) d.title = str(b.title);
    if (str(b.locale) !== undefined) d.locale = str(b.locale);
    if (strOrNull(b.excerpt) !== undefined) d.excerpt = strOrNull(b.excerpt);
    if (strOrNull(b.coverUrl) !== undefined) d.coverUrl = strOrNull(b.coverUrl);
    if (b.blocks !== undefined) d.blocks = b.blocks ?? [];
    if (strOrNull(b.category) !== undefined) d.category = strOrNull(b.category);
    if (strOrNull(b.author) !== undefined) d.author = strOrNull(b.author);
    if (strOrNull(b.seoTitle) !== undefined) d.seoTitle = strOrNull(b.seoTitle);
    if (strOrNull(b.seoDesc) !== undefined) d.seoDesc = strOrNull(b.seoDesc);
    return d;
  }

  // ── PAGES (admin) ─────────────────────────────────────────────────
  listPages() {
    return this.prisma.page.findMany({ orderBy: [{ navOrder: 'asc' }, { updatedAt: 'desc' }] });
  }

  async getPage(id: string) {
    const p = await this.prisma.page.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Strona nie istnieje');
    return p;
  }

  createPage(body: AnyBody) {
    const d = this.pagePatch(body);
    if (!d.slug) d.slug = `strona-${Date.now()}`;
    if (!d.title) d.title = 'Nowa strona';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.prisma.page.create({ data: d as any });
  }

  updatePage(id: string, body: AnyBody) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.prisma.page.update({ where: { id }, data: this.pagePatch(body) as any });
  }

  async publishPage(id: string) {
    const p = await this.prisma.page.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    this.deploy.trigger(`page:publish:${p.slug}`);
    return p;
  }

  async unpublishPage(id: string) {
    const p = await this.prisma.page.update({ where: { id }, data: { status: 'DRAFT' } });
    this.deploy.trigger(`page:unpublish:${p.slug}`);
    return p;
  }

  async deletePage(id: string) {
    const p = await this.prisma.page.delete({ where: { id } });
    if (p.status === 'PUBLISHED') this.deploy.trigger(`page:delete:${p.slug}`);
    return { ok: true };
  }

  // ── ARTICLES (admin) ─────────────────────────────────────────────
  listArticles() {
    return this.prisma.article.findMany({ orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }] });
  }

  async getArticle(id: string) {
    const a = await this.prisma.article.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Artykuł nie istnieje');
    return a;
  }

  createArticle(body: AnyBody) {
    const d = this.articlePatch(body);
    if (!d.slug) d.slug = `wpis-${Date.now()}`;
    if (!d.title) d.title = 'Nowy wpis';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.prisma.article.create({ data: d as any });
  }

  updateArticle(id: string, body: AnyBody) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.prisma.article.update({ where: { id }, data: this.articlePatch(body) as any });
  }

  async publishArticle(id: string) {
    const a = await this.prisma.article.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    this.deploy.trigger(`article:publish:${a.slug}`);
    return a;
  }

  async unpublishArticle(id: string) {
    const a = await this.prisma.article.update({ where: { id }, data: { status: 'DRAFT' } });
    this.deploy.trigger(`article:unpublish:${a.slug}`);
    return a;
  }

  async deleteArticle(id: string) {
    const a = await this.prisma.article.delete({ where: { id } });
    if (a.status === 'PUBLISHED') this.deploy.trigger(`article:delete:${a.slug}`);
    return { ok: true };
  }

  // ── MENU ─────────────────────────────────────────────────────────
  getMenu() {
    return this.prisma.menuItem.findMany({ orderBy: [{ location: 'asc' }, { order: 'asc' }] });
  }

  /** Zastępuje całą listę pozycji menu (prostota edycji z Personal OS). */
  async putMenu(items: AnyBody[]) {
    const clean = (Array.isArray(items) ? items : [])
      .filter((it) => str(it.label) && str(it.href))
      .map((it, i) => ({
        label: str(it.label) as string,
        href: str(it.href) as string,
        location: str(it.location) === 'footer' ? 'footer' : 'header',
        order: typeof it.order === 'number' ? it.order : i,
        parentId: str(it.parentId) ?? null,
      }));
    await this.prisma.$transaction([
      this.prisma.menuItem.deleteMany({}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.prisma.menuItem.createMany({ data: clean as any }),
    ]);
    this.deploy.trigger('menu:update');
    return this.getMenu();
  }

  // ── SETTINGS (singleton) ─────────────────────────────────────────
  async getSettings() {
    return this.prisma.siteSettings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });
  }

  async putSettings(body: AnyBody) {
    const d: Record<string, unknown> = {};
    if (str(body.siteName) !== undefined) d.siteName = str(body.siteName);
    if (strOrNull(body.logoUrl) !== undefined) d.logoUrl = strOrNull(body.logoUrl);
    if (strOrNull(body.contactEmail) !== undefined) d.contactEmail = strOrNull(body.contactEmail);
    if (strOrNull(body.contactPhone) !== undefined) d.contactPhone = strOrNull(body.contactPhone);
    if (body.socials !== undefined) d.socials = body.socials ?? null;
    if (strOrNull(body.footerText) !== undefined) d.footerText = strOrNull(body.footerText);
    if (strOrNull(body.defaultOgImageUrl) !== undefined) d.defaultOgImageUrl = strOrNull(body.defaultOgImageUrl);
    const s = await this.prisma.siteSettings.upsert({
      where: { id: 'singleton' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: d as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: { id: 'singleton', ...d } as any,
    });
    this.deploy.trigger('settings:update');
    return s;
  }

  // ── PREVIEW (dowolny status, do podglądu przed publikacją) ────────
  async previewPage(slug: string) {
    const p = await this.prisma.page.findUnique({ where: { slug } });
    if (!p) throw new NotFoundException('Strona nie istnieje');
    return p;
  }

  async previewArticle(slug: string) {
    const a = await this.prisma.article.findUnique({ where: { slug } });
    if (!a) throw new NotFoundException('Artykuł nie istnieje');
    return a;
  }

  // ── PUBLICZNE (/site/*) — tylko PUBLISHED ─────────────────────────
  publicPages() {
    return this.prisma.page.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ navOrder: 'asc' }, { title: 'asc' }],
      select: { slug: true, title: true, locale: true, navOrder: true, showInNav: true },
    });
  }

  async publicPageBySlug(slug: string) {
    const p = await this.prisma.page.findFirst({ where: { slug, status: 'PUBLISHED' } });
    if (!p) throw new NotFoundException('Strona nie istnieje lub nie jest opublikowana');
    return p;
  }

  publicArticles(category?: string, limit?: number) {
    return this.prisma.article.findMany({
      where: { status: 'PUBLISHED', ...(category ? { category } : {}) },
      orderBy: { publishedAt: 'desc' },
      take: limit && limit > 0 ? limit : undefined,
      select: {
        slug: true, title: true, locale: true, excerpt: true, coverUrl: true,
        category: true, author: true, publishedAt: true,
      },
    });
  }

  async publicArticleBySlug(slug: string) {
    const a = await this.prisma.article.findFirst({ where: { slug, status: 'PUBLISHED' } });
    if (!a) throw new NotFoundException('Artykuł nie istnieje lub nie jest opublikowany');
    return a;
  }

  // ── WSPÓLNOTY MAPY (edytowalne opisy PL/EN) ──────────────────────
  /** Zasiewa 19 wspólnot przy pierwszym użyciu (gdy tabela pusta). */
  private async seedCommunities() {
    const count = await this.prisma.community.count();
    if (count > 0) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.prisma.community.createMany({ data: COMMUNITY_SEED as any });
  }

  async listCommunities() {
    await this.seedCommunities();
    return this.prisma.community.findMany({ orderBy: { order: 'asc' } });
  }

  async updateCommunity(id: string, body: AnyBody) {
    const d: Record<string, unknown> = {};
    if (str(body.name) !== undefined) d.name = str(body.name);
    if (strOrNull(body.ccPl) !== undefined) d.ccPl = strOrNull(body.ccPl);
    if (strOrNull(body.ccEn) !== undefined) d.ccEn = strOrNull(body.ccEn);
    if (strOrNull(body.tagPl) !== undefined) d.tagPl = strOrNull(body.tagPl);
    if (strOrNull(body.tagEn) !== undefined) d.tagEn = strOrNull(body.tagEn);
    if (strOrNull(body.notePl) !== undefined) d.notePl = strOrNull(body.notePl);
    if (strOrNull(body.noteEn) !== undefined) d.noteEn = strOrNull(body.noteEn);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = await this.prisma.community.update({ where: { id }, data: d as any });
    this.deploy.trigger(`community:update:${c.key}`);
    return c;
  }

  async publicCommunities() {
    await this.seedCommunities();
    return this.prisma.community.findMany({
      orderBy: { order: 'asc' },
      select: {
        key: true, name: true, ccPl: true, ccEn: true, tagPl: true, tagEn: true,
        notePl: true, noteEn: true, lat: true, lng: true, grp: true, order: true,
      },
    });
  }
}
