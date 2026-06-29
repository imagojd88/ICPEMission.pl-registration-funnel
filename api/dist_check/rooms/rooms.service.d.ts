import { PrismaService } from '../prisma/prisma.service';
export declare class RoomsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    addRoomType(instanceId: string, dto: {
        name: Record<string, string>;
        capacity: number;
        pricingModel: string;
        price: number;
        genderPolicy?: string;
        quantity: number;
    }): Promise<any>;
    generateRooms(instanceId: string): Promise<any[]>;
    assignRoom(registrationId: string, roomId: string, adminId: string, participantId?: string): Promise<any>;
    getRoomTypes(instanceId: string): Promise<any>;
}
