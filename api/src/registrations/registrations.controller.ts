import {
  Controller, Get, Post, Put, Patch, Param, Query, Body, Res, UseGuards, UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RegistrationsService } from './registrations.service';
import { LeadsService } from './leads.service';
import { CreateRegistrationDto, UpdateAccommodationDto } from './dto/create-registration.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Response } from 'express';

@ApiTags('registrations')
@Controller()
export class RegistrationsController {
  constructor(
    private readonly regs: RegistrationsService,
    private readonly leads: LeadsService,
  ) {}

  // ── Niedokończone zgłoszenia + przypomnienie po 3 h ─────────────────────────

  @Post('registrations/leads')
  @ApiOperation({ summary: 'Funnel: started registration (name + e-mail after step "Dane"), for one reminder' })
  upsertLead(@Body() dto: { instanceId?: string; email?: string; firstName?: string; lastName?: string; locale?: string; step?: number }) {
    return this.leads.upsert(dto);
  }

  @Get('registrations/leads/:token')
  @ApiOperation({ summary: 'Reminder link: prefill name + e-mail' })
  leadByToken(@Param('token') token: string) {
    return this.leads.byToken(token);
  }

  /** Zewnętrzny wyzwalacz przypomnień (np. UptimeRobot). Gdy ustawiono CRON_SECRET, wymaga ?key=. */
  @Get('cron/registration-reminders')
  async cronReminders(@Query('key') key?: string) {
    const secret = (process.env.CRON_SECRET ?? '').trim();
    if (secret && key !== secret) throw new UnauthorizedException();
    return { ok: true, ...(await this.leads.runDue()) };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('admin/instances/:id/leads')
  @ApiOperation({ summary: 'Started, unfinished registrations (admin)' })
  listLeads(@Param('id') id: string) {
    return this.leads.listForInstance(id);
  }

  @Post('registrations')
  @ApiOperation({ summary: 'Create registration (binding price computed server-side)' })
  create(@Body() dto: CreateRegistrationDto) {
    return this.regs.create(dto);
  }

  // Strona zgłoszenia gościa (link z maila): podgląd + zmiana / domówienie noclegu.
  // Trasy „manage/…" muszą być PRZED „registrations/:id", żeby nie złapał ich parametr.
  @Get('registrations/manage/:token')
  @ApiOperation({ summary: 'Guest registration page (by edit token)' })
  manage(@Param('token') token: string) {
    return this.regs.getByManageToken(token);
  }

  @Put('registrations/manage/:token/accommodation')
  @ApiOperation({ summary: 'Guest changes / adds accommodation (re-priced server-side)' })
  updateAccommodation(@Param('token') token: string, @Body() dto: UpdateAccommodationDto) {
    return this.regs.updateAccommodationByToken(token, dto);
  }

  @Get('registrations/:id')
  @ApiOperation({ summary: 'Get registration by magic-link token' })
  findOne(@Param('id') id: string, @Query('token') token?: string) {
    return this.regs.findById(id, token);
  }

  @Put('registrations/:id')
  @ApiOperation({ summary: 'Update registration (magic-link)' })
  update(
    @Param('id') id: string,
    @Query('token') token: string,
    @Body() dto: Partial<CreateRegistrationDto>,
  ) {
    return this.regs.update(id, token, dto);
  }

  @Get('registrations/:id/calendar.ics')
  @ApiOperation({ summary: 'Download iCal file' })
  async getIcs(@Param('id') id: string, @Res() res: Response) {
    const ics = await this.regs.getIcs(id);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="event-${id}.ics"`);
    res.send(ics);
  }

  @Get('registrations/:id/calendar/google')
  @ApiOperation({ summary: 'Redirect to Google Calendar add-event' })
  async getGoogleCalendar(@Param('id') id: string, @Res() res: Response) {
    const url = await this.regs.getGoogleCalendarUrl(id);
    res.redirect(302, url);
  }

  // ── Admin endpoints ────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch('admin/registrations/:id')
  @ApiOperation({ summary: 'Edytuj zgłoszenie (admin) — pełny skład + ponowne przeliczenie ceny' })
  adminUpdate(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.regs.adminUpdate(id, dto as any);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('admin/instances/:id/registrations')
  @ApiOperation({ summary: 'List registrations for instance (admin)' })
  listForInstance(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.regs.listForInstance(id, status, q);
  }
}
