import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { AdminSummaryDto } from '../shared';
export declare class AdminService {
    private readonly prisma;
    private readonly rooms;
    constructor(prisma: PrismaService, rooms: RoomsService);
    getSummary(): Promise<AdminSummaryDto>;
    assignRoom(registrationId: string, roomId: string, adminId?: string, participantId?: string): Promise<{
        ok: boolean;
        id: any;
        instanceId: any;
        status: import("./personal-os.mapper").ContractRegStatus;
        locale: any;
        contact: {
            firstName: string;
            lastName: string;
            email: string | undefined;
            phone: string | undefined;
        };
        participants: any;
        preferredRoomType: any;
        assignedRoom: any;
        totalPrice: number;
        currency: any;
        paymentMethod: string | undefined;
        paymentStatus: import("./personal-os.mapper").ContractPaymentStatus;
        createdAt: string;
    }>;
    updateRegistrationStatus(id: string, status: string): Promise<{
        ok: boolean;
        id: any;
        instanceId: any;
        status: import("./personal-os.mapper").ContractRegStatus;
        locale: any;
        contact: {
            firstName: string;
            lastName: string;
            email: string | undefined;
            phone: string | undefined;
        };
        participants: any;
        preferredRoomType: any;
        assignedRoom: any;
        totalPrice: number;
        currency: any;
        paymentMethod: string | undefined;
        paymentStatus: import("./personal-os.mapper").ContractPaymentStatus;
        createdAt: string;
    }>;
    markPaid(registrationId: string): Promise<{
        ok: boolean;
        id: any;
        instanceId: any;
        status: import("./personal-os.mapper").ContractRegStatus;
        locale: any;
        contact: {
            firstName: string;
            lastName: string;
            email: string | undefined;
            phone: string | undefined;
        };
        participants: any;
        preferredRoomType: any;
        assignedRoom: any;
        totalPrice: number;
        currency: any;
        paymentMethod: string | undefined;
        paymentStatus: import("./personal-os.mapper").ContractPaymentStatus;
        createdAt: string;
    }>;
    private loadContractRegistration;
}
