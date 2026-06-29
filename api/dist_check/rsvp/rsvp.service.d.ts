import { PrismaService } from '../prisma/prisma.service';
type Response = 'YES' | 'NO';
export declare class RsvpService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private title;
    private calendar;
    create(dto: {
        instanceId: string;
        name: string;
        email?: string;
        response: Response;
        locale?: string;
    }): Promise<{
        id: string;
        response: string;
        editToken: string;
        calendar: {
            google: string;
        };
    }>;
    private loadWithToken;
    findById(id: string, token?: string): Promise<{
        id: string;
        instanceId: string;
        name: string;
        email: string | undefined;
        response: string;
        locale: string;
    }>;
    update(id: string, token: string, dto: {
        name?: string;
        response?: Response;
    }): Promise<{
        id: string;
        response: string;
    }>;
    getGoogleUrl(id: string): Promise<string>;
    getIcs(id: string): Promise<string>;
    listForInstance(instanceId: string): Promise<{
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
export {};
