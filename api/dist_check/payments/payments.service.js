"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
let PaymentsService = class PaymentsService {
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
        this.mode = this.config.get('PAYMENTS_MODE', 'mock');
    }
    async checkout(regId, method) {
        const reg = await this.prisma.registration.findUnique({
            where: { id: regId },
            include: { instance: true },
        });
        if (!reg)
            throw new common_1.NotFoundException('Registration not found');
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
            const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:5173');
            return {
                method: 'ONLINE',
                paymentId: payment.id,
                redirectUrl: `${frontendUrl}/payment/mock?regId=${regId}&paymentId=${payment.id}`,
            };
        }
        throw new common_1.BadRequestException('Payment provider not configured');
    }
    async devConfirm(regId) {
        if (this.mode !== 'mock')
            throw new common_1.BadRequestException('Only available in mock mode');
        const payment = await this.prisma.payment.findFirst({
            where: { registrationId: regId, status: 'PENDING' },
            orderBy: { createdAt: 'desc' },
        });
        if (!payment)
            throw new common_1.NotFoundException('Pending payment not found');
        await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'PAID' } });
        await this.prisma.registration.update({ where: { id: regId }, data: { status: 'CONFIRMED' } });
        return { ok: true, regId, paymentId: payment.id };
    }
    async handleWebhook(provider, payload, signature) {
        console.log(`[WEBHOOK:${provider}]`, payload, 'sig:', signature);
        return { received: true };
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map