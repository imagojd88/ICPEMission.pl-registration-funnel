import { PrismaService } from '../prisma/prisma.service';
import { PriceInput } from '../shared';
export declare class PricingService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    quote(input: PriceInput, instanceId?: string): Promise<import("../shared").PriceResult>;
}
