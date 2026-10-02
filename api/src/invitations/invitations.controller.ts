import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InvitationsService, type ConfirmPayload, type HouseholdInput } from './invitations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GuestInvitesService, type GuestInput } from './guest-invites.service';

/** Body podglądu maila: szkic pól gościa + (opcjonalnie) tryb „potwierdzony" ze składem. */
type PreviewBody = Partial<Invitee> & { preconfirmed?: boolean; household?: HouseholdInput };

interface Invitee {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  mailSalutation?: string | null;
  mailNote?: string | null;
  mailSubject?: string | null;
  mailFormal?: boolean;
}

@ApiTags('invitations')
@Controller()
export class InvitationsController {
  constructor(
    private readonly invites: InvitationsService,
    private readonly guestInvites: GuestInvitesService,
  ) {}

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
  @Post('admin/invitations/:invId/preview')
  @ApiOperation({ summary: 'Podgląd maila z zaproszeniem (body nadpisuje zapisane pola, bez zapisu)' })
  previewExisting(@Param('invId') invId: string, @Body() body?: PreviewBody) {
    const { preconfirmed, household, ...draft } = body ?? {};
    return this.invites.preview({ invId, draft, preconfirmed: preconfirmed === true, household });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/instances/:id/invitations/preview')
  @ApiOperation({ summary: 'Podgląd maila dla nowego gościa (przed dodaniem)' })
  previewNew(@Param('id') id: string, @Body() body?: PreviewBody) {
    const { preconfirmed, household, ...draft } = body ?? {};
    return this.invites.preview({ instanceId: id, draft, preconfirmed: preconfirmed === true, household });
  }

  // ── Potwierdzeni przez organizatora (event INVITE) ──

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/instances/:id/invitations/confirmed')
  @ApiOperation({
    summary:
      'Dodaj od razu potwierdzone osoby/małżeństwa/rodziny (bez zaproszenia). Zwraca { items, conflicts, added, confirmedExisting, mail }',
  })
  createConfirmed(
    @Param('id') id: string,
    @Body()
    dto: { households: HouseholdInput[]; sendEmails?: boolean; confirmExisting?: boolean; ignoreWarnings?: boolean },
  ) {
    return this.invites.createConfirmed(id, dto?.households ?? [], {
      sendEmails: dto?.sendEmails !== false,
      confirmExisting: dto?.confirmExisting === true,
      ignoreWarnings: dto?.ignoreWarnings === true,
    });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/invitations/:invId/confirm')
  @ApiOperation({ summary: 'Potwierdź ręcznie (albo popraw skład i diety potwierdzonego). Zwraca { item, mail }' })
  confirmByAdmin(@Param('invId') invId: string, @Body() dto: HouseholdInput & { sendEmail?: boolean }) {
    const { sendEmail, ...household } = dto ?? {};
    return this.invites.confirmByAdmin(invId, household, { sendEmail: typeof sendEmail === 'boolean' ? sendEmail : undefined });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/invitations/:invId/unconfirm')
  @ApiOperation({ summary: 'Cofnij potwierdzenie / odmowę (z powrotem „czeka"); zgłoszenie → CANCELLED' })
  unconfirm(@Param('invId') invId: string) {
    return this.invites.unconfirm(invId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/invitations/:invId/decline')
  @ApiOperation({ summary: 'Oznacz odmowę udziału (np. po telefonie); zgłoszenie → CANCELLED' })
  declineByAdmin(@Param('invId') invId: string) {
    return this.invites.declineByAdmin(invId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/instances/:id/invitations/diet-reminders')
  @ApiOperation({ summary: 'Przypomnij o diecie potwierdzonym przez organizatora, którzy nie odpowiedzieli' })
  dietReminders(@Param('id') id: string) {
    return this.invites.sendDietReminders(id);
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
  @Post('admin/instances/:id/invitations/sync-registrations')
  @ApiOperation({ summary: 'Backfill: dogoń zgłoszenia (moduł Zgłoszenia/Obecność) dla już potwierdzonych zaproszeń' })
  syncRegistrations(@Param('id') id: string) {
    return this.invites.syncAllRegistrations(id);
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
  @ApiOperation({ summary: 'Publiczne: potwierdź (lub zmień) udział po linku' })
  confirm(@Param('token') token: string, @Body() dto?: ConfirmPayload) {
    return this.invites.confirmByToken(token, dto ?? {});
  }

  @Post('invite/:token/decline')
  @ApiOperation({ summary: 'Publiczne: „Nie damy rady przyjść" — odmowa udziału po linku' })
  decline(@Param('token') token: string) {
    return this.invites.declineByToken(token);
  }

  @Post('r/:slug/invite-match')
  @ApiOperation({ summary: 'Publiczne: dopasuj dane do zaproszenia (bez linku) i potwierdź' })
  match(@Param('slug') slug: string, @Body() dto: Invitee & ConfirmPayload) {
    return this.invites.matchBySlug(slug, dto);
  }

  // ── Ścieżka „uczestnik zaprasza gościa" (publiczna, autoryzacja sekretnym tokenem) ──
  // :token = token osobistego zaproszenia (event INVITE) albo editToken zgłoszenia (zwykły event).

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('admin/instances/:id/guest-invite-links/send')
  @ApiOperation({ summary: 'Wyślij uczestnikom link „Zaproś gościa" (dla tych, którzy zapisali się wcześniej)' })
  sendGuestLinks(@Param('id') id: string) {
    return this.guestInvites.sendLinksToAll(id);
  }

  @Get('guest-invites/:token')
  @ApiOperation({ summary: 'Publiczne: stan zapraszania gości (limit, moi goście)' })
  guestView(@Param('token') token: string) {
    return this.guestInvites.view(token);
  }

  @Post('guest-invites/:token')
  @ApiOperation({ summary: 'Publiczne: uczestnik dodaje gościa (imię, nazwisko, e-mail, telefon) — gość dostaje mail' })
  guestAdd(@Param('token') token: string, @Body() dto: GuestInput) {
    return this.guestInvites.add(token, dto ?? {});
  }

  @Delete('guest-invites/:token/guests/:guestId')
  @ApiOperation({ summary: 'Publiczne: uczestnik wycofuje swojego (niepotwierdzonego) gościa' })
  guestRemove(@Param('token') token: string, @Param('guestId') guestId: string) {
    return this.guestInvites.remove(token, guestId);
  }
}
