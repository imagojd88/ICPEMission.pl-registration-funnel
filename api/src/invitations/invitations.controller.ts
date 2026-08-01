import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InvitationsService } from './invitations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface Invitee {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

@ApiTags('invitations')
@Controller()
export class InvitationsController {
  constructor(private readonly invites: InvitationsService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/instances/:id/invitations')
  @ApiOperation({ summary: 'Dodaj zaproszonych do eventu (domyślnie wysyła maile z linkami)' })
  create(@Param('id') id: string, @Body() dto: { invitees: Invitee[]; sendEmails?: boolean }) {
    return this.invites.createMany(id, dto?.invitees ?? [], dto?.sendEmails !== false);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch('admin/invitations/:invId')
  @ApiOperation({ summary: 'Edytuj zaproszonego (np. dopisz telefon)' })
  update(@Param('invId') invId: string, @Body() dto: Partial<Invitee>) {
    return this.invites.update(invId, dto ?? {});
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/invitations/:invId/send')
  @ApiOperation({ summary: 'Wyślij (ponownie) zaproszenie mailem' })
  resend(@Param('invId') invId: string) {
    return this.invites.resend(invId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/instances/:id/invitations/send')
  @ApiOperation({ summary: 'Wyślij zaproszenia zbiorczo (domyślnie tylko niewysłane)' })
  resendAll(@Param('id') id: string, @Body() dto?: { onlyUnsent?: boolean }) {
    return this.invites.resendAll(id, dto?.onlyUnsent !== false);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('admin/instances/:id/invitations')
  @ApiOperation({ summary: 'Lista zaproszonych (z tokenami/linkami)' })
  list(@Param('id') id: string) {
    return this.invites.list(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('admin/invitations/:invId')
  @ApiOperation({ summary: 'Usuń zaproszenie' })
  remove(@Param('invId') invId: string) {
    return this.invites.remove(invId);
  }

  @Get('invite/:token')
  @ApiOperation({ summary: 'Publiczne: dane zaproszenia po linku' })
  get(@Param('token') token: string) {
    return this.invites.getByToken(token);
  }

  @Post('invite/:token/confirm')
  @ApiOperation({ summary: 'Publiczne: potwierdź udział po linku' })
  confirm(@Param('token') token: string, @Body() dto?: { dietaryNotes?: string }) {
    return this.invites.confirmByToken(token, dto?.dietaryNotes);
  }

  @Post('r/:slug/invite-match')
  @ApiOperation({ summary: 'Publiczne: dopasuj dane do zaproszenia (bez linku) i potwierdź' })
  match(@Param('slug') slug: string, @Body() dto: Invitee & { dietaryNotes?: string }) {
    return this.invites.matchBySlug(slug, dto);
  }
}
