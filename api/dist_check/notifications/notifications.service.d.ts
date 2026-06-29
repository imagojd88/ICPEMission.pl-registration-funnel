import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export interface MailPayload {
    to: string;
    type: string;
    locale: string;
    data: Record<string, unknown>;
    registrationId?: string;
}
export declare class NotificationsService {
    private readonly prisma;
    private readonly config;
    private readonly mailMode;
    constructor(prisma: PrismaService, config: ConfigService);
    sendMail(payload: MailPayload): Promise<void>;
    sendConfirmation(opts: {
        to: string;
        locale: string;
        registrationId: string;
        eventTitle: string;
        startsAt: Date;
        totalPrice: number;
        currency: string;
        paymentMethod: string;
        editToken: string;
    }): Promise<void>;
    sendPaymentReminder(opts: {
        to: string;
        locale: string;
        registrationId: string;
        amount: number;
        transferTitle: string;
    }): Promise<void>;
}
