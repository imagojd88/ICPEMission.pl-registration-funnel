import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CoursesService, UploadedFileLike } from './courses.service';

@ApiTags('admin: formacja online')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/courses')
export class CoursesAdminController {
  constructor(private readonly courses: CoursesService) {}

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
  createVideo(@Param('id') id: string, @Body() body: { title?: unknown }) {
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
  createPdf(@Param('id') id: string, @UploadedFile() file: UploadedFileLike, @Body('title') title?: string) {
    return this.courses.createPdf(id, file, title);
  }

  @Put(':id/items-order')
  reorder(@Param('id') id: string, @Body() body: { ids: string[] }) {
    return this.courses.reorder(id, body.ids);
  }

  @Patch(':id/items/:itemId')
  updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: { title?: unknown; description?: unknown; published?: boolean }) {
    return this.courses.updateItem(id, itemId, body);
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

  @Post(':id/enrollments/:eid/resend')
  resend(@Param('id') id: string, @Param('eid') eid: string) {
    return this.courses.resend(id, eid);
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Uzgodnij dostęp ze zgłoszeniami z powiązanych eventów' })
  sync(@Param('id') id: string) {
    return this.courses.sync(id);
  }
}
