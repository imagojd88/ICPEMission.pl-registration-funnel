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
exports.RegistrationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const pricing_service_1 = require("../pricing/pricing.service");
const notifications_service_1 = require("../notifications/notifications.service");
const shared_1 = require("../shared");
const uuid_1 = require("uuid");
const personal_os_mapper_1 = require("../admin/personal-os.mapper");
let RegistrationsService = class RegistrationsService {
    constructor(prisma, pricing, notifications) {
        this.prisma = prisma;
        this.pricing = pricing;
        this.notifications = notifications;
    }
    async create(dto) {
        const instance = await this.prisma.eventInstance.findUnique({
            where: { id: dto.instanceId },
            include: { series: { include: { page: true } } },
        });
        if (!instance)
            throw new common_1.NotFoundException('Event instance not found');
        const priceResult = await this.pricing.quote({
            participants: dto.participants.map(p => ({ type: p.type, age: p.age })),
            roomId: dto.preferredRoomId,
            options: dto.options,
            discountCode: dto.discountCode,
        }, dto.instanceId);
        const editToken = (0, uuid_1.v4)();
        const registration = await this.prisma.registration.create({
            data: {
                instanceId: dto.instanceId,
                locale: dto.locale,
                contact: dto.contact,
                preferredRoomTypeId: dto.preferredRoomId,
                dietaryNotes: dto.dietaryNotes,
                totalPrice: priceResult.total,
                currency: priceResult.currency,
                paymentMethod: dto.paymentMethod,
                editToken,
                status: dto.paymentMethod === 'BANK_TRANSFER' ? 'AWAITING_TRANSFER' : 'PENDING_PAYMENT',
                participants: {
                    create: dto.participants.map(p => ({
                        type: p.type === 'adult' ? 'ADULT' : 'CHILD',
                        firstName: p.firstName,
                        lastName: p.lastName ?? '',
                        age: p.age,
                        gender: (p.gender === 'F' ? 'FEMALE' : p.gender === 'M' ? 'MALE' : 'OTHER'),
                        dietary: p.dietary,
                    })),
                },
            },
            include: { participants: true },
        });
        const title = instance.title[dto.locale] ?? instance.title['pl'] ?? 'Event';
        this.notifications.sendConfirmation({
            to: dto.contact.email,
            locale: dto.locale,
            registrationId: registration.id,
            eventTitle: title,
            startsAt: instance.startsAt,
            totalPrice: priceResult.total,
            currency: priceResult.currency,
            paymentMethod: dto.paymentMethod,
            editToken,
        }).catch(console.error);
        return {
            registration: this.mapToDto(registration),
            summary: priceResult,
            payment: dto.paymentMethod === 'BANK_TRANSFER'
                ? { method: 'BANK_TRANSFER', transferTitle: `REG-${registration.id}` }
                : { method: 'ONLINE', registrationId: registration.id },
        };
    }
    async findById(id, token) {
        const reg = await this.prisma.registration.findUnique({
            where: { id },
            include: { participants: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 }, assignments: { include: { room: { include: { roomType: true } } } } },
        });
        if (!reg)
            throw new common_1.NotFoundException('Registration not found');
        if (token && reg.editToken !== token)
            throw new common_1.ForbiddenException('Invalid token');
        return this.mapToDto(reg);
    }
    async update(id, token, dto) {
        const reg = await this.prisma.registration.findUnique({ where: { id } });
        if (!reg)
            throw new common_1.NotFoundException();
        if (reg.editToken !== token)
            throw new common_1.ForbiddenException('Invalid token');
        if (['CONFIRMED', 'CANCELLED'].includes(reg.status)) {
            throw new common_1.BadRequestException('Cannot edit registration in current status');
        }
        const updated = await this.prisma.registration.update({
            where: { id },
            data: {
                locale: dto.locale ?? reg.locale,
                contact: dto.contact ? dto.contact : reg.contact,
                dietaryNotes: dto.dietaryNotes ?? reg.dietaryNotes ?? undefined,
            },
            include: { participants: true, payments: true },
        });
        return this.mapToDto(updated);
    }
    async getIcs(id) {
        const reg = await this.prisma.registration.findUnique({
            where: { id },
            include: { instance: true },
        });
        if (!reg)
            throw new common_1.NotFoundException();
        const title = reg.instance.title[reg.locale]
            ?? reg.instance.title['pl']
            ?? 'ICPE Event';
        return (0, shared_1.buildIcs)({
            uid: `reg-${id}@icpemission.pl`,
            title,
            startsAt: reg.instance.startsAt,
            endsAt: reg.instance.endsAt,
            location: reg.instance.location ?? undefined,
            details: `Zgłoszenie REG-${id}`,
        });
    }
    async getGoogleCalendarUrl(id) {
        const reg = await this.prisma.registration.findUnique({
            where: { id },
            include: { instance: true },
        });
        if (!reg)
            throw new common_1.NotFoundException();
        const title = reg.instance.title[reg.locale]
            ?? reg.instance.title['pl']
            ?? 'ICPE Event';
        return (0, shared_1.googleCalendarUrl)({
            uid: `reg-${id}@icpemission.pl`,
            title,
            startsAt: reg.instance.startsAt,
            endsAt: reg.instance.endsAt,
            location: reg.instance.location ?? undefined,
            details: `Zgłoszenie REG-${id}`,
        });
    }
    async listForInstance(instanceId, status, q) {
        const statusSet = status ? (0, personal_os_mapper_1.contractStatusFilter)(status) : undefined;
        const regs = await this.prisma.registration.findMany({
            where: {
                instanceId,
                ...(statusSet ? { status: { in: statusSet } } : {}),
                ...(q ? { OR: [
                        { contact: { path: ['firstName'], string_contains: q } },
                        { contact: { path: ['lastName'], string_contains: q } },
                        { contact: { path: ['email'], string_contains: q } },
                    ] } : {}),
            },
            include: {
                participants: true,
                payments: { orderBy: { createdAt: 'desc' }, take: 1 },
                assignments: { include: { room: true }, take: 1 },
            },
            orderBy: { createdAt: 'desc' },
        });
        return regs.map((r) => this.toContractRegistration(r));
    }
    toContractRegistration(reg) {
        const c = (reg.contact ?? {});
        return {
            id: reg.id,
            instanceId: reg.instanceId,
            status: (0, personal_os_mapper_1.mapRegStatus)(reg.status),
            locale: reg.locale,
            contact: {
                firstName: c.firstName ?? '',
                lastName: c.lastName ?? '',
                email: c.email,
                phone: c.phone,
            },
            participants: reg.participants.map((p) => ({
                type: (0, personal_os_mapper_1.mapParticipantType)(p.type),
                firstName: p.firstName,
                lastName: p.lastName,
                age: p.age ?? undefined,
                gender: (0, personal_os_mapper_1.mapGender)(p.gender),
                dietary: p.dietary ?? undefined,
            })),
            preferredRoomType: reg.preferredRoomTypeId ?? undefined,
            assignedRoom: reg.assignments?.[0]?.room?.label ?? undefined,
            totalPrice: (0, personal_os_mapper_1.num)(reg.totalPrice),
            currency: reg.currency || 'EUR',
            paymentMethod: (0, personal_os_mapper_1.mapPaymentMethod)(reg.paymentMethod),
            paymentStatus: (0, personal_os_mapper_1.mapPaymentStatus)(reg.status, reg.payments?.[0]?.status),
            createdAt: (0, personal_os_mapper_1.iso)(reg.createdAt),
        };
    }
    async updateStatus(id, status) {
        return this.prisma.registration.update({
            where: { id },
            data: { status: status },
        });
    }
    async markPaid(id) {
        await this.prisma.registration.update({ where: { id }, data: { status: 'CONFIRMED' } });
        return this.prisma.payment.create({
            data: {
                registrationId: id,
                provider: 'manual',
                method: 'BANK_TRANSFER',
                amount: (await this.prisma.registration.findUniqueOrThrow({ where: { id } })).totalPrice,
                currency: 'PLN',
                status: 'PAID',
            },
        });
    }
    mapToDto(reg) {
        const paymentStatus = reg.payments?.[0]?.status ?? (reg.status === 'AWAITING_TRANSFER' ? 'AWAITING_TRANSFER' : 'PENDING');
        return {
            id: reg.id,
            instanceId: reg.instanceId,
            status: reg.status,
            locale: reg.locale,
            contact: reg.contact,
            participants: reg.participants.map(p => ({
                id: p.id,
                type: p.type === 'ADULT' ? 'adult' : 'child',
                firstName: p.firstName,
                lastName: p.lastName,
                age: p.age ?? 0,
                gender: p.gender === 'FEMALE' ? 'F' : p.gender === 'MALE' ? 'M' : 'other',
                dietary: p.dietary ?? undefined,
            })),
            preferredRoomId: reg.preferredRoomTypeId ?? undefined,
            dietaryNotes: reg.dietaryNotes ?? undefined,
            totalPrice: parseFloat(reg.totalPrice.toString()),
            currency: reg.currency,
            paymentMethod: reg.paymentMethod ?? undefined,
            paymentStatus,
            editToken: reg.editToken,
            createdAt: reg.createdAt.toISOString(),
        };
    }
};
exports.RegistrationsService = RegistrationsService;
exports.RegistrationsService = RegistrationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        pricing_service_1.PricingService,
        notifications_service_1.NotificationsService])
], RegistrationsService);
//# sourceMappingURL=registrations.service.js.map