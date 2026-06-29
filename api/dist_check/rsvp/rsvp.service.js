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
exports.RsvpService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const shared_1 = require("../shared");
let RsvpService = class RsvpService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    title(t, locale) {
        if (typeof t === 'string')
            return t;
        const o = (t ?? {});
        return o[locale] ?? o.pl ?? o.en ?? o.it ?? 'Event';
    }
    calendar(instance, locale) {
        const title = this.title(instance.title, locale);
        return {
            google: (0, shared_1.googleCalendarUrl)({
                uid: `rsvp-${instance.id}@icpe`,
                title,
                startsAt: instance.startsAt,
                endsAt: instance.endsAt,
                location: instance.location ?? undefined,
                details: 'ICPE Mission',
            }),
        };
    }
    async create(dto) {
        const instance = (await this.prisma.eventInstance.findUnique({
            where: { id: dto.instanceId },
            include: { series: true },
        }));
        if (!instance)
            throw new common_1.NotFoundException('Instance not found');
        if (instance.series.type !== 'STANDALONE') {
            throw new common_1.ForbiddenException('RSVP dostępne tylko dla eventów typu STANDALONE');
        }
        const locale = dto.locale ?? 'pl';
        let rsvp = null;
        if (dto.email) {
            const existing = (await this.prisma.eventRsvp.findFirst({
                where: { instanceId: dto.instanceId, email: dto.email },
            }));
            if (existing) {
                rsvp = (await this.prisma.eventRsvp.update({
                    where: { id: existing.id },
                    data: { name: dto.name, response: dto.response, locale },
                }));
            }
        }
        if (!rsvp) {
            rsvp = (await this.prisma.eventRsvp.create({
                data: { instanceId: dto.instanceId, name: dto.name, email: dto.email, response: dto.response, locale },
            }));
        }
        return {
            id: rsvp.id,
            response: rsvp.response,
            editToken: rsvp.editToken,
            calendar: this.calendar(instance, locale),
        };
    }
    async loadWithToken(id, token) {
        const rsvp = (await this.prisma.eventRsvp.findUnique({ where: { id } }));
        if (!rsvp)
            throw new common_1.NotFoundException('RSVP not found');
        if (token && rsvp.editToken !== token)
            throw new common_1.ForbiddenException('Invalid token');
        return rsvp;
    }
    async findById(id, token) {
        const rsvp = await this.loadWithToken(id, token);
        return {
            id: rsvp.id,
            instanceId: rsvp.instanceId,
            name: rsvp.name,
            email: rsvp.email ?? undefined,
            response: rsvp.response,
            locale: rsvp.locale,
        };
    }
    async update(id, token, dto) {
        await this.loadWithToken(id, token);
        const updated = (await this.prisma.eventRsvp.update({
            where: { id },
            data: { ...(dto.name ? { name: dto.name } : {}), ...(dto.response ? { response: dto.response } : {}) },
        }));
        return { id: updated.id, response: updated.response };
    }
    async getGoogleUrl(id) {
        const rsvp = await this.loadWithToken(id);
        const instance = (await this.prisma.eventInstance.findUniqueOrThrow({ where: { id: rsvp.instanceId } }));
        return this.calendar(instance, rsvp.locale).google;
    }
    async getIcs(id) {
        const rsvp = await this.loadWithToken(id);
        const instance = (await this.prisma.eventInstance.findUniqueOrThrow({ where: { id: rsvp.instanceId } }));
        return (0, shared_1.buildIcs)({
            uid: `rsvp-${rsvp.id}@icpe`,
            title: this.title(instance.title, rsvp.locale),
            startsAt: instance.startsAt,
            endsAt: instance.endsAt,
            location: instance.location ?? undefined,
            details: 'ICPE Mission',
        });
    }
    async listForInstance(instanceId) {
        const items = (await this.prisma.eventRsvp.findMany({
            where: { instanceId },
            orderBy: { createdAt: 'desc' },
        }));
        const yes = items.filter((r) => r.response === 'YES').length;
        return {
            total: items.length,
            yes,
            no: items.length - yes,
            items: items.map((r) => ({
                id: r.id,
                name: r.name,
                email: r.email ?? undefined,
                response: r.response,
                locale: r.locale,
                createdAt: r.createdAt.toISOString(),
            })),
        };
    }
};
exports.RsvpService = RsvpService;
exports.RsvpService = RsvpService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RsvpService);
//# sourceMappingURL=rsvp.service.js.map