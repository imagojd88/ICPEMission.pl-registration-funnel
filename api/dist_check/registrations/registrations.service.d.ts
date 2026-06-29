import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';
export declare class RegistrationsService {
    private readonly prisma;
    private readonly pricing;
    private readonly notifications;
    constructor(prisma: PrismaService, pricing: PricingService, notifications: NotificationsService);
    create(dto: CreateRegistrationDto): Promise<{
        registration: {
            id: string;
            instanceId: string;
            status: string;
            locale: string;
            contact: unknown;
            participants: {
                id: string;
                type: string;
                firstName: string;
                lastName: string;
                age: number;
                gender: string;
                dietary: string | undefined;
            }[];
            preferredRoomId: string | undefined;
            dietaryNotes: string | undefined;
            totalPrice: number;
            currency: string;
            paymentMethod: string | undefined;
            paymentStatus: string;
            editToken: string;
            createdAt: string;
        };
        summary: import("../shared").PriceResult;
        payment: {
            method: string;
            transferTitle: string;
            registrationId?: undefined;
        } | {
            method: string;
            registrationId: any;
            transferTitle?: undefined;
        };
    }>;
    findById(id: string, token?: string): Promise<{
        id: string;
        instanceId: string;
        status: string;
        locale: string;
        contact: unknown;
        participants: {
            id: string;
            type: string;
            firstName: string;
            lastName: string;
            age: number;
            gender: string;
            dietary: string | undefined;
        }[];
        preferredRoomId: string | undefined;
        dietaryNotes: string | undefined;
        totalPrice: number;
        currency: string;
        paymentMethod: string | undefined;
        paymentStatus: string;
        editToken: string;
        createdAt: string;
    }>;
    update(id: string, token: string, dto: Partial<CreateRegistrationDto>): Promise<{
        id: string;
        instanceId: string;
        status: string;
        locale: string;
        contact: unknown;
        participants: {
            id: string;
            type: string;
            firstName: string;
            lastName: string;
            age: number;
            gender: string;
            dietary: string | undefined;
        }[];
        preferredRoomId: string | undefined;
        dietaryNotes: string | undefined;
        totalPrice: number;
        currency: string;
        paymentMethod: string | undefined;
        paymentStatus: string;
        editToken: string;
        createdAt: string;
    }>;
    getIcs(id: string): Promise<string>;
    getGoogleCalendarUrl(id: string): Promise<string>;
    listForInstance(instanceId: string, status?: string, q?: string): Promise<any>;
    private toContractRegistration;
    updateStatus(id: string, status: string): Promise<any>;
    markPaid(id: string): Promise<any>;
    private mapToDto;
}
