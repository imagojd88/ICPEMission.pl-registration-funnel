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
exports.EventsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const personal_os_mapper_1 = require("../admin/personal-os.mapper");
let EventsService = class EventsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async instanceAggregates(instanceId) {
        const regs = await this.prisma.registration.findMany({
            where: { instanceId },
            select: {
                status: true,
                payments: { where: { status: 'PAID' }, select: { amount: true } },
            },
        });
        const registeredCount = regs.length;
        const confirmedCount = regs.filter((r) => r.status === 'CONFIRMED').length;
        const revenue = regs.reduce((s, r) => s + r.payments.reduce((ps, p) => ps + (0, personal_os_mapper_1.num)(p.amount), 0), 0);
        return { registeredCount, confirmedCount, revenue };
    }
    async toContractInstance(inst) {
        const agg = await this.instanceAggregates(inst.id);
        return {
            id: inst.id,
            seriesId: inst.seriesId,
            title: (0, personal_os_mapper_1.toLocalized)(inst.title),
            startsAt: (0, personal_os_mapper_1.iso)(inst.startsAt),
            endsAt: (0, personal_os_mapper_1.iso)(inst.endsAt),
            location: inst.location ?? '',
            status: (0, personal_os_mapper_1.mapInstanceStatus)(inst.status),
            capacity: inst.capacity ?? 0,
            registeredCount: agg.registeredCount,
            confirmedCount: agg.confirmedCount,
            revenue: agg.revenue,
            currency: inst.currency || 'EUR',
        };
    }
    async findBySlug(slug) {
        const page = await this.prisma.registrationPage.findUnique({
            where: { slug },
            include: {
                series: {
                    include: {
                        instances: {
                            where: { status: 'OPEN' },
                            orderBy: { startsAt: 'asc' },
                            take: 1,
                            include: { roomTypes: true },
                        },
                    },
                },
            },
        });
        if (!page)
            throw new common_1.NotFoundException('Page not found');
        const instance = page.series.instances[0];
        if (!instance)
            throw new common_1.NotFoundException('No open instance');
        return { page, instance };
    }
    async getSlugConfig(slug, locale) {
        const { page, instance } = await this.findBySlug(slug);
        const seriesType = page.series.type ?? 'ONE_TIME';
        return {
            instanceId: instance.id,
            locale,
            type: seriesType,
            isStandalone: seriesType === 'STANDALONE',
            title: instance.title,
            description: instance.description,
            startsAt: instance.startsAt,
            endsAt: instance.endsAt,
            location: instance.location,
            nights: instance.nights,
            capacity: instance.capacity,
            paymentMethods: instance.paymentMethods,
            pricingConfig: instance.pricingConfig,
            roomTypes: instance.roomTypes.map((rt) => ({
                id: rt.id,
                name: rt.name,
                capacity: rt.capacity,
                pricingModel: rt.pricingModel,
                price: Number(rt.price),
                quantity: rt.quantity,
            })),
            enabledFields: page.enabledFields,
            customFields: page.customFields,
            locales: page.locales,
            theme: page.theme,
        };
    }
    async getInstance(id) {
        const inst = await this.prisma.eventInstance.findUnique({
            where: { id },
            include: { roomTypes: true, series: { include: { page: true } } },
        });
        if (!inst)
            throw new common_1.NotFoundException('Instance not found');
        return inst;
    }
    async getInstanceContract(id) {
        const inst = await this.prisma.eventInstance.findUnique({
            where: { id },
            include: { roomTypes: true },
        });
        if (!inst)
            throw new common_1.NotFoundException('Instance not found');
        const rooms = await this.prisma.room.findMany({
            where: { instanceId: id },
            include: { _count: { select: { assignments: true } } },
        });
        const total = rooms.reduce((s, r) => s + r.capacity, 0);
        const assigned = rooms.reduce((s, r) => s + r._count.assignments, 0);
        const base = await this.toContractInstance(inst);
        return {
            ...base,
            roomTypes: inst.roomTypes.map((rt) => ({
                id: rt.id,
                name: (0, personal_os_mapper_1.localizedName)(rt.name),
                capacity: rt.capacity,
                price: (0, personal_os_mapper_1.num)(rt.price),
            })),
            roomsOccupancy: { total, assigned, free: Math.max(0, total - assigned) },
        };
    }
    async listInstances(status) {
        let where;
        if (status && status.toUpperCase() !== 'ALL') {
            const s = status.toUpperCase();
            if (s === 'OPEN')
                where = { status: 'OPEN' };
            else if (s === 'CLOSED')
                where = { status: { in: ['CLOSED', 'ARCHIVED', 'DRAFT'] } };
        }
        const instances = await this.prisma.eventInstance.findMany({
            where: where,
            orderBy: { startsAt: 'desc' },
        });
        return Promise.all(instances.map((i) => this.toContractInstance(i)));
    }
    async createSeries(dto) {
        return this.prisma.eventSeries.create({
            data: {
                type: dto.type,
                recurrence: dto.recurrence,
                instances: {
                    create: {
                        title: dto.title,
                        description: dto.description ?? null,
                        startsAt: new Date(dto.startsAt),
                        endsAt: new Date(dto.endsAt),
                        location: dto.location,
                        nights: dto.nights,
                        capacity: dto.capacity,
                        paymentMethods: dto.paymentMethods,
                        pricingConfig: dto.pricingConfig,
                        registrationOpensAt: new Date(dto.registrationOpensAt),
                        registrationClosesAt: new Date(dto.registrationClosesAt),
                        status: 'DRAFT',
                    },
                },
            },
            include: { instances: true },
        });
    }
    async cloneInstance(id) {
        const src = await this.getInstance(id);
        return this.prisma.eventInstance.create({
            data: {
                seriesId: src.seriesId,
                title: src.title,
                description: src.description ?? undefined,
                startsAt: src.startsAt,
                endsAt: src.endsAt,
                location: src.location ?? undefined,
                nights: src.nights,
                capacity: src.capacity ?? undefined,
                paymentMethods: src.paymentMethods,
                pricingConfig: src.pricingConfig,
                registrationOpensAt: src.registrationOpensAt,
                registrationClosesAt: src.registrationClosesAt,
                status: 'DRAFT',
            },
        });
    }
    async configureSeriesPage(seriesId, dto) {
        return this.prisma.registrationPage.upsert({
            where: { seriesId },
            create: {
                seriesId,
                slug: dto.slug,
                isEvergreen: dto.isEvergreen,
                theme: dto.theme ?? undefined,
                enabledFields: dto.enabledFields,
                customFields: dto.customFields ?? undefined,
                locales: dto.locales,
                published: false,
            },
            update: {
                slug: dto.slug,
                theme: dto.theme ?? undefined,
                enabledFields: dto.enabledFields,
                customFields: dto.customFields ?? undefined,
                locales: dto.locales,
            },
        });
    }
    async publishSeries(seriesId) {
        return this.prisma.registrationPage.update({
            where: { seriesId },
            data: { published: true },
        });
    }
    async updatePricing(instanceId, pricingConfig) {
        return this.prisma.eventInstance.update({
            where: { id: instanceId },
            data: { pricingConfig: pricingConfig },
        });
    }
};
exports.EventsService = EventsService;
exports.EventsService = EventsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], EventsService);
//# sourceMappingURL=events.service.js.map