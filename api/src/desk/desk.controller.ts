import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeskAccess, DeskActor, DeskAuthGuard } from './desk-auth.guard';
import { DeskService } from './desk.service';

type DeskReq = { desk: DeskActor };

/**
 * Recepcja (stanowisko przyjęć). Każda końcówka ma jawne wymaganie (@DeskAccess);
 * event zawsze w adresie (`:instanceId`), a serwis sprawdza, że zgłoszenie / wpłata / prośba
 * należy do tego eventu. Autor akcji = e-mail z tokenu.
 */
@ApiTags('desk')
@ApiBearerAuth()
@UseGuards(DeskAuthGuard)
@Controller('desk')
export class DeskController {
  constructor(private readonly desk: DeskService) {}

  @Get('me')
  @DeskAccess('self')
  @ApiOperation({ summary: 'Kto jestem + eventy, do których mam dostęp w recepcji' })
  me(@Req() req: DeskReq) {
    return this.desk.me(req.desk);
  }

  @Get('instances/:instanceId')
  @DeskAccess('any')
  @ApiOperation({ summary: 'Recepcja eventu: liczniki + lista zgłoszeń (pola ograniczone do potrzeb recepcji)' })
  overview(@Param('instanceId') instanceId: string, @Req() req: DeskReq) {
    return this.desk.overview(instanceId, req.desk);
  }

  @Post('instances/:instanceId/registrations/:registrationId/check-in')
  @DeskAccess('checkin')
  @ApiOperation({ summary: 'Oznacz przyjazd / cofnij' })
  checkIn(@Param('instanceId') instanceId: string, @Param('registrationId') registrationId: string, @Body() dto: { present?: boolean }, @Req() req: DeskReq) {
    return this.desk.setCheckIn(instanceId, registrationId, dto?.present !== false, req.desk);
  }

  @Post('instances/:instanceId/registrations/:registrationId/key')
  @DeskAccess('keys')
  @ApiOperation({ summary: 'Klucz: issue | return | undo-issue | undo-return' })
  key(@Param('instanceId') instanceId: string, @Param('registrationId') registrationId: string, @Body() dto: { action?: string }, @Req() req: DeskReq) {
    return this.desk.setKey(instanceId, registrationId, String(dto?.action ?? ''), req.desk);
  }

  @Get('instances/:instanceId/registrations/:registrationId/payments')
  @DeskAccess('payments')
  @ApiOperation({ summary: 'Wpłaty zgłoszenia' })
  payments(@Param('instanceId') instanceId: string, @Param('registrationId') registrationId: string) {
    return this.desk.payments(instanceId, registrationId);
  }

  @Post('instances/:instanceId/registrations/:registrationId/payments')
  @DeskAccess('payments')
  @ApiOperation({ summary: 'Przyjmij wpłatę (gotówka albo przelew)' })
  addPayment(
    @Param('instanceId') instanceId: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: { amount?: unknown; method?: string; note?: string; clientId?: string },
    @Req() req: DeskReq,
  ) {
    return this.desk.addPayment(instanceId, registrationId, dto ?? {}, req.desk);
  }

  @Delete('instances/:instanceId/payments/:paymentId')
  @DeskAccess('admin')
  @ApiOperation({ summary: 'Cofnij błędną wpłatę (tylko pełny admin)' })
  voidPayment(@Param('instanceId') instanceId: string, @Param('paymentId') paymentId: string, @Req() req: DeskReq) {
    return this.desk.voidPayment(instanceId, paymentId, req.desk);
  }

  @Post('instances/:instanceId/registrations/:registrationId/requests')
  @DeskAccess('requests')
  @ApiOperation({ summary: 'Dodaj prośbę dodatkową (dieta, dostawka, inne)' })
  addRequest(
    @Param('instanceId') instanceId: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: { kind?: string; participantId?: string | null; note?: string },
    @Req() req: DeskReq,
  ) {
    return this.desk.addRequest(instanceId, registrationId, dto ?? {}, req.desk);
  }

  @Patch('instances/:instanceId/requests/:requestId')
  @DeskAccess('requests')
  @ApiOperation({ summary: 'Prośba: załatwiona / otwarta ponownie' })
  setRequestStatus(@Param('instanceId') instanceId: string, @Param('requestId') requestId: string, @Body() dto: { status?: string }, @Req() req: DeskReq) {
    return this.desk.setRequestStatus(instanceId, requestId, String(dto?.status ?? ''), req.desk);
  }
}
