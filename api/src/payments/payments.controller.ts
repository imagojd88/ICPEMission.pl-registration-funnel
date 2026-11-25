import { Controller, Get, Post, Param, Body, Req, Res, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PaymentsService } from './payments.service';
import { OnlinePaymentsService } from './online-payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly online: OnlinePaymentsService,
  ) {}

  // ── Płatności online (Tpay) ────────────────────────────────────────────────

  @Get('payments/config')
  @ApiOperation({ summary: 'Skonfigurowani dostawcy płatności online (bez sekretów); w trybie mock pusta lista' })
  config() {
    return this.online.publicConfig();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('admin/payments/online-status')
  @ApiOperation({ summary: 'Stan konfiguracji płatności online (tryb, środowisko, czy klucze ustawione — tak / nie)' })
  onlineStatus() {
    return this.online.adminStatus();
  }

  // Strona zgłoszenia gościa: dostęp wyłącznie po tokenie zgłoszenia (jak pozostałe trasy „manage/…”).
  @Get('registrations/manage/:token/payments')
  @ApiOperation({ summary: 'Guest: rozliczenie zgłoszenia, granice kwot, wpłaty, stan ostatniej próby' })
  managePayments(@Param('token') token: string) {
    return this.online.overview(token);
  }

  @Post('registrations/manage/:token/pay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Guest: utwórz płatność online (kwotę liczy i sprawdza serwer) → adres przekierowania' })
  managePay(@Param('token') token: string, @Body() dto: { mode?: 'due' | 'remaining' | 'custom'; amount?: number | string }) {
    return this.online.pay(token, dto ?? {});
  }

  /**
   * Powiadomienie Tpay: surowe ciało (`application/x-www-form-urlencoded`) + nagłówek `X-JWS-Signature`.
   * Odpowiedź tekstowa: `TRUE` (200) albo `FALSE` (400 przy nieudanej weryfikacji, 500 przy błędzie
   * po naszej stronie — Tpay ponowi). Nigdy 404: zatrzymałoby ponowienia.
   * Trasa musi być PRZED `payments/webhook/:provider`.
   */
  @Post('payments/webhook/tpay')
  @ApiOperation({ summary: 'Tpay notification (JWS-signed); responds with plain TRUE / FALSE' })
  async tpayWebhook(@Req() req: RawBodyRequest<Request>, @Res() res: Response) {
    let status = 400;
    try {
      const jws = req.headers['x-jws-signature'];
      const ok = await this.online.handleTpayNotification(req.rawBody, Array.isArray(jws) ? jws[0] : jws);
      status = ok ? 200 : 400;
    } catch {
      // Szczegóły loguje serwis (bez danych powiadomienia); tu tylko odpowiedź dla operatora.
      status = 500;
    }
    res.status(status);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(status === 200 ? 'TRUE' : 'FALSE');
  }

  // ── Zastane trasy ──────────────────────────────────────────────────────────

  // Tylko dla zalogowanego admina (albo tokenu serwisowego): bez tego każdy, kto zna numer
  // zgłoszenia, mógł tworzyć wiersze płatności. Lejek tej trasy nie używa — gość płaci przez
  // `registrations/manage/:token/pay`. Trasa zostaje, bo jest w CONTRACT.md.
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('payments/:regId/checkout')
  @ApiOperation({ summary: 'Start payment (online→mock redirect, bank_transfer→data) — admin only' })
  checkout(@Param('regId') regId: string, @Body() dto: { method: 'ONLINE' | 'BANK_TRANSFER' }) {
    return this.payments.checkout(regId, dto.method);
  }

  @Post('payments/webhook/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Payment webhook (operator callback)' })
  webhook(@Param('provider') provider: string) {
    return this.payments.handleWebhook(provider);
  }

  // Tylko dla zalogowanego admina: bez tego w trybie mock każdy, kto zna numer zgłoszenia,
  // mógł sam oznaczyć je jako opłacone i potwierdzone (checkout + dev/confirm).
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('payments/dev/confirm/:regId')
  @ApiOperation({ summary: '[DEV] Confirm mock payment (admin only)' })
  devConfirm(@Param('regId') regId: string) {
    return this.payments.devConfirm(regId);
  }
}
