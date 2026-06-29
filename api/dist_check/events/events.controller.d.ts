import { EventsService } from './events.service';
export declare class EventsController {
    private readonly events;
    constructor(events: EventsService);
    getBySlug(slug: string): Promise<{
        page: any;
        instance: any;
    }>;
    getConfig(slug: string, locale?: string): Promise<{
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
    createSeries(dto: Record<string, unknown>): Promise<any>;
    configPage(id: string, dto: Record<string, unknown>): Promise<any>;
    publish(id: string): Promise<any>;
    listInstances(status?: string): Promise<any[]>;
    getInstance(id: string): Promise<{
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
    clone(id: string): Promise<any>;
    updatePricing(id: string, dto: Record<string, unknown>): Promise<any>;
}
