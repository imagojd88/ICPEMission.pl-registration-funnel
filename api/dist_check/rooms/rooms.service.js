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
exports.RoomsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let RoomsService = class RoomsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async addRoomType(instanceId, dto) {
        return this.prisma.roomType.create({
            data: {
                instanceId,
                name: dto.name,
                capacity: dto.capacity,
                pricingModel: dto.pricingModel,
                price: dto.price,
                genderPolicy: (dto.genderPolicy ?? 'ANY'),
                quantity: dto.quantity,
            },
        });
    }
    async generateRooms(instanceId) {
        const roomTypes = await this.prisma.roomType.findMany({ where: { instanceId } });
        const created = [];
        for (const rt of roomTypes) {
            const existing = await this.prisma.room.count({ where: { roomTypeId: rt.id } });
            const toCreate = rt.quantity - existing;
            for (let i = existing + 1; i <= existing + toCreate; i++) {
                const room = await this.prisma.room.create({
                    data: {
                        instanceId,
                        roomTypeId: rt.id,
                        label: `${i}`,
                        capacity: rt.capacity,
                    },
                });
                created.push(room);
            }
        }
        return created;
    }
    async assignRoom(registrationId, roomId, adminId, participantId) {
        const room = await this.prisma.room.findUnique({ where: { id: roomId } });
        if (!room)
            throw new common_1.NotFoundException('Room not found');
        return this.prisma.roomAssignment.create({
            data: { roomId, registrationId, participantId, assignedBy: adminId },
        });
    }
    async getRoomTypes(instanceId) {
        return this.prisma.roomType.findMany({ where: { instanceId }, include: { rooms: true } });
    }
};
exports.RoomsService = RoomsService;
exports.RoomsService = RoomsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RoomsService);
//# sourceMappingURL=rooms.service.js.map