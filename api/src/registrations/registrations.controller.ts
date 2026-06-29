import {
  Controller, Get, Post, Put, Param, Query, Body, Res, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RegistrationsService } from './registrations.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Response } from 'express';

@ApiTags('registrations')
@Controller()
export class RegistrationsController {
  constructor(private readonly regs: RegistrationsService) {}

  @Post('registrations')
  @ApiOperation({ summary: 'Create registration (binding price computed server-side)' })
  create(@Body() dto: CreateRegistrationDto) {
    return this.regs.create(dto);
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
