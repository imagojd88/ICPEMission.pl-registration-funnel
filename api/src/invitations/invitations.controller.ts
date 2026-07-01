import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InvitationsService } from './invitations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface Invitee {
  firstName: string;
  lastName: string;
  email: string;
}

@ApiTags('invitations')
@Controller()
export class InvitationsController {
  constructor(private readonly invites: InvitationsService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/instances/:id/invitations')
  @ApiOperation({ summary: 'Dodaj zaproszonych do eventu' })
  create(@Param('id') id: string, @Body() dto: { invitees: Invitee[] }) {
    return this.invites.createMany(id, dto?.invitees ?? []);
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
