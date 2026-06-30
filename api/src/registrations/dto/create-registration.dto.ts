import { IsString, IsArray, IsOptional, IsBoolean, IsIn, ValidateNested, IsEmail, IsNumber, Min, Max, ArrayNotEmpty, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ContactDto {
  @IsString() @ApiProperty() firstName!: string;
  @IsString() @ApiProperty() lastName!: string;
  @IsEmail() @ApiProperty() email!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
}

export class ParticipantInputDto {
  @IsIn(['adult', 'child']) @ApiProperty() type!: 'adult' | 'child';
  @IsString() @ApiProperty() firstName!: string;
  @IsOptional() @IsString() lastName?: string;
  @IsNumber() @Min(0) @Max(120) @ApiProperty() age!: number;
  @IsIn(['F', 'M', 'other']) @ApiProperty() gender!: 'F' | 'M' | 'other';
  @IsOptional() @IsString() dietary?: string;
}

export class OptionsDto {
  @IsOptional() @IsBoolean() transport?: boolean;
  @IsOptional() @IsBoolean() bedding?: boolean;
}

export class ConsentsDto {
  @IsBoolean() rodo!: boolean;
  @IsBoolean() regulamin!: boolean;
}

/** Jeden pokój w komponowanym zgłoszeniu: typ pokoju + indeksy osób z tablicy participants. */
export class RoomCompositionEntryDto {
  @IsString() @ApiProperty() roomId!: string;
  @IsArray() @ArrayNotEmpty() @IsInt({ each: true }) @Min(0, { each: true }) @ApiProperty({ type: [Number] }) participantIndexes!: number[];
}

export class CreateRegistrationDto {
  @IsString() @ApiProperty() instanceId!: string;
  @IsIn(['pl', 'en', 'it']) @ApiProperty() locale!: 'pl' | 'en' | 'it';
  @ValidateNested() @Type(() => ContactDto) @ApiProperty() contact!: ContactDto;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ParticipantInputDto) @ApiProperty({ type: [ParticipantInputDto] }) participants!: ParticipantInputDto[];
  /** Komponowane pokoje — każdy z typem i listą indeksów uczestników z tablicy participants. */
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => RoomCompositionEntryDto) @ApiProperty({ type: [RoomCompositionEntryDto] }) rooms!: RoomCompositionEntryDto[];
  @IsOptional() @IsString() dietaryNotes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) dietaryTags?: string[];
  @IsOptional() @ValidateNested() @Type(() => OptionsDto) options?: OptionsDto;
  @IsOptional() @IsString() discountCode?: string;
  @IsIn(['ONLINE', 'BANK_TRANSFER']) @ApiProperty() paymentMethod!: 'ONLINE' | 'BANK_TRANSFER';
  @ValidateNested() @Type(() => ConsentsDto) @ApiProperty() consents!: ConsentsDto;
}
