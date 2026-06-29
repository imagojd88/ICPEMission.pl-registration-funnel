import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async addRoomType(instanceId: string, dto: {
    name: Record<string, string>; capacity: number;
    pricingModel: string; price: number; genderPolicy?: string; quantity: number;
  }) {
    return this.prisma.roomType.create({
      data: {
        instanceId,
        name: dto.name,
        capacity: dto.capacity,
        pricingModel: dto.pricingModel as 'PER_PERSON' | 'PER_ROOM' | 'PER_PERSON_PER_NIGHT' | 'SINGLE_SUPPLEMENT',
        price: dto.price,
        genderPolicy: (dto.genderPolicy ?? 'ANY') as 'ANY' | 'MALE' | 'FEMALE' | 'FAMILY',
        quantity: dto.quantity,
      },
    });
  }

  async generateRooms(instanceId: string) {
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

  async assignRoom(registrationId: string, roomId: string, adminId: string, participantId?: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    return this.prisma.roomAssignment.create({
      data: { roomId, registrationId, participantId, assignedBy: adminId },
    });
  }

  async getRoomTypes(instanceId: string) {
    return this.prisma.roomType.findMany({ where: { instanceId }, include: { rooms: true } });
  }
}
