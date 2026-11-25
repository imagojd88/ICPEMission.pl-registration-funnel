import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StaffService } from './staff.service';

type AdminReq = { user?: { email?: string; realm?: string } };

/**
 * Pomocnicy eventu — zarządzanie z panelu admina. Za JwtAuthGuard (pełne role), a dodatkowo
 * tylko zalogowany człowiek: token serwisowy nie zakłada kont ani nie zmienia haseł.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/instances/:id/staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  private actor(req: AdminReq): string {
    if (req.user?.realm !== 'admin' || !req.user.email) throw new ForbiddenException('Tylko zalogowany administrator.');
    return req.user.email;
  }

  @Get()
  @ApiOperation({ summary: 'Pomocnicy eventu' })
  list(@Param('id') id: string, @Req() req: AdminReq) {
    this.actor(req);
    return this.staff.list(id);
  }

  @Post()
  @ApiOperation({ summary: 'Dodaj pomocnika (nowe konto: hasło tymczasowe zwracane raz)' })
  add(@Param('id') id: string, @Body() dto: { email?: string; scopes?: unknown; expiresAt?: unknown }, @Req() req: AdminReq) {
    return this.staff.add(id, dto ?? {}, this.actor(req));
  }

  @Patch(':grantId')
  @ApiOperation({ summary: 'Zmień zakresy / datę wygaśnięcia' })
  update(@Param('id') id: string, @Param('grantId') grantId: string, @Body() dto: { scopes?: unknown; expiresAt?: unknown }, @Req() req: AdminReq) {
    this.actor(req);
    return this.staff.update(id, grantId, dto ?? {});
  }

  @Delete(':grantId')
  @ApiOperation({ summary: 'Odbierz dostęp do eventu' })
  remove(@Param('id') id: string, @Param('grantId') grantId: string, @Req() req: AdminReq) {
    this.actor(req);
    return this.staff.remove(id, grantId);
  }

  @Post(':grantId/reset-password')
  @ApiOperation({ summary: 'Nowe hasło tymczasowe pomocnika (zwracane raz)' })
  resetPassword(@Param('id') id: string, @Param('grantId') grantId: string, @Req() req: AdminReq) {
    this.actor(req);
    return this.staff.resetPassword(id, grantId);
  }
}
