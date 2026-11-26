import { IsString, IsArray, IsOptional, IsBoolean, IsObject, IsIn, ValidateNested, IsEmail, IsNumber, Min, Max, ArrayNotEmpty, IsInt, Matches } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ContactDto {
  @IsString() @ApiProperty() firstName!: string;
  @IsString() @ApiProperty() lastName!: string;
  @IsEmail() @ApiProperty() email!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  /**
   * Kraj zamieszkania zgłaszającego — ISO 3166-1 alpha-2 (np. „PL”). Opcjonalny: stare zgłoszenia
   * i inne kanały go nie mają (wtedy o płatności online decyduje język). Puste = brak; „pl” → „PL”.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value == null ? undefined : value;
    const v = value.trim().toUpperCase();
    return v === '' ? undefined : v;
  })
  @Matches(/^[A-Z]{2}$/, { message: 'countryCode: podaj dwuliterowy kod kraju (ISO 3166-1 alpha-2), np. PL' })
  @ApiProperty({ required: false, example: 'PL' })
  countryCode?: string;
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
  /** dobrowolna darowizna na dofinansowanie pobytu innych (liczona tylko, gdy event ją włączył) */
  @IsOptional() @IsNumber() @Min(0) @Max(100000) donation?: number;
  /** „dodatki z limitem”: id dodatku → liczba sztuk (tylko gdy event je skonfigurował; resztę sprawdza serwis) */
  @IsOptional() @IsObject() addons?: Record<string, number>;
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
  @IsIn(['pl', 'en', 'it', 'ko', 'zh']) @ApiProperty() locale!: 'pl' | 'en' | 'it' | 'ko' | 'zh';
  @ValidateNested() @Type(() => ContactDto) @ApiProperty() contact!: ContactDto;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ParticipantInputDto) @ApiProperty({ type: [ParticipantInputDto] }) participants!: ParticipantInputDto[];
  /** Komponowane pokoje — każdy z typem i listą indeksów uczestników z tablicy participants. */
  /** Pusta lista / brak = bez noclegu (dozwolone, gdy event ma nocleg opcjonalny albo nie ma pokoi — sprawdza serwis). */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RoomCompositionEntryDto) @ApiProperty({ type: [RoomCompositionEntryDto], required: false }) rooms?: RoomCompositionEntryDto[];
  @IsOptional() @IsString() dietaryNotes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) dietaryTags?: string[];
  @IsOptional() @ValidateNested() @Type(() => OptionsDto) options?: OptionsDto;
  @IsOptional() @IsString() discountCode?: string;
  @IsIn(['ONLINE', 'BANK_TRANSFER', 'CASH', 'LEADER_DEPOSIT']) @ApiProperty() paymentMethod!: 'ONLINE' | 'BANK_TRANSFER' | 'CASH' | 'LEADER_DEPOSIT';
  @ValidateNested() @Type(() => ConsentsDto) @ApiProperty() consents!: ConsentsDto;
  /** Token osobistego zaproszenia (link z maila `/r/:slug?inv=`) — spina zaproszenie ze zgłoszeniem. */
  @IsOptional() @IsString() invitationToken?: string;
  /**
   * Klucz sesji formularza (losowy, z przeglądarki) — zamyka wszystkie „niedokończone zgłoszenia” tej sesji,
   * także założone na wcześniej wpisany adres e-mail. Opcjonalny; nieczytelna wartość jest ignorowana.
   */
  @IsOptional() @IsString() leadKey?: string;
}

/** Zmiana / domówienie noclegu przez gościa (strona zgłoszenia `/z/:token`). */
export class UpdateAccommodationDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => RoomCompositionEntryDto) @ApiProperty({ type: [RoomCompositionEntryDto] }) rooms!: RoomCompositionEntryDto[];
}
