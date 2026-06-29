import { PrismaService } from '../prisma/prisma.service';
export declare class EventsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private instanceAggregates;
    private toContractInstance;
    findBySlug(slug: string): Promise<{
        page: any;
        instance: any;
    }>;
    getSlugConfig(slug: string, locale: string): Promise<{
        instanceId: any;
        locale: string;
        type: string;
        isStandalone: boolean;
        title: any;
        description: any;
        startsAt: any;
        endsAt: any;
        location: any;
        nights: any;
        capacity: any;
        paymentMethods: any;
        pricingConfig: any;
        roomTypes: {
            id: string;
            name: unknown;
            capacity: number;
            pricingModel: string;
            price: number;
            quantity: number;
        }[];
        enabledFields: any;
        customFields: any;
        locales: any;
        theme: any;
    }>;
    getInstance(id: string): Promise<any>;
    getInstanceContract(id: string): Promise<{
        roomTypes: any;
        roomsOccupancy: {
            total: any;
            assigned: any;
            free: number;
        };
        id: string;
        seriesId: string;
        title: import("../admin/personal-os.mapper").Localized;
        startsAt: string;
        endsAt: string;
        location: string;
        status: import("../admin/personal-os.mapper").ContractInstanceStatus;
        capacity: number;
        registeredCount: any;
        confirmedCount: any;
        revenue: any;
        currency: string;
    }>;
    listInstances(status?: string): Promise<any[]>;
    createSeries(dto: {
        type: string;
        title: Record<string, string>;
        description?: Record<string, string>;
        startsAt: string;
        endsAt: string;
        location?: string;
        nights: number;
        capacity?: number;
        paymentMethods: string[];
        pricingConfig: unknown;
        registrationOpensAt: string;
        registrationClosesAt: string;
        recurrence?: string;
    }): Promise<any>;
    cloneInstance(id: string): Promise<any>;
    configureSeriesPage(seriesId: string, dto: {
        slug: string;
        theme?: unknown;
        enabledFields: unknown;
        customFields?: unknown;
        locales: string[];
        isEvergreen: boolean;
    }): Promise<any>;
    publishSeries(seriesId: string): Promise<any>;
    updatePricing(instanceId: string, pricingConfig: unknown): Promise<any>;
}
