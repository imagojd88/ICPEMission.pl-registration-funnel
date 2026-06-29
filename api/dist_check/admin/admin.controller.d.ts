import { AdminService } from './admin.service';
export declare class AdminController {
    private readonly admin;
    constructor(admin: AdminService);
    getSummary(): Promise<import("../_shared").AdminSummaryDto>;
    updateStatus(id: string, dto: {
        status: string;
    }): Promise<{
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
    markPaid(id: string): Promise<{
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
    assignRoom(id: string, dto: {
        roomId: string;
        participantId?: string;
    }): Promise<{
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
}
