import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { publicAppUrl } from '../invitations/guest-invite-config';

/**
 * Dane eventów dla aplikacji ICPE Go (tylko odczyt, tylko agregaty — bez danych osobowych).
 * Event jest widoczny wyłącznie, gdy admin zaznaczył w edycji „Udostępniaj dane ICPE Go"
 * (`EventInstance.shareWithIcpeGo`). Kontrakt odpowiedzi: docs/18-api-icpe-go.md.
 */

/** Zgłoszenia, które zajmują miejsca: wszystkie poza anulowanymi i listą rezerwową. */
const NOT_COUNTED = ['CANCELLED', 'WAITLIST'];

export type IcpeGoScope = 'upcoming' | 'open' | 'all';

type InstanceRow = {
  id: string;
  seriesId: string;
  title: unknown;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  countryCode: string | null;
  status: string;
  capacity: number | null;
  registrationOpensAt: Date;
  registrationClosesAt: Date;
  series: { type: string; page: { slug: string; published: boolean; customFields: unknown } | null } | null;
};

const INSTANCE_SELECT = {
  id: true,
  seriesId: true,
  title: true,
  startsAt: true,
  endsAt: true,
  location: true,
  countryCode: true,
  status: true,
  capacity: true,
  registrationOpensAt: true,
  registrationClosesAt: true,
  series: { select: { type: true, page: { select: { slug: true, published: true, customFields: true } } } },
};

@Injectable()
export class IcpeGoService {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: IcpeGoScope, lang?: string) {
    const now = new Date();
    // Ukryty event (`unlisted`) nie trafia na listę nawet przy włączonym „Udostępniaj dane ICPE Go".
    const where: Record<string, unknown> = { shareWithIcpeGo: true, unlisted: false, status: { not: 'DRAFT' } };
    if (scope === 'open') where.status = 'OPEN';
    else if (scope === 'upcoming') {
      where.status = { in: ['OPEN', 'CLOSED'] };
      where.endsAt = { gte: now };
    }
    const rows = (await this.prisma.eventInstance.findMany({
      where: where as never,
      orderBy: { startsAt: 'asc' },
      select: INSTANCE_SELECT as never,
    })) as unknown as InstanceRow[];
    const events = await Promise.all(rows.map((r) => this.toDto(r, lang)));
    return { generatedAt: now.toISOString(), count: events.length, events };
  }

  /** Jeden event: po id instancji albo po slugu strony rejestracji (/r/<slug>). */
  async one(idOrSlug: string, lang?: string) {
    let row = (await this.prisma.eventInstance.findFirst({
      where: { id: idOrSlug, shareWithIcpeGo: true, status: { not: 'DRAFT' } } as never,
      select: INSTANCE_SELECT as never,
    })) as unknown as InstanceRow | null;
    if (!row) {
      const page = await this.prisma.registrationPage.findUnique({
        where: { slug: idOrSlug },
        select: { seriesId: true },
      });
      if (page) {
        // Seria może mieć kilka instancji — bierzemy otwartą, a gdy jej nie ma: najnowszą.
        const candidates = (await this.prisma.eventInstance.findMany({
          where: { seriesId: page.seriesId, shareWithIcpeGo: true, status: { not: 'DRAFT' } } as never,
          orderBy: { startsAt: 'desc' },
          select: INSTANCE_SELECT as never,
        })) as unknown as InstanceRow[];
        row = candidates.find((c) => c.status === 'OPEN') ?? candidates[0] ?? null;
      }
    }
    // Nieudostępniony = nieistniejący (nie zdradzamy, że taki event jest w systemie).
    if (!row) throw new NotFoundException('Event not found');
    return { generatedAt: new Date().toISOString(), event: await this.toDto(row, lang) };
  }

  private async counts(instanceId: string, type: string) {
    if (type === 'STANDALONE') {
      // Event „bez rejestracji" (STANDALONE) zbiera tylko potwierdzenia TAK/NIE — bez podziału na dzieci.
      const yes = await this.prisma.eventRsvp.count({ where: { instanceId, response: 'YES' } });
      return { registrations: yes, adults: yes, children: 0, childrenTracked: false };
    }
    const regWhere = { instanceId, status: { notIn: NOT_COUNTED } };
    const [registrations, groups] = await Promise.all([
      this.prisma.registration.count({ where: regWhere as never }),
      this.prisma.participant.groupBy({
        by: ['type'],
        where: { registration: regWhere } as never,
        _count: { _all: true },
      }) as unknown as Promise<Array<{ type: string; _count: { _all: number } }>>,
    ]);
    const of = (t: string) => groups.find((g) => g.type === t)?._count._all ?? 0;
    return { registrations, adults: of('ADULT'), children: of('CHILD'), childrenTracked: true };
  }

  private async toDto(inst: InstanceRow, lang?: string) {
    const type = inst.series?.type ?? 'ONE_TIME';
    const slug = inst.series?.page?.slug ?? null;
    const c = await this.counts(inst.id, type);
    const taken = c.adults + c.children;
    const cap = inst.capacity && inst.capacity > 0 ? inst.capacity : null;
    const title = localizedMap(inst.title);
    const inviteOnly = type === 'INVITE';
    const locations = locationMap(inst.location, inst.series?.page?.customFields);
    return {
      id: inst.id,
      slug,
      type,
      title,
      ...(lang ? { titleText: pickLang(title, lang) } : {}),
      location: inst.location ?? null,
      locations,
      ...(lang ? { locationText: pickLocation(locations, lang) } : {}),
      countryCode: isoCountry(inst.countryCode),
      startsAt: inst.startsAt.toISOString(),
      endsAt: inst.endsAt.toISOString(),
      status: inst.status === 'OPEN' ? 'OPEN' : 'CLOSED',
      registration: {
        open: inst.status === 'OPEN',
        opensAt: inst.registrationOpensAt.toISOString(),
        closesAt: inst.registrationClosesAt.toISOString(),
        inviteOnly,
        // Event „na zaproszenie" nie ma publicznego formularza — gość wchodzi swoim linkiem /i/:token.
        url: slug && !inviteOnly ? `${publicAppUrl()}/r/${encodeURIComponent(slug)}` : null,
      },
      participants: {
        registrations: c.registrations,
        adults: c.adults,
        children: c.children,
        total: taken,
        childrenTracked: c.childrenTracked,
      },
      capacity: {
        limit: cap,
        taken,
        free: cap === null ? null : Math.max(0, cap - taken),
        occupancyPct: cap === null ? null : Math.round((taken / cap) * 100),
        full: cap !== null && taken >= cap,
      },
    };
  }
}

/**
 * Miejsce w wersjach językowych: { pl: <location>, en?, it? }.
 * Tłumaczenia z `RegistrationPage.customFields.locationI18n` (edycja eventu, zakładki EN/IT) liczą się
 * tylko, gdy powstały z obecnej wersji PL (`locationI18n.pl === location`) — tak samo jak na stronie
 * zapisów (`eventLocation` we froncie). Nieaktualne tłumaczenie pomijamy.
 */
function locationMap(location: string | null, customFields: unknown): Record<string, string> {
  const base = (location ?? '').trim();
  if (!base) return {};
  const out: Record<string, string> = { pl: base };
  const m = ((customFields ?? {}) as { locationI18n?: Record<string, unknown> | null }).locationI18n;
  if (!m || typeof m !== 'object') return out;
  if (String(m.pl ?? '').trim() !== base) return out;
  for (const [k, v] of Object.entries(m)) {
    if (k === 'pl' || typeof v !== 'string' || !v.trim()) continue;
    out[k] = v.trim();
  }
  return out;
}

/** Miejsce w żądanym języku; brak tłumaczenia → angielski → polski. */
function pickLocation(m: Record<string, string>, lang: string): string | null {
  const l = lang.toLowerCase().slice(0, 2);
  return m[l] ?? m.en ?? m.pl ?? null;
}

/** Kod kraju ISO 3166-1 alpha-2: wielkie litery, dokładnie 2 znaki — inaczej null. */
function isoCountry(v: string | null | undefined): string | null {
  const c = (v ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

/** Mapa tytułów {pl, en, it, ko, zh, …} — tylko niepuste napisy. */
function localizedMap(v: unknown): Record<string, string> {
  if (typeof v === 'string') return v.trim() ? { pl: v } : {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries((v ?? {}) as Record<string, unknown>)) {
    if (typeof val === 'string' && val.trim()) out[k] = val.trim();
  }
  return out;
}

/** Tytuł w żądanym języku; brak tłumaczenia → angielski → polski → cokolwiek. */
function pickLang(m: Record<string, string>, lang: string): string {
  const l = lang.toLowerCase().slice(0, 2);
  return m[l] ?? m.en ?? m.pl ?? Object.values(m)[0] ?? '';
}
