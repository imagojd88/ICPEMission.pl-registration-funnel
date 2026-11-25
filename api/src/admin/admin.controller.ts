import { Controller, Get, Post, Patch, Delete, Param, Body, Req, HttpCode, HttpStatus, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminActor, RegistrationAdminService } from './registration-admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly regAdmin: RegistrationAdminService,
  ) {}

  /**
   * Operacje tylko dla zalogowanego pełnego admina (JWT realm `admin`). `JwtAuthGuard` wpuszcza też token
   * serwisowy (Personal OS) — ten nie dostaje linku strony gościa i niczego nie usuwa.
   */
  private adminActor(req: { user?: { sub?: string; email?: string; realm?: string } }, what: string): AdminActor {
    const u = req.user;
    if (!u || u.realm !== 'admin' || !u.email) throw new ForbiddenException(`${what} — tylko zalogowany administrator.`);
    return { id: u.sub ? String(u.sub) : null, email: String(u.email) };
  }

  // ── Panel: szczegóły, przywracanie i trwałe usuwanie danych testowych ─────

  @Get('registrations/:id/detail')
  @ApiOperation({ summary: 'Szczegóły zgłoszenia dla admina: link strony gościa (/z/<token>), suma wpłat, co wolno zrobić — tylko JWT admina' })
  registrationDetail(@Param('id') id: string, @Req() req: { user?: { sub?: string; email?: string; realm?: string } }) {
    this.adminActor(req, 'Szczegóły zgłoszenia z linkiem gościa');
    return this.regAdmin.detail(id);
  }

  @Post('registrations/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Przywróć anulowane zgłoszenie (status z wpłat; przy braku miejsc / pokoi wymaga force: true)' })
  restoreRegistration(
    @Param('id') id: string,
    @Body() dto: { force?: boolean },
    @Req() req: { user?: { email?: string; realm?: string } },
  ) {
    return this.regAdmin.restore(id, dto?.force === true, req.user?.email ?? req.user?.realm ?? 'admin');
  }

  // POST (nie DELETE): potwierdzenie idzie w ciele żądania, a ciało przy DELETE bywa gubione po drodze.
  @Post('registrations/:id/delete-permanently')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'TRWALE usuń anulowane zgłoszenie bez prawdziwych wpłat (confirm: "USUŃ") — tylko JWT admina' })
  deleteRegistrationPermanently(
    @Param('id') id: string,
    @Body() dto: { confirm?: string },
    @Req() req: { user?: { sub?: string; email?: string; realm?: string } },
  ) {
    return this.regAdmin.deletePermanently(id, dto?.confirm, this.adminActor(req, 'Trwałe usuwanie zgłoszeń'));
  }

  @Delete('payments/:paymentId/test')
  @ApiOperation({ summary: 'TRWALE usuń wpłatę TESTOWĄ Tpay (z próbą płatności i zwrotami) — tylko JWT admina; prawdziwej wpłaty nie usunie' })
  deleteTestPayment(@Param('paymentId') paymentId: string, @Req() req: { user?: { sub?: string; email?: string; realm?: string } }) {
    return this.regAdmin.deleteTestPayment(paymentId, this.adminActor(req, 'Usuwanie wpłat testowych'));
  }

  @Get('summary')
  @ApiOperation({ summary: 'KPI dashboard summary (Personal OS integration)' })
  getSummary() {
    return this.admin.getSummary();
  }

  @Patch('registrations/:id/status')
  @ApiOperation({ summary: 'Update registration status' })
  updateStatus(@Param('id') id: string, @Body() dto: { status: string }) {
    return this.admin.updateRegistrationStatus(id, dto.status);
  }

  @Post('registrations/:id/mark-paid')
  @ApiOperation({ summary: 'Mark registration as paid (manual bank transfer)' })
  markPaid(@Param('id') id: string) {
    return this.admin.markPaid(id);
  }

  @Post('registrations/:id/assign-room')
  @ApiOperation({ summary: 'Assign room to registration' })
  assignRoom(
    @Param('id') id: string,
    @Body() dto: { roomId: string; participantId?: string },
  ) {
    return this.admin.assignRoom(id, dto.roomId, undefined, dto.participantId);
  }

  @Post('registrations/:id/check-in')
  @ApiOperation({ summary: 'Toggle attendance check-in for registration' })
  checkIn(@Param('id') id: string, @Body() dto?: { present?: boolean }) {
    return this.admin.toggleCheckIn(id, dto?.present);
  }

  @Patch('registrations/:id/accommodation')
  @ApiOperation({ summary: 'Set room number + note (accommodation)' })
  accommodation(@Param('id') id: string, @Body() dto: { roomLabel?: string | null; roomNote?: string | null }) {
    return this.admin.setAccommodation(id, dto);
  }
}
