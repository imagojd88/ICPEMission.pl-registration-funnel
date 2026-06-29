import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computePrice, PriceInput, PricingConfig } from '../shared';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(input: PriceInput, instanceId?: string) {
    let config: PricingConfig | undefined;
    if (instanceId) {
      const inst = await this.prisma.eventInstance.findUnique({ where: { id: instanceId } });
      if (!inst) throw new NotFoundException('Instance not found');
      config = inst.pricingConfig as unknown as PricingConfig;
    }
    return computePrice(input, config);
  }
}
