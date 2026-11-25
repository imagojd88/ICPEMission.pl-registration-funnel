import { Controller, Get, Header, Headers, Param, Query, UnauthorizedException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IcpeGoEventListDto, IcpeGoEventOneDto } from './icpe-go.dto';
import { timingSafeEqual } from 'crypto';
import { IcpeGoService, IcpeGoScope } from './icpe-go.service';

/**
 * API dla aplikacji ICPE Go — tylko odczyt, tylko eventy z zaznaczonym
 * „Udostępniaj dane ICPE Go". Gdy na Renderze ustawiono ICPE_GO_API_KEY, każde żądanie
 * musi go podać: nagłówek `Authorization: Bearer <klucz>` albo `?key=<klucz>`.
 * Bez ICPE_GO_API_KEY endpointy są publiczne (zwracają wyłącznie liczby i dane eventu).
 */
@ApiTags('icpe-go')
@Controller('icpe-go')
export class IcpeGoController {
  constructor(private readonly svc: IcpeGoService) {}

  @Get('events')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'ICPE Go: lista udostępnionych eventów z liczbą zgłoszeń i zajętością' })
  @ApiOkResponse({ type: IcpeGoEventListDto })
  @ApiQuery({ name: 'scope', required: false, enum: ['upcoming', 'open', 'all'] })
  @ApiQuery({ name: 'lang', required: false, description: 'pl | en | it | ko | zh — dodaje pole titleText' })
  @ApiQuery({ name: 'key', required: false })
  list(
    @Query('scope') scope?: string,
    @Query('lang') lang?: string,
    @Query('key') key?: string,
    @Headers('authorization') auth?: string,
  ) {
    checkKey(key, auth);
    const s: IcpeGoScope = scope === 'open' || scope === 'all' ? scope : 'upcoming';
    return this.svc.list(s, lang);
  }

  @Get('events/:idOrSlug')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'ICPE Go: jeden udostępniony event (id instancji albo slug /r/<slug>)' })
  @ApiOkResponse({ type: IcpeGoEventOneDto })
  @ApiQuery({ name: 'lang', required: false })
  @ApiQuery({ name: 'key', required: false })
  one(
    @Param('idOrSlug') idOrSlug: string,
    @Query('lang') lang?: string,
    @Query('key') key?: string,
    @Headers('authorization') auth?: string,
  ) {
    checkKey(key, auth);
    return this.svc.one(idOrSlug, lang);
  }
}

function checkKey(queryKey?: string, authHeader?: string) {
  const secret = (process.env.ICPE_GO_API_KEY ?? '').trim();
  if (!secret) return;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const given = (bearer || queryKey || '').trim();
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('Invalid ICPE Go API key');
}
