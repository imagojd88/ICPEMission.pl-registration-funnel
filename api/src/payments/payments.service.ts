import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  private readonly mode: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.mode = this.config.get<string>('PAYMENTS_MODE', 'mock');
  }

  async checkout(regId: string, method: 'ONLINE' | 'BANK_TRANSFER') {
    const reg = await this.prisma.registration.findUnique({
      where: { id: regId },
      include: { instance: true },
    });
    if (!reg) throw new NotFoundException('Registration not found');

    if (method === 'BANK_TRANSFER') {
      const org = await this.prisma.organization.findFirst();
      return {
        method: 'BANK_TRANSFER',
        transferTitle: `REG-${regId}`,
        amount: Number(reg.totalPrice),
        currency: reg.currency,
        bankDetails: org?.bankDetails ?? { iban: 'PL00 0000 0000 0000 0000 0000 0000', bankName: 'Bank ICPE' },
      };
    }

    // ONLINE (mock mode)
    if (this.mode === 'mock') {
      const payment = await this.prisma.payment.create({
        data: {
          registrationId: regId,
          provider: 'mock',
          method: 'ONLINE',
          amount: reg.totalPrice,
          currency: reg.currency,
          status: 'PENDING',
          externalId: `mock-${Date.now()}`,
        },
      });
      const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173');
      return {
        method: 'ONLINE',
        paymentId: payment.id,
        redirectUrl: `${frontendUrl}/payment/mock?regId=${regId}&paymentId=${payment.id}`,
      };
    }

    throw new BadRequestException('Payment provider not configured');
  }

  /** Dev-only: confirm a mock payment */
  async devConfirm(regId: string) {
    if (this.mode !== 'mock') throw new BadRequestException('Only available in mock mode');
    const payment = await this.prisma.payment.findFirst({
      where: { registrationId: regId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!payment) throw new NotFoundException('Pending payment not found');
    await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'PAID' } });
    await this.prisma.registration.update({ where: { id: regId }, data: { status: 'CONFIRMED' } });
    return { ok: true, regId, paymentId: payment.id };
  }

  async handleWebhook(provider: string, payload: unknown, signature?: string) {
    // Production: verify signature, update payment + registration
    console.log(`[WEBHOOK:${provider}]`, payload, 'sig:', signature);
    return { received: true };
  }
}
