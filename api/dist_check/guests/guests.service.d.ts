import { PrismaService } from '../prisma/prisma.service';
export declare class GuestsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    register(dto: {
        email: string;
        password?: string;
        firstName: string;
        lastName: string;
        phone?: string;
        locale?: string;
    }): Promise<any>;
    getMyRegistrations(guestId: string): Promise<any>;
    updateProfile(guestId: string, dto: {
        firstName?: string;
        lastName?: string;
        phone?: string;
        locale?: string;
    }): Promise<any>;
}
