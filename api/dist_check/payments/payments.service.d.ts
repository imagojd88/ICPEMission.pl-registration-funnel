import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export declare class PaymentsService {
    private readonly prisma;
    private readonly config;
    private readonly mode;
    constructor(prisma: PrismaService, config: ConfigService);
    checkout(regId: string, method: 'ONLINE' | 'BANK_TRANSFER'): Promise<{
        method: string;
        transferTitle: string;
        amount: number;
        currency: any;
        bankDetails: any;
        paymentId?: undefined;
        redirectUrl?: undefined;
    } | {
        method: string;
        paymentId: any;
        redirectUrl: string;
        transferTitle?: undefined;
        amount?: undefined;
        currency?: undefined;
        bankDetails?: undefined;
    }>;
    devConfirm(regId: string): Promise<{
        ok: boolean;
        regId: string;
        paymentId: any;
    }>;
    handleWebhook(provider: string, payload: unknown, signature?: string): Promise<{
        received: boolean;
    }>;
}
