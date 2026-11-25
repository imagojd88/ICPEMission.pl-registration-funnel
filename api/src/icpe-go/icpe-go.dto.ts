import { ApiProperty } from '@nestjs/swagger';

/**
 * Kształt odpowiedzi API ICPE Go — tylko na potrzeby Swaggera (tag `icpe-go`).
 * Serwis zwraca zwykłe obiekty; te klasy opisują je w /docs. Kontrakt: docs/18-api-icpe-go.md.
 */

export class IcpeGoRegistrationDto {
  @ApiProperty({ description: 'Czy formularz przyjmuje zgłoszenia (status eventu OPEN).' })
  open!: boolean;

  @ApiProperty({ format: 'date-time' })
  opensAt!: string;

  @ApiProperty({ format: 'date-time' })
  closesAt!: string;

  @ApiProperty({ description: 'Event na zaproszenie: brak publicznego formularza, url = null.' })
  inviteOnly!: boolean;

  @ApiProperty({ type: String, nullable: true, example: 'https://rejestracja.icpemission.pl/r/rekolekcje-wspolnot-2027' })
  url!: string | null;
}

export class IcpeGoParticipantsDto {
  @ApiProperty({ description: 'Liczba zgłoszeń (formularzy), bez anulowanych i listy rezerwowej.' })
  registrations!: number;

  @ApiProperty()
  adults!: number;

  @ApiProperty()
  children!: number;

  @ApiProperty({ description: 'adults + children' })
  total!: number;

  @ApiProperty({ description: 'false dla STANDALONE (potwierdzenia TAK/NIE bez podziału na dzieci).' })
  childrenTracked!: boolean;
}

export class IcpeGoCapacityDto {
  @ApiProperty({ type: Number, nullable: true, description: '„Limit miejsc” (osoby); null = bez limitu.' })
  limit!: number | null;

  @ApiProperty()
  taken!: number;

  @ApiProperty({ type: Number, nullable: true })
  free!: number | null;

  @ApiProperty({ type: Number, nullable: true, description: '% zajętych miejsc, zaokrąglony; null bez limitu.' })
  occupancyPct!: number | null;

  @ApiProperty()
  full!: boolean;
}

export class IcpeGoEventDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  slug!: string | null;

  @ApiProperty({ enum: ['ONE_TIME', 'STANDALONE', 'INVITE', 'EVERGREEN'] })
  type!: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { pl: 'Rekolekcje wspólnot', en: "Communities' Retreat" },
  })
  title!: Record<string, string>;

  @ApiProperty({ required: false, description: 'Tylko z ?lang= — tytuł w tym języku (fallback EN, potem PL).' })
  titleText?: string;

  @ApiProperty({ type: String, nullable: true, description: 'Miejsce jako jeden tekst — wersja polska (kanoniczna, bez zmian).' })
  location!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { pl: 'Ośrodek h2o, Kiczyce', en: 'h2o Centre, Kiczyce' },
    description:
      'Miejsce w wersjach językowych: pl zawsze (= location), en/it gdy przetłumaczono w panelu. Puste {} gdy brak miejsca.',
  })
  locations!: Record<string, string>;

  @ApiProperty({
    type: String,
    nullable: true,
    required: false,
    description: 'Tylko z ?lang= — miejsce w tym języku; brak tłumaczenia → EN → PL.',
  })
  locationText?: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    pattern: '^[A-Z]{2}$',
    example: 'PL',
    description: 'Kraj eventu: kod ISO 3166-1 alpha-2 (wielkie litery, 2 znaki) albo null, gdy nie ustawiono. Bez nazwy kraju.',
  })
  countryCode!: string | null;

  @ApiProperty({ format: 'date-time' })
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  endsAt!: string;

  @ApiProperty({ enum: ['OPEN', 'CLOSED'] })
  status!: string;

  @ApiProperty({ type: IcpeGoRegistrationDto })
  registration!: IcpeGoRegistrationDto;

  @ApiProperty({ type: IcpeGoParticipantsDto })
  participants!: IcpeGoParticipantsDto;

  @ApiProperty({ type: IcpeGoCapacityDto })
  capacity!: IcpeGoCapacityDto;
}

export class IcpeGoEventListDto {
  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;

  @ApiProperty()
  count!: number;

  @ApiProperty({ type: [IcpeGoEventDto] })
  events!: IcpeGoEventDto[];
}

export class IcpeGoEventOneDto {
  @ApiProperty({ format: 'date-time' })
  generatedAt!: string;

  @ApiProperty({ type: IcpeGoEventDto })
  event!: IcpeGoEventDto;
}
