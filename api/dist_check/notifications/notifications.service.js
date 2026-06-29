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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
let NotificationsService = class NotificationsService {
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
        this.mailMode = this.config.get('MAIL_MODE', 'log');
    }
    async sendMail(payload) {
        const notification = await this.prisma.notification.create({
            data: {
                type: payload.type,
                channel: 'email',
                to: payload.to,
                locale: payload.locale,
                status: 'QUEUED',
                payload: payload.data,
                registrationId: payload.registrationId,
            },
        });
        if (this.mailMode === 'log') {
            console.log('[MAIL:log]', JSON.stringify({ id: notification.id, ...payload }, null, 2));
            await this.prisma.notification.update({ where: { id: notification.id }, data: { status: 'SENT' } });
        }
    }
    async sendConfirmation(opts) {
        await this.sendMail({
            to: opts.to,
            type: 'CONFIRMATION',
            locale: opts.locale,
            registrationId: opts.registrationId,
            data: opts,
        });
    }
    async sendPaymentReminder(opts) {
        await this.sendMail({
            to: opts.to,
            type: 'PAYMENT_REMINDER',
            locale: opts.locale,
            registrationId: opts.registrationId,
            data: opts,
        });
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map