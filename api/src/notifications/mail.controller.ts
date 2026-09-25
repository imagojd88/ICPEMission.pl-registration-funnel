import { Body, Controller, Get, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

/** Sekcja „E-mail" w Ustawieniach panelu: stan dostawcy, mail testowy, dziennik wysyłek. */
@ApiTags('mail')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('admin/mail')
export class MailController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('status')
  @ApiOperation({ summary: 'Aktywny dostawca maili i nadawca (bez sekretów)' })
  status() {
    return this.notifications.status();
  }

  @Post('test')
  @ApiOperation({ summary: 'Wyślij mail testowy na podany adres' })
  test(@Body() dto: { to?: string }) {
    const to = (dto?.to ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new BadRequestException('Podaj poprawny adres e-mail');
    return this.notifications.sendTest(to);
  }

  @Get('log')
  @ApiOperation({ summary: 'Ostatnie maile (status, błąd dostawcy)' })
  log(@Query('limit') limit?: string) {
    return this.notifications.log(limit ? parseInt(limit, 10) || 30 : 30);
  }
}
