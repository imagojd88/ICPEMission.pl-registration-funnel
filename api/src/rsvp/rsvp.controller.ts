import { Controller, Get, Post, Put, Param, Query, Body, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RsvpService } from './rsvp.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Response } from 'express';

@ApiTags('rsvp')
@Controller()
export class RsvpController {
  constructor(private readonly rsvp: RsvpService) {}

  // ── Publiczne (event STANDALONE) ───────────────────────────────────────────

  @Post('rsvp')
  @ApiOperation({ summary: 'Potwierdź obecność (Będę / Nie będę) — event standalone' })
  create(
    @Body() dto: { instanceId: string; name: string; email?: string; response: 'YES' | 'NO'; locale?: string },
  ) {
    return this.rsvp.create(dto);
  }

  @Get('rsvp/:id')
  @ApiOperation({ summary: 'Pobierz RSVP (magic-link)' })
  findOne(@Param('id') id: string, @Query('token') token?: string) {
    return this.rsvp.findById(id, token);
  }

  @Put('rsvp/:id')
  @ApiOperation({ summary: 'Zmień odpowiedź RSVP (magic-link)' })
  update(
    @Param('id') id: string,
    @Query('token') token: string,
    @Body() dto: { name?: string; response?: 'YES' | 'NO' },
  ) {
    return this.rsvp.update(id, token, dto);
  }

  @Get('rsvp/:id/calendar.ics')
  @ApiOperation({ summary: 'Plik iCal dla RSVP' })
  async getIcs(@Param('id') id: string, @Res() res: Response) {
    const ics = await this.rsvp.getIcs(id);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="event-${id}.ics"`);
    res.send(ics);
  }

  @Get('rsvp/:id/calendar/google')
  @ApiOperation({ summary: 'Redirect do Google Calendar' })
  async google(@Param('id') id: string, @Res() res: Response) {
    res.redirect(302, await this.rsvp.getGoogleUrl(id));
  }

  // ── Admin ──────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('admin/instances/:id/rsvps')
  @ApiOperation({ summary: 'Lista RSVP + liczniki (admin / Personal OS)' })
  list(@Param('id') id: string) {
    return this.rsvp.listForInstance(id);
  }
}
