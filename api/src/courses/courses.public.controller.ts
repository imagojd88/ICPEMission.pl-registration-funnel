import { Body, Controller, Get, Headers, HttpCode, Logger, NotFoundException, Param, Post, Query, Req, Res, UnauthorizedException, UseGuards, type RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CoursesService } from './courses.service';
import { MemberService } from './member.service';
import { MemberAuthGuard, type MemberRequest } from './member-auth.guard';
import { BunnyStreamService } from './bunny-stream.service';
import { CourseReleaseService } from './course-release.service';
import { verifyFileSignature } from './course-utils';

function clientIp(req: Request): string {
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return fwd || req.ip || 'unknown';
}

/** Publiczne endpointy „Formacji online" + API kursanta. */
@ApiTags('formacja online (publiczne / kursant)')
@Controller()
export class CoursesPublicController {
  private readonly logger = new Logger('CoursesPublic');

  constructor(
    private readonly courses: CoursesService,
    private readonly member: MemberService,
    private readonly bunny: BunnyStreamService,
    private readonly release: CourseReleaseService,
  ) {}

  /**
   * Zewnętrzny wyzwalacz publikacji zaplanowanych materiałów (np. UptimeRobot co 5 min — przy okazji
   * budzi uśpiony serwer). Idempotentny. Gdy ustawiono CRON_SECRET, wymaga ?key=.
   */
  @Get('cron/course-releases')
  async cronReleases(@Query('key') key?: string) {
    const secret = (process.env.CRON_SECRET ?? '').trim();
    if (secret && key !== secret) throw new UnauthorizedException();
    const r = await this.release.releaseDue();
    return { ok: true, ...r };
  }

  @Get('site/courses')
  @ApiOperation({ summary: 'Build strony: opublikowane kursy + przekierowania starych adresów' })
  siteCourses() {
    return this.courses.publicList();
  }

  @Get('courses/public/:slug')
  publicCourse(@Param('slug') slug: string) {
    return this.member.publicCourse(slug);
  }

  @Post('webhooks/bunny-stream')
  @HttpCode(200)
  async bunnyWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-bunnystream-signature') signature: string | undefined,
    @Body() body: { VideoGuid?: string; Status?: number },
  ) {
    const verified = this.bunny.verifyWebhook(req.rawBody, signature);
    if (verified === false) throw new UnauthorizedException('Invalid signature');
    if (!body?.VideoGuid) return { ok: true };
    // Stan i tak pobieramy z API Bunny — webhook to tylko sygnał.
    return this.courses.onVideoWebhook(String(body.VideoGuid)).catch((e: Error) => {
      this.logger.warn(`webhook ${body.VideoGuid}: ${e.message}`);
      return { ok: true };
    });
  }

  // ── Kursant: logowanie ──
  @Post('member/auth/login')
  @HttpCode(200)
  login(@Body() body: { email?: string; password?: string; slug?: string }, @Req() req: Request) {
    return this.member.login(body, clientIp(req));
  }

  @Post('member/auth/set-password')
  @HttpCode(200)
  setPassword(@Body() body: { token?: string; password?: string }, @Req() req: Request) {
    return this.member.setPassword(body, clientIp(req));
  }

  @Post('member/auth/link-open')
  @HttpCode(200)
  linkOpen(@Body() body: { token?: string }, @Req() req: Request) {
    return this.member.linkOpen(body, clientIp(req));
  }

  @Post('member/auth/forgot')
  @HttpCode(200)
  forgot(@Body() body: { email?: string; slug?: string }, @Req() req: Request) {
    return this.member.forgot(body, clientIp(req));
  }

  // ── Kursant: treść ──
  @UseGuards(MemberAuthGuard)
  @ApiBearerAuth()
  @Get('member/courses/:slug')
  course(@Param('slug') slug: string, @Req() req: MemberRequest) {
    return this.member.course(slug, req.member!);
  }

  @UseGuards(MemberAuthGuard)
  @ApiBearerAuth()
  @Get('member/courses/:slug/items/:itemId/play')
  play(@Param('slug') slug: string, @Param('itemId') itemId: string, @Req() req: MemberRequest) {
    return this.member.play(slug, itemId, req.member!);
  }

  @UseGuards(MemberAuthGuard)
  @ApiBearerAuth()
  @Post('member/courses/:slug/items/:itemId/progress')
  @HttpCode(200)
  progress(
    @Param('slug') slug: string,
    @Param('itemId') itemId: string,
    @Req() req: MemberRequest,
    @Body() body: { buckets?: unknown; position?: unknown; duration?: unknown },
  ) {
    return this.member.progress(slug, itemId, req.member!, body);
  }

  @UseGuards(MemberAuthGuard)
  @ApiBearerAuth()
  @Get('member/courses/:slug/items/:itemId/file')
  fileLink(
    @Param('slug') slug: string,
    @Param('itemId') itemId: string,
    @Req() req: MemberRequest,
    @Query('lang') lang?: string,
    @Query('action') action?: string,
  ) {
    return this.member.fileLink(slug, itemId, req.member!, lang, action);
  }

  /** PDF przez podpisany, krótko żyjący link (podgląd w przeglądarce nie wyśle nagłówka Authorization). */
  @Get('member/files/:fileId')
  async file(
    @Param('fileId') fileId: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Query('dl') dl: string | undefined,
    @Res() res: Response,
  ) {
    if (!verifyFileSignature(fileId, exp, sig)) {
      res.status(403).type('text/plain; charset=utf-8').send('Link wygasł. Wróć do panelu kursu i otwórz materiał ponownie.');
      return;
    }
    const f = await this.member.file(fileId).catch(() => null);
    if (!f) throw new NotFoundException('Nie znaleziono pliku');
    const name = (f.originalName || 'material.pdf').replace(/[\r\n"]/g, '');
    const ascii = name.normalize('NFKD').replace(/[^\x20-\x7e]/g, '_');
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Length', String(f.size));
    res.setHeader('Content-Disposition', `${dl ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.send(Buffer.from(f.data as Uint8Array));
  }
}
