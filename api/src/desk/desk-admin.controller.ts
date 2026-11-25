import { Body, Controller, ForbiddenException, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeskAdminService } from './desk-admin.service';

type AdminReq = { user?: { email?: string; realm?: string } };

/**
 * Panel admina ▸ „Recepcja”: dziennik działań i prośby dodatkowe eventu. Za `JwtAuthGuard`
 * (pomocnik recepcji tu nie wejdzie). Odczyt; jedyny zapis to status prośby — tylko zalogowany admin.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/instances/:id')
export class DeskAdminController {
  constructor(private readonly deskAdmin: DeskAdminService) {}

  @Get('desk-log')
  @ApiOperation({ summary: 'Dziennik działań Recepcji (filtr: actor, action; stronicowanie: page, pageSize)' })
  log(
    @Param('id') id: string,
    @Query('actor') actor?: string,
    @Query('action') action?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.deskAdmin.log(id, { actor, action, page, pageSize });
  }

  @Get('desk-requests')
  @ApiOperation({ summary: 'Prośby dodatkowe eventu (status=OPEN | DONE | brak = wszystkie)' })
  requests(@Param('id') id: string, @Query('status') status?: string) {
    return this.deskAdmin.requests(id, status);
  }

  @Patch('desk-requests/:requestId')
  @ApiOperation({ summary: 'Prośba: załatwiona (DONE) / otwarta ponownie (OPEN) — tylko zalogowany admin' })
  setRequestStatus(@Param('id') id: string, @Param('requestId') requestId: string, @Body() dto: { status?: string }, @Req() req: AdminReq) {
    if (req.user?.realm !== 'admin' || !req.user.email) throw new ForbiddenException('Tylko zalogowany administrator.');
    return this.deskAdmin.setRequestStatus(id, requestId, String(dto?.status ?? ''), req.user.email);
  }
}
