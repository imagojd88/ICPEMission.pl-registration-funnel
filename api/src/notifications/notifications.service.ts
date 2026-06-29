import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface MailPayload {
  to: string;
  type: string;
  locale: string;
  data: Record<string, unknown>;
  registrationId?: string;
}

@Injectable()
export class NotificationsService {
  private readonly mailMode: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.mailMode = this.config.get<string>('MAIL_MODE', 'log');
  }

  async sendMail(payload: MailPayload): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: {
        type: payload.type,
        channel: 'email',
        to: payload.to,
        locale: payload.locale,
        status: 'QUEUED',
        payload: payload.data as object,
        registrationId: payload.registrationId,
      },
    });

    if (this.mailMode === 'log') {
      console.log('[MAIL:log]', JSON.stringify({ id: notification.id, ...payload }, null, 2));
      await this.prisma.notification.update({ where: { id: notification.id }, data: { status: 'SENT' } });
    }
    // In production: dispatch to queue / SMTP provider here
  }

  async sendConfirmation(opts: {
    to: string; locale: string; registrationId: string;
    eventTitle: string; startsAt: Date; totalPrice: number; currency: string;
    paymentMethod: string; editToken: string;
  }) {
    await this.sendMail({
      to: opts.to,
      type: 'CONFIRMATION',
      locale: opts.locale,
      registrationId: opts.registrationId,
      data: opts,
    });
  }

  async sendPaymentReminder(opts: { to: string; locale: string; registrationId: string; amount: number; transferTitle: string }) {
    await this.sendMail({
      to: opts.to,
      type: 'PAYMENT_REMINDER',
      locale: opts.locale,
      registrationId: opts.registrationId,
      data: opts,
    });
  }
}
