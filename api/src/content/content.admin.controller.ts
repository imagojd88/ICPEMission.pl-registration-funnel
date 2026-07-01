import { Controller, Get, Post, Patch, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ContentService } from './content.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/** Zarządzanie treścią z Personal OS (token-auth). Widzi też szkice. */
@ApiTags('content-admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('admin/content')
export class ContentAdminController {
  constructor(private readonly content: ContentService) {}

  // Strony
  @Get('pages')
  @ApiOperation({ summary: 'Lista stron (wszystkie statusy)' })
  listPages() {
    return this.content.listPages();
  }

  @Get('pages/:id')
  getPage(@Param('id') id: string) {
    return this.content.getPage(id);
  }

  @Post('pages')
  @ApiOperation({ summary: 'Utwórz stronę (DRAFT)' })
  createPage(@Body() body: Record<string, unknown>) {
    return this.content.createPage(body);
  }

  @Patch('pages/:id')
  updatePage(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.content.updatePage(id, body);
  }

  @Patch('pages/:id/publish')
  @ApiOperation({ summary: 'Publikuj stronę + trigger rebuild' })
  publishPage(@Param('id') id: string) {
    return this.content.publishPage(id);
  }

  @Patch('pages/:id/unpublish')
  unpublishPage(@Param('id') id: string) {
    return this.content.unpublishPage(id);
  }

  @Delete('pages/:id')
  deletePage(@Param('id') id: string) {
    return this.content.deletePage(id);
  }

  // Artykuły / aktualności
  @Get('articles')
  @ApiOperation({ summary: 'Lista artykułów (wszystkie statusy)' })
  listArticles() {
    return this.content.listArticles();
  }

  @Get('articles/:id')
  getArticle(@Param('id') id: string) {
    return this.content.getArticle(id);
  }

  @Post('articles')
  @ApiOperation({ summary: 'Utwórz artykuł (DRAFT)' })
  createArticle(@Body() body: Record<string, unknown>) {
    return this.content.createArticle(body);
  }

  @Patch('articles/:id')
  updateArticle(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.content.updateArticle(id, body);
  }

  @Patch('articles/:id/publish')
  publishArticle(@Param('id') id: string) {
    return this.content.publishArticle(id);
  }

  @Patch('articles/:id/unpublish')
  unpublishArticle(@Param('id') id: string) {
    return this.content.unpublishArticle(id);
  }

  @Delete('articles/:id')
  deleteArticle(@Param('id') id: string) {
    return this.content.deleteArticle(id);
  }

  // Nawigacja
  @Get('menu')
  getMenu() {
    return this.content.getMenu();
  }

  @Put('menu')
  @ApiOperation({ summary: 'Zapisz całą listę pozycji menu' })
  putMenu(@Body() body: Record<string, unknown>[] | { items?: Record<string, unknown>[] }) {
    const items = Array.isArray(body) ? body : (body?.items ?? []);
    return this.content.putMenu(items);
  }

  // Ustawienia globalne
  @Get('settings')
  getSettings() {
    return this.content.getSettings();
  }

  @Put('settings')
  putSettings(@Body() body: Record<string, unknown>) {
    return this.content.putSettings(body);
  }

  // Wspólnoty mapy (edytowalne opisy PL/EN)
  @Get('communities')
  @ApiOperation({ summary: 'Lista wspólnot mapy (seed 19 przy pierwszym użyciu)' })
  listCommunities() {
    return this.content.listCommunities();
  }

  @Patch('communities/:id')
  @ApiOperation({ summary: 'Edytuj opis wspólnoty (name/cc/tag/note PL+EN) + rebuild' })
  updateCommunity(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.content.updateCommunity(id, body);
  }

  // Podgląd szkicu (dowolny status)
  @Get('preview/page/:slug')
  previewPage(@Param('slug') slug: string) {
    return this.content.previewPage(slug);
  }

  @Get('preview/article/:slug')
  previewArticle(@Param('slug') slug: string) {
    return this.content.previewArticle(slug);
  }
}
