import { PricingService } from './pricing.service';
import { PriceInput } from '../shared';
declare class PriceQuoteDto implements PriceInput {
    participants: Array<{
        type: 'adult' | 'child';
        age: number;
    }>;
    roomId: string;
    options?: {
        transport?: boolean;
        bedding?: boolean;
    };
    discountCode?: string;
    instanceId?: string;
}
export declare class PricingController {
    private readonly pricing;
    constructor(pricing: PricingService);
    quote(dto: PriceQuoteDto): Promise<import("../shared").PriceResult>;
}
export {};
