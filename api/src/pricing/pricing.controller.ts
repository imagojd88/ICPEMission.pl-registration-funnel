import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested, ArrayNotEmpty, IsIn, IsNumber, Min, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { PricingService } from './pricing.service';
import { PriceInput } from '../shared';

class PricedParticipantDto {
  @IsIn(['adult', 'child']) type!: 'adult' | 'child';
  @IsNumber() @Min(0) age!: number;
}

class RoomBookingDto {
  @IsString() roomId!: string;
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => PricedParticipantDto) participants!: PricedParticipantDto[];
}

class PriceOptionsDto {
  @IsOptional() transport?: boolean;
  @IsOptional() bedding?: boolean;
}

/** DTO dla POST /pricing/quote — podgląd ceny (niewiążący). */
class PriceQuoteDto implements PriceInput {
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => RoomBookingDto) rooms!: RoomBookingDto[];
  @IsOptional() @ValidateNested() @Type(() => PriceOptionsDto) options?: PriceOptionsDto;
  @IsOptional() @IsString() discountCode?: string;
  @IsOptional() @IsString() instanceId?: string;
}

@ApiTags('pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Post('quote')
  @ApiOperation({ summary: 'Price preview (non-binding). Body: { instanceId?, rooms, options?, discountCode? }' })
  quote(@Body() dto: PriceQuoteDto) {
    const { instanceId, ...input } = dto;
    return this.pricing.quote(input, instanceId);
  }
}
