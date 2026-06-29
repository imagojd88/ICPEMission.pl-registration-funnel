import { RegistrationsService } from './registrations.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import type { Response } from 'express';
export declare class RegistrationsController {
    private readonly regs;
    constructor(regs: RegistrationsService);
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
        summary: import("../_shared").PriceResult;
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
    findOne(id: string, token?: string): Promise<{
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
    getIcs(id: string, res: Response): Promise<void>;
    getGoogleCalendar(id: string, res: Response): Promise<void>;
    listForInstance(id: string, status?: string, q?: string): Promise<any>;
}
