import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { PriceInput } from '../shared';

class PriceQuoteDto implements PriceInput {
  participants!: Array<{ type: 'adult' | 'child'; age: number }>;
  roomId!: string;
  options?: { transport?: boolean; bedding?: boolean };
  discountCode?: string;
  instanceId?: string;
}

@ApiTags('pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Post('quote')
  @ApiOperation({ summary: 'Price preview (non-binding)' })
  quote(@Body() dto: PriceQuoteDto) {
    const { instanceId, ...input } = dto;
    return this.pricing.quote(input, instanceId);
  }
}
