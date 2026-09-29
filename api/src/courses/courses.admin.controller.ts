import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Put, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CoursesService, UploadedFileLike } from './courses.service';
import { CourseTrackingService } from './course-tracking.service';
import { MemberService } from './member.service';

@ApiTags('admin: formacja online')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/courses')
export class CoursesAdminController {
  constructor(
    private readonly courses: CoursesService,
    private readonly tracking: CourseTrackingService,
    private readonly member: MemberService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista kursów' })
  list() {
    return this.courses.list();
  }

  @Get('config')
  @ApiOperation({ summary: 'Stan konfiguracji (Bunny Stream, adres strony)' })
  config() {
    return this.courses.config();
  }

  @Get('slug-check')
  @ApiOperation({ summary: 'Sprawdź, czy adres kursu jest wolny' })
  slugCheck(@Query('slug') slug: string, @Query('excludeId') excludeId?: string) {
    return this.courses.slugCheck(slug, excludeId);
  }

  @Post()
  create(@Body() body: { title?: unknown; slug?: string; description?: unknown }) {
    return this.courses.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.courses.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, never>) {
    return this.courses.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.courses.remove(id);
  }

  // ── Pozycje ──
  @Post(':id/items/video')
  @ApiOperation({ summary: 'Utwórz film w Bunny — zwraca dane do uploadu TUS z przeglądarki' })
  createVideo(@Param('id') id: string, @Body() body: { title?: unknown; publishAt?: unknown }) {
    return this.courses.createVideo(id, body);
  }

  @Post(':id/items/:itemId/upload')
  @ApiOperation({ summary: 'Nowe dane uploadu TUS dla istniejącego filmu (wznowienie)' })
  videoUpload(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.courses.videoUpload(id, itemId);
  }

  @Post(':id/items/pdf')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  createPdf(
    @Param('id') id: string,
    @UploadedFile() file: UploadedFileLike,
    @Body('title') title?: string,
    @Body('lang') lang?: string,
    @Body('publishAt') publishAt?: string,
  ) {
    return this.courses.createPdf(id, file, title, lang, publishAt);
  }

  @Post(':id/items/:itemId/file')
  @ApiOperation({ summary: 'Wgraj / podmień wersję językową PDF (?lang=pl|en)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  setItemFile(@Param('id') id: string, @Param('itemId') itemId: string, @UploadedFile() file: UploadedFileLike, @Query('lang') lang?: string) {
    return this.courses.setItemFile(id, itemId, file, lang);
  }

  @Delete(':id/items/:itemId/file')
  @ApiOperation({ summary: 'Usuń jedną wersję językową PDF (?lang=pl|en)' })
  removeItemFile(@Param('id') id: string, @Param('itemId') itemId: string, @Query('lang') lang?: string) {
    return this.courses.removeItemFile(id, itemId, lang);
  }

  @Put(':id/items-order')
  reorder(@Param('id') id: string, @Body() body: { ids: string[] }) {
    return this.courses.reorder(id, body.ids);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: { title?: unknown; description?: unknown; published?: boolean; publishAt?: unknown },
  ) {
    return this.courses.updateItem(id, itemId, body);
  }

  @Post(':id/items/:itemId/diagnose')
  @ApiOperation({ summary: 'Sprawdź, czy film da się odtworzyć ze strony (diagnoza 403 z Bunny)' })
  diagnose(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.courses.diagnoseVideo(id, itemId);
  }

  @Post(':id/items/:itemId/refresh')
  refreshItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.courses.refreshItem(id, itemId);
  }

  @Delete(':id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.courses.removeItem(id, itemId);
  }

  // ── Kursanci ──
  @Get(':id/enrollments')
  enrollments(@Param('id') id: string) {
    return this.courses.enrollments(id);
  }

  @Post(':id/enrollments')
  addManual(@Param('id') id: string, @Body() body: { email?: string; firstName?: string; lastName?: string; locale?: string; sendWelcome?: boolean }) {
    return this.courses.addManual(id, body);
  }

  @Post(':id/enrollments/import')
  importList(@Param('id') id: string, @Body() body: { text?: string; sendWelcome?: boolean }) {
    return this.courses.importList(id, body.text ?? '', body.sendWelcome !== false);
  }

  @Patch(':id/enrollments/:eid')
  setRevoked(@Param('id') id: string, @Param('eid') eid: string, @Body() body: { revoked?: boolean }) {
    return this.courses.setRevoked(id, eid, !!body.revoked);
  }

  @Post(':id/enrollments/:eid/reset-link')
  @ApiOperation({ summary: 'Wyślij kursantowi mail z linkiem do ustawienia nowego hasła (48 h)' })
  sendResetLink(@Param('id') id: string, @Param('eid') eid: string) {
    return this.courses.sendResetLink(id, eid);
  }

  @Post(':id/enrollments/:eid/password')
  @ApiOperation({ summary: 'Ustaw kursantowi hasło ręcznie (wylogowuje go z innych urządzeń)' })
  setPassword(@Param('id') id: string, @Param('eid') eid: string, @Body() body: { password?: string }) {
    return this.courses.setPasswordManually(id, eid, body.password ?? '');
  }

  @Post(':id/enrollments/:eid/resend')
  resend(@Param('id') id: string, @Param('eid') eid: string) {
    return this.courses.resend(id, eid);
  }

  // ── Podgląd i aktywność ──
  @Post(':id/preview')
  @ApiOperation({ summary: 'Link podglądu kursu jako kursant (admin, 30 dni, także dla szkicu)' })
  preview(@Param('id') id: string, @Req() req: { user?: { sub?: string; email?: string } }) {
    return this.member.previewUrl(id, req.user);
  }

  @Get(':id/activity')
  @ApiOperation({ summary: 'Tabela postępów: kursant × materiały' })
  activity(@Param('id') id: string) {
    return this.tracking.activity(id);
  }

  @Get(':id/activity.csv')
  @ApiOperation({ summary: 'Eksport tabeli postępów (CSV, średniki, UTF-8 BOM)' })
  async activityCsv(@Param('id') id: string, @Res() res: Response) {
    const csv = await this.tracking.csv(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="aktywnosc-kursu-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @Get(':id/activity/:eid')
  @ApiOperation({ summary: 'Historia zdarzeń jednego kursanta' })
  async history(@Param('id') id: string, @Param('eid') eid: string) {
    const h = await this.tracking.history(id, eid);
    if (!h) throw new NotFoundException('Nie znaleziono kursanta');
    return h;
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Uzgodnij dostęp ze zgłoszeniami z powiązanych eventów' })
  sync(@Param('id') id: string) {
    return this.courses.sync(id);
  }
}
