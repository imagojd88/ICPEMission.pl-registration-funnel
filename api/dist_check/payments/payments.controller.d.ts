import { PaymentsService } from './payments.service';
export declare class PaymentsController {
    private readonly payments;
    constructor(payments: PaymentsService);
    checkout(regId: string, dto: {
        method: 'ONLINE' | 'BANK_TRANSFER';
    }): Promise<{
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
    webhook(provider: string, payload: unknown, signature?: string): Promise<{
        received: boolean;
    }>;
    devConfirm(regId: string): Promise<{
        ok: boolean;
        regId: string;
        paymentId: any;
    }>;
}
