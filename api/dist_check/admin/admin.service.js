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
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const rooms_service_1 = require("../rooms/rooms.service");
const personal_os_mapper_1 = require("./personal-os.mapper");
let AdminService = class AdminService {
    constructor(prisma, rooms) {
        this.prisma = prisma;
        this.rooms = rooms;
    }
    async getSummary() {
        const [openInstances, todayRegistrations, confirmedRegs, capacityData] = await Promise.all([
            this.prisma.eventInstance.count({ where: { status: 'OPEN' } }),
            this.prisma.registration.count({
                where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
            }),
            this.prisma.registration.findMany({
                where: { status: 'CONFIRMED' },
                select: { totalPrice: true, instanceId: true },
            }),
            this.prisma.eventInstance.findMany({
                where: { status: 'OPEN' },
                select: { id: true, capacity: true, _count: { select: { registrations: true } } },
            }),
        ]);
        const revenue = confirmedRegs.reduce((sum, r) => sum + parseFloat(r.totalPrice.toString()), 0);
        let occupancyPct = 0;
        const withCapacity = capacityData.filter((i) => i.capacity !== null);
        if (withCapacity.length > 0) {
            const totalCap = withCapacity.reduce((s, i) => s + (i.capacity ?? 0), 0);
            const totalReg = withCapacity.reduce((s, i) => s + i._count.registrations, 0);
            occupancyPct = totalCap > 0 ? Math.round((totalReg / totalCap) * 100) : 0;
        }
        return {
            openInstances,
            registrationsToday: todayRegistrations,
            revenue,
            currency: 'PLN',
            occupancyPct,
        };
    }
    async assignRoom(registrationId, roomId, adminId, participantId) {
        await this.rooms.assignRoom(registrationId, roomId, adminId ?? 'service-token', participantId);
        return this.loadContractRegistration(registrationId);
    }
    async updateRegistrationStatus(id, status) {
        await this.prisma.registration.update({
            where: { id },
            data: {
                status: (0, personal_os_mapper_1.contractStatusToInternal)(status),
            },
        });
        return this.loadContractRegistration(id);
    }
    async markPaid(registrationId) {
        const reg = await this.prisma.registration.findUnique({
            where: { id: registrationId },
            include: { payments: { where: { status: 'PAID' }, take: 1 } },
        });
        if (!reg)
            throw new common_1.NotFoundException('Registration not found');
        if (reg.payments.length === 0) {
            await this.prisma.payment.create({
                data: {
                    registrationId,
                    provider: 'manual',
                    method: 'BANK_TRANSFER',
                    amount: reg.totalPrice,
                    currency: reg.currency,
                    status: 'PAID',
                },
            });
        }
        if (reg.status !== 'CONFIRMED') {
            await this.prisma.registration.update({
                where: { id: registrationId },
                data: { status: 'CONFIRMED' },
            });
        }
        return this.loadContractRegistration(registrationId);
    }
    async loadContractRegistration(id) {
        const reg = await this.prisma.registration.findUnique({
            where: { id },
            include: {
                participants: true,
                payments: { orderBy: { createdAt: 'desc' }, take: 1 },
                assignments: { include: { room: true }, take: 1 },
            },
        });
        if (!reg)
            throw new common_1.NotFoundException('Registration not found');
        const c = (reg.contact ?? {});
        return {
            ok: true,
            id: reg.id,
            instanceId: reg.instanceId,
            status: (0, personal_os_mapper_1.mapRegStatus)(reg.status),
            locale: reg.locale,
            contact: { firstName: c.firstName ?? '', lastName: c.lastName ?? '', email: c.email, phone: c.phone },
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
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        rooms_service_1.RoomsService])
], AdminService);
//# sourceMappingURL=admin.service.js.map