import { RsvpService } from './rsvp.service';
import type { Response } from 'express';
export declare class RsvpController {
    private readonly rsvp;
    constructor(rsvp: RsvpService);
    create(dto: {
        instanceId: string;
        name: string;
        email?: string;
        response: 'YES' | 'NO';
        locale?: string;
    }): Promise<{
        id: string;
        response: string;
        editToken: string;
        calendar: {
            google: string;
        };
    }>;
    findOne(id: string, token?: string): Promise<{
        id: string;
        instanceId: string;
        name: string;
        email: string | undefined;
        response: string;
        locale: string;
    }>;
    update(id: string, token: string, dto: {
        name?: string;
        response?: 'YES' | 'NO';
    }): Promise<{
        id: string;
        response: string;
    }>;
    getIcs(id: string, res: Response): Promise<void>;
    google(id: string, res: Response): Promise<void>;
    list(id: string): Promise<{
        total: number;
        yes: number;
        no: number;
        items: {
            id: string;
            name: string;
            email: string | undefined;
            response: string;
            locale: string;
            createdAt: string;
        }[];
    }>;
}
