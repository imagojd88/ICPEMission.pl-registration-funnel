import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computePrice, pricingAt, warsawDate, PriceInput, PricingConfig } from '../shared';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Wycena wg cennika eventu. `at` = dzień, z którego bierzemy poziom cen (early bird / kolejne):
   * dla nowego zgłoszenia dziś, dla istniejącego — data zapisu (cena z dnia rejestracji nie rośnie).
   */
  async quote(input: PriceInput, instanceId?: string, at?: Date | string) {
    let config: PricingConfig | undefined;
    if (instanceId) {
      const inst = await this.prisma.eventInstance.findUnique({ where: { id: instanceId } });
      if (!inst) throw new NotFoundException('Instance not found');
      config = inst.pricingConfig as unknown as PricingConfig;
    }
    return computePrice(input, config ? pricingAt(config, warsawDate(at ?? new Date())) : config);
  }
}
