import { Controller, Post, Param, Body, Headers, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('payments/:regId/checkout')
  @ApiOperation({ summary: 'Start payment (online→mock redirect, bank_transfer→data)' })
  checkout(@Param('regId') regId: string, @Body() dto: { method: 'ONLINE' | 'BANK_TRANSFER' }) {
    return this.payments.checkout(regId, dto.method);
  }

  @Post('payments/webhook/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Payment webhook (operator callback)' })
  webhook(
    @Param('provider') provider: string,
    @Body() payload: unknown,
    @Headers('x-signature') signature?: string,
  ) {
    return this.payments.handleWebhook(provider, payload, signature);
  }

  @Post('payments/dev/confirm/:regId')
  @ApiOperation({ summary: '[DEV] Confirm mock payment' })
  devConfirm(@Param('regId') regId: string) {
    return this.payments.devConfirm(regId);
  }
}
