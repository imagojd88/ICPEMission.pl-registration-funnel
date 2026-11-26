import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { instanceRoomStock } from '../registrations/room-stock';
import { instanceAddonUsage } from '../registrations/addon-stock';
import type { PricingConfig } from '../shared';
import { hasDiscountCodes, eventAddons, addonAvailability, evaluateConfigWrite, readConfigWriteMeta, pricingSnapshotSummary, type ConfigWriteMeta } from '../shared';
import {
  toLocalized,
  localizedName,
  mapInstanceStatus,
  num,
  iso,
} from '../admin/personal-os.mapper';
import { resumeUptimeMonitor } from '../integrations/uptime-keepalive';
import { netPaidByPayment } from '../payments/refund-ledger';

/** Po ilu dniach od końca eventu automat przełącza go na CLOSED (→ zakładka „Poprzednie"). */
export const AUTO_CLOSE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const INSTANCE_STATUSES = ['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'];
/** Ile wersji historii konfiguracji trzymamy na event. */
const CONFIG_HISTORY_KEEP = 20;

/** Kto zapisuje konfigurację: `realm` z tokenu (`admin` = panel, `service` = Personal OS / integracje). */
export interface ConfigCaller { realm?: string; email?: string }

/** JSON z kluczami w stałej kolejności — do porównania „czy coś się zmieniło” (jsonb nie trzyma kolejności kluczy). */
function stableJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`;
}

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('EventsAutoClose');
  private timer: NodeJS.Timeout | null = null;
  private lastAutoClose = 0;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    // Co godzinę, gdy API działa + krótko po starcie (Render po uśpieniu startuje od nowa).
    this.timer = setInterval(() => void this.closeExpired().catch(() => undefined), 60 * 60 * 1000);
    setTimeout(() => void this.closeExpired().catch(() => undefined), 20_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Automatyczne zamykanie: event OPEN, którego koniec (`endsAt`) minął ponad AUTO_CLOSE_DAYS dni temu,
   * dostaje status CLOSED (Personal OS pokazuje go w „Poprzednich", znika ze strony głównej).
   * Wyjątek: event ręcznie otwarty ponownie po tym terminie (`reopenedAt`) — zostaje otwarty.
   * Idempotentne i tanie; wołane też przy pobieraniu list eventów (najwyżej raz na 5 min),
   * żeby działało nawet wtedy, gdy serwer spał w chwili upływu terminu.
   */
  async closeExpired(now = new Date()): Promise<number> {
    this.lastAutoClose = Date.now();
    const cutoff = new Date(now.getTime() - AUTO_CLOSE_DAYS * DAY_MS);
    const candidates = (await this.prisma.eventInstance.findMany({
      where: { status: 'OPEN', endsAt: { lt: cutoff } },
      select: { id: true, endsAt: true, reopenedAt: true },
    })) as Array<{ id: string; endsAt: Date; reopenedAt: Date | null }>;
    const ids = candidates
      .filter((c) => !c.reopenedAt || c.reopenedAt.getTime() < c.endsAt.getTime() + AUTO_CLOSE_DAYS * DAY_MS)
      .map((c) => c.id);
    if (!ids.length) return 0;
    const res = await this.prisma.eventInstance.updateMany({
      where: { id: { in: ids }, status: 'OPEN' },
      data: { status: 'CLOSED' },
    });
    this.logger.log(`Zamknięto automatycznie ${res.count} event(ów) (> ${AUTO_CLOSE_DAYS} dni po końcu)`);
    return res.count;
  }

  /** Lekkie „szturchnięcie" automatu przy odczycie list (najwyżej raz na 5 min). */
  private async maybeCloseExpired() {
    if (Date.now() - this.lastAutoClose < 5 * 60 * 1000) return;
    await this.closeExpired().catch((e: Error) => this.logger.warn(`closeExpired: ${e.message}`));
  }

  /** Agregaty per instancja: liczba zgłoszeń, potwierdzonych, przychód (wpłacone). */
  private async instanceAggregates(instanceId: string) {
    const regs = await this.prisma.registration.findMany({
      where: { instanceId },
      select: {
        status: true,
        payments: { where: { status: 'PAID' }, select: { id: true, amount: true, provider: true } },
      },
    });
    // Przychód netto: zwroty częściowe wpłat online pomniejszają sumę (wpłaty zwrócone w całości mają status REFUNDED).
    const net = await netPaidByPayment(
      this.prisma,
      (regs as Array<{ payments: Array<{ id: string; amount: unknown; provider: string }> }>).flatMap((r) => r.payments),
    );
    const registeredCount = regs.length;
    const confirmedCount = regs.filter((r: { status: string }) => r.status === 'CONFIRMED').length;
    const revenue = regs.reduce(
      (s: number, r: { payments: Array<{ id: string; amount: unknown }> }) =>
        s + r.payments.reduce((ps: number, p: { id: string; amount: unknown }) => ps + (net.get(p.id) ?? num(p.amount as number)), 0),
      0,
    );
    return { registeredCount, confirmedCount, revenue };
  }

  /** Kształt instancji wg kontraktu Personal OS (lista). */
  private async toContractInstance(inst: {
    id: string; seriesId: string; title: unknown; startsAt: Date; endsAt: Date;
    location: string | null; status: string; capacity: number | null; unlisted?: boolean;
  }) {
    const agg = await this.instanceAggregates(inst.id);
    // typ eventu + slug strony (z serii po seriesId) — potrzebne dla listy (kategoria)
    // i linku publicznego /r/<slug>.
    const series = await this.prisma.eventSeries.findUnique({
      where: { id: inst.seriesId },
      select: { type: true, page: { select: { slug: true } } },
    });
    return {
      id: inst.id,
      seriesId: inst.seriesId,
      type: series?.type ?? 'ONE_TIME',
      slug: series?.page?.slug ?? null,
      title: toLocalized(inst.title),
      startsAt: iso(inst.startsAt),
      endsAt: iso(inst.endsAt),
      location: inst.location ?? '',
      status: mapInstanceStatus(inst.status),
      // Ukryty event (tylko przez link /r/<slug>) — panel pokazuje znacznik „UKRYTY".
      unlisted: inst.unlisted === true,
      // Zarchiwizowany (status wewnętrzny ARCHIVED). `status` zostaje CLOSED — kontrakt Personal OS bez zmian;
      // panel na tej podstawie ukrywa event na liście i pokazuje „Przywróć z archiwum”.
      archived: inst.status === 'ARCHIVED',
      capacity: inst.capacity ?? 0,
      registeredCount: agg.registeredCount,
      confirmedCount: agg.confirmedCount,
      revenue: agg.revenue,
      currency: 'PLN',
    };
  }

  async findBySlug(slug: string) {
    const page = await this.prisma.registrationPage.findUnique({
      where: { slug },
      include: {
        series: {
          include: {
            instances: {
              where: { status: 'OPEN' },
              orderBy: { startsAt: 'asc' },
              take: 1,
              include: { roomTypes: true },
            },
          },
        },
      },
    });
    if (!page) throw new NotFoundException('Page not found');
    // Brak otwartej instancji (event zamknięty / szkic) → zwracamy ostatnią instancję z jej
    // prawdziwym statusem. Publiczny lejek pokazuje wtedy ekran „Zapisy zamknięte" (zamiast
    // 404 → mockowego eventu), a edytor eventu w panelu dalej może go wczytać.
    const raw =
      page.series.instances[0] ??
      (await this.prisma.eventInstance.findFirst({
        where: { seriesId: page.seriesId },
        orderBy: { startsAt: 'desc' },
        include: { roomTypes: true },
      }));
    if (!raw) throw new NotFoundException('No instance');
    // WAŻNE: typ eventu (ONE_TIME/STANDALONE/INVITE) siedzi na serii, a publiczny front
    // czyta go z instancji (`event.type`). Bez tego gałęzie STANDALONE/INVITE nigdy się
    // nie uruchamiały i event „na zaproszenie" pokazywał zwykły lejek rejestracji.
    // Zajęte miejsca dla licznika na landingu („X wolnych miejsc z N"). Bez tego pola front
    // liczył capacity − 0 i event wyglądał na pusty mimo zapisów.
    const registeredCount = await this.takenSpots(raw.id);
    const instance = {
      ...raw,
      type: (page.series as { type?: string }).type ?? 'ONE_TIME',
      slug: page.slug,
      registeredCount,
    };
    return { page, instance };
  }

  /**
   * Liczba zajętych miejsc (osób) — do publicznego licznika wolnych miejsc.
   * Liczymy uczestników zgłoszeń, które trzymają miejsce: wszystkie poza anulowanymi
   * i listą rezerwową (spójnie z limitem pokoi, który też pomija tylko CANCELLED).
   * Zgłoszenie bez listy uczestników liczy się jako 1 osoba.
   */
  private async takenSpots(instanceId: string): Promise<number> {
    const regs = (await this.prisma.registration.findMany({
      where: { instanceId, status: { notIn: ['CANCELLED', 'WAITLIST'] } },
      select: { _count: { select: { participants: true } } },
    })) as Array<{ _count: { participants: number } }>;
    return regs.reduce((s, r) => s + Math.max(1, r._count.participants), 0);
  }

  private roomStock(instanceId: string, cfg: PricingConfig | null) {
    return instanceRoomStock(this.prisma, instanceId, cfg);
  }

  private async addonStock(instanceId: string, cfg: PricingConfig | null) {
    const defs = eventAddons(cfg);
    if (!defs.length) return {};
    const used = await instanceAddonUsage(this.prisma, instanceId);
    return { addonAvailability: addonAvailability(defs, used), addonUsage: used };
  }

  // ── Bezpieczny zapis konfiguracji + historia ───────────────────────────────────────────

  private get anyDb() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.prisma as any;
  }

  /** Stan konfiguracji eventu do historii (instancja + cennik + strona). */
  private async configSnapshot(instanceId: string): Promise<{ rev: number; seriesId: string; snapshot: Record<string, unknown> } | null> {
    const inst = (await this.anyDb.eventInstance.findUnique({ where: { id: instanceId } })) as Record<string, unknown> | null;
    if (!inst) return null;
    const page = (await this.anyDb.registrationPage.findUnique({ where: { seriesId: inst.seriesId } }).catch(() => null)) as Record<string, unknown> | null;
    const isoOf = (d: unknown) => (d instanceof Date ? d.toISOString() : d ?? null);
    return {
      rev: Number(inst.configRev ?? 0),
      seriesId: String(inst.seriesId),
      snapshot: {
        configRev: Number(inst.configRev ?? 0),
        instance: {
          title: inst.title ?? null,
          description: inst.description ?? null,
          startsAt: isoOf(inst.startsAt),
          endsAt: isoOf(inst.endsAt),
          registrationOpensAt: isoOf(inst.registrationOpensAt),
          registrationClosesAt: isoOf(inst.registrationClosesAt),
          location: inst.location ?? null,
          countryCode: inst.countryCode ?? null,
          nights: inst.nights ?? null,
          capacity: inst.capacity ?? null,
          paymentMethods: inst.paymentMethods ?? [],
          unlisted: inst.unlisted ?? false,
          shareWithIcpeGo: inst.shareWithIcpeGo ?? false,
        },
        pricingConfig: inst.pricingConfig ?? null,
        page: page
          ? { slug: page.slug ?? null, theme: page.theme ?? null, customFields: page.customFields ?? null, paymentInfo: page.paymentInfo ?? null, locales: page.locales ?? null, enabledFields: page.enabledFields ?? null }
          : null,
      },
    };
  }

  /** Dopisuje wersję do historii i przycina do ostatnich `CONFIG_HISTORY_KEEP`. Błąd historii nie blokuje zapisu eventu. */
  private async pushConfigHistory(instanceId: string, snapshot: Record<string, unknown>, caller: ConfigCaller | undefined, meta: ConfigWriteMeta, source?: string) {
    try {
      await this.anyDb.eventConfigHistory.create({
        data: {
          instanceId,
          actor: caller?.email || caller?.realm || 'system',
          source: source ?? (caller?.realm === 'admin' ? 'panel' : caller?.realm === 'service' ? 'service' : 'system'),
          clientVersion: meta.clientVersion || meta.configLevel ? `${meta.clientVersion ?? '?'} (poziom ${meta.configLevel ?? '?'})` : null,
          snapshot,
        },
      });
      const old = (await this.anyDb.eventConfigHistory.findMany({
        where: { instanceId }, orderBy: { createdAt: 'desc' }, skip: CONFIG_HISTORY_KEEP, select: { id: true },
      })) as Array<{ id: string }>;
      if (old.length) await this.anyDb.eventConfigHistory.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    } catch (e) {
      this.logger.error(`Historia konfiguracji eventu ${instanceId}: zapis nieudany — ${(e as Error).message}`);
    }
  }

  /**
   * Zapis pól instancji z ochroną cennika:
   *  - panel (JWT admina) musi podać `_client.configLevel` ≥ wymaganego — stara karta przeglądarki dostaje 409,
   *  - `_client.configRev` inne niż w bazie → 409 (konfigurację zmienił ktoś inny / inna karta),
   *  - zapis warunkowy po `configRev` (dwa równoczesne zapisy: drugi dostaje 409),
   *  - stan sprzed zapisu trafia do historii, gdy cokolwiek się zmieniło.
   * Token serwisowy (Personal OS) nie podaje `_client` i nie jest sprawdzany.
   */
  private async writeInstanceConfig(instanceId: string, data: Record<string, unknown>, rawClient: unknown, caller: ConfigCaller | undefined, source?: string) {
    const meta = readConfigWriteMeta(rawClient);
    const before = await this.configSnapshot(instanceId);
    if (!before) throw new NotFoundException('Event not found');
    const verdict = evaluateConfigWrite({ realm: caller?.realm, touchesPricing: true, meta, currentRev: before.rev });
    if (!verdict.ok) {
      this.logger.warn(`Odrzucony zapis konfiguracji eventu ${instanceId} (${verdict.code}) — ${caller?.email ?? caller?.realm ?? '?'}, klient: ${meta.clientVersion ?? 'brak'} / poziom ${meta.configLevel ?? 'brak'}`);
      throw new ConflictException(verdict.message);
    }
    const upd = (await this.anyDb.eventInstance.updateMany({
      where: { id: instanceId, configRev: before.rev },
      data: { ...data, configRev: { increment: 1 } },
    })) as { count: number };
    if (upd.count !== 1) {
      throw new ConflictException('Ustawienia tego eventu zostały przed chwilą zmienione przez kogoś innego. NIC nie zostało zapisane. Odśwież stronę i wprowadź zmiany ponownie.');
    }
    const after = await this.configSnapshot(instanceId);
    const strip = (s: Record<string, unknown> | undefined) => stableJson({ ...(s ?? {}), configRev: 0 });
    if (strip(before.snapshot) !== strip(after?.snapshot)) {
      await this.pushConfigHistory(instanceId, before.snapshot, caller, meta, source);
    }
    return before.rev + 1;
  }

  /** Lista wersji historii (od najnowszej): kiedy, kto, wersja panelu, krótki opis cennika + pełna migawka. */
  async configHistory(instanceId: string) {
    const inst = (await this.anyDb.eventInstance.findUnique({ where: { id: instanceId }, select: { id: true, configRev: true, pricingConfig: true } })) as { configRev?: number; pricingConfig: unknown } | null;
    if (!inst) throw new NotFoundException('Event not found');
    const rows = (await this.anyDb.eventConfigHistory.findMany({ where: { instanceId }, orderBy: { createdAt: 'desc' }, take: CONFIG_HISTORY_KEEP })) as Array<{
      id: string; createdAt: Date; actor: string; source: string; clientVersion: string | null; snapshot: { pricingConfig?: unknown; instance?: unknown; page?: unknown; configRev?: number } | null;
    }>;
    return {
      configRev: Number(inst.configRev ?? 0),
      currentSummary: pricingSnapshotSummary(inst.pricingConfig),
      keep: CONFIG_HISTORY_KEEP,
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        actor: r.actor,
        source: r.source,
        clientVersion: r.clientVersion,
        configRev: r.snapshot?.configRev ?? null,
        summary: pricingSnapshotSummary(r.snapshot?.pricingConfig),
        pricingConfig: r.snapshot?.pricingConfig ?? null,
        instance: r.snapshot?.instance ?? null,
        page: r.snapshot?.page ?? null,
      })),
    };
  }

  /** Przywraca CENNIK (`pricingConfig`) z wybranej wersji historii. Pozostałe pola eventu i strona zostają bez zmian. */
  async restoreConfig(instanceId: string, historyId: string, dto: Record<string, unknown>, caller: ConfigCaller) {
    const row = (await this.anyDb.eventConfigHistory.findUnique({ where: { id: historyId } })) as { instanceId: string; snapshot: { pricingConfig?: unknown } | null } | null;
    if (!row || row.instanceId !== instanceId) throw new NotFoundException('Nie ma takiej wersji w historii tego eventu.');
    const pc = row.snapshot?.pricingConfig;
    if (!pc || typeof pc !== 'object') throw new BadRequestException('Ta wersja historii nie zawiera cennika.');
    const configRev = await this.writeInstanceConfig(instanceId, { pricingConfig: pc }, dto?._client, caller, 'restore');
    this.logger.log(`Przywrócono cennik eventu ${instanceId} z wersji ${historyId} — ${caller.email}`);
    return { ok: true, configRev };
  }

  async getSlugConfig(slug: string, locale: string) {
    const { page, instance } = await this.findBySlug(slug);
    const seriesType = (page.series as { type?: string }).type ?? 'ONE_TIME';
    return {
      instanceId: instance.id,
      status: instance.status,
      locale,
      type: seriesType,
      isStandalone: seriesType === 'STANDALONE',
      title: instance.title,
      description: instance.description,
      startsAt: instance.startsAt,
      endsAt: instance.endsAt,
      // Start zapisów: przed tą chwilą strona pokazuje licznik zamiast przycisku „Zapisz się".
      registrationOpensAt: (instance as { registrationOpensAt?: Date }).registrationOpensAt ?? null,
      location: instance.location,
      // Kraj eventu (ISO 3166-1 alpha-2) — lista wyboru w edycji eventu.
      countryCode: (instance as { countryCode?: string | null }).countryCode ?? null,
      nights: instance.nights,
      capacity: instance.capacity,
      // Przełącznik „Udostępniaj dane ICPE Go" (edycja eventu w panelu).
      shareWithIcpeGo: (instance as { shareWithIcpeGo?: boolean }).shareWithIcpeGo === true,
      // Ukryty event: publiczny lejek dokłada <meta name="robots" content="noindex">, panel — przełącznik.
      unlisted: (instance as { unlisted?: boolean }).unlisted === true,
      paymentMethods: instance.paymentMethods,
      pricingConfig: instance.pricingConfig,
      // Czy event ma choć jeden aktywny kod rabatowy — lejek pokazuje pole „Kod rabatowy” tylko wtedy.
      hasDiscountCodes: hasDiscountCodes(instance.pricingConfig as unknown as PricingConfig | null),
      // Numer wersji konfiguracji — panel odsyła go przy zapisie (ochrona przed nadpisaniem z nieaktualnej karty).
      configRev: Number((instance as { configRev?: number }).configRev ?? 0),
      // Limit pokoi: wolne pokoje per typ (tylko typy z limitem) + zajętość (dla panelu).
      ...(await this.roomStock(instance.id, instance.pricingConfig as unknown as PricingConfig | null)),
      // Dodatki z limitem: wolne sztuki (tylko dodatki z limitem) + zajętość. Event bez dodatków → brak pól.
      ...(await this.addonStock(instance.id, instance.pricingConfig as unknown as PricingConfig | null)),
      roomTypes: (instance.roomTypes as Array<{
        id: string; name: unknown; capacity: number;
        pricingModel: string; price: { toString(): string }; quantity: number;
      }>).map((rt) => ({
        id: rt.id,
        name: rt.name,
        capacity: rt.capacity,
        pricingModel: rt.pricingModel,
        price: Number(rt.price),
        quantity: rt.quantity,
      })),
      enabledFields: page.enabledFields,
      customFields: page.customFields,
      paymentInfo: page.paymentInfo,
      locales: page.locales,
      theme: page.theme,
    };
  }

  /** Wewnętrzny (raw) detal instancji — używany m.in. przez cloneInstance. */
  async getInstance(id: string) {
    const inst = await this.prisma.eventInstance.findUnique({
      where: { id },
      include: { roomTypes: true, series: { include: { page: true } } },
    });
    if (!inst) throw new NotFoundException('Instance not found');
    return inst;
  }

  /** GET /admin/instances/:id — kształt wg kontraktu Personal OS. */
  async getInstanceContract(id: string) {
    const inst = await this.prisma.eventInstance.findUnique({
      where: { id },
      include: { roomTypes: true },
    });
    if (!inst) throw new NotFoundException('Instance not found');

    const rooms = await this.prisma.room.findMany({
      where: { instanceId: id },
      include: { _count: { select: { assignments: true } } },
    });
    const total = rooms.reduce((s: number, r: { capacity: number }) => s + r.capacity, 0);
    const assigned = rooms.reduce(
      (s: number, r: { _count: { assignments: number } }) => s + r._count.assignments,
      0,
    );

    const base = await this.toContractInstance(inst);
    return {
      ...base,
      roomTypes: inst.roomTypes.map((rt: { id: string; name: unknown; capacity: number; price: unknown }) => ({
        id: rt.id,
        name: localizedName(rt.name),
        capacity: rt.capacity,
        price: num(rt.price as number),
      })),
      roomsOccupancy: { total, assigned, free: Math.max(0, total - assigned) },
    };
  }

  /** GET /admin/instances?status=OPEN|CLOSED|ALL — lista wg kontraktu. */
  async listInstances(status?: string) {
    await this.maybeCloseExpired();
    let where: { status?: unknown } | undefined;
    if (status && status.toUpperCase() !== 'ALL') {
      const s = status.toUpperCase();
      if (s === 'OPEN') where = { status: 'OPEN' };
      else if (s === 'CLOSED') where = { status: { in: ['CLOSED', 'ARCHIVED', 'DRAFT'] } };
    }
    const instances = await this.prisma.eventInstance.findMany({
      where: where as never,
      orderBy: { startsAt: 'desc' },
    });
    return Promise.all(
      instances.map(
        (i: {
          id: string; seriesId: string; title: unknown; startsAt: Date; endsAt: Date;
          location: string | null; status: string; capacity: number | null; unlisted?: boolean;
        }) => this.toContractInstance(i),
      ),
    );
  }

  /**
   * Publiczna lista aktywnych eventów (OPEN, z opublikowaną stroną) — do strony głównej
   * (GET /events) i strony icpemission.pl (GET /site/events/upcoming).
   * Eventy ukryte (`unlisted`) są pomijane — działają tylko pod bezpośrednim linkiem /r/<slug>.
   */
  async listPublicActive() {
    await this.maybeCloseExpired();
    const instances = await this.prisma.eventInstance.findMany({
      where: { status: 'OPEN', unlisted: false } as never,
      orderBy: { startsAt: 'asc' },
      include: { series: { select: { type: true } } },
    });
    const out: Array<{
      slug: string; title: unknown; startsAt: string; endsAt: string;
      location: string; heroImageUrl: string | null; primaryColor: string | null;
    }> = [];
    for (const inst of instances) {
      // Eventy „na zaproszenie" są prywatne — nie reklamujemy ich kafelkiem na stronie
      // głównej. Zaproszony i tak wchodzi swoim linkiem /i/:token albo bezpośrednio /r/:slug.
      if ((inst.series as { type?: string } | null)?.type === 'INVITE') continue;
      const page = await this.prisma.registrationPage.findUnique({
        where: { seriesId: inst.seriesId },
        select: { slug: true, theme: true },
      });
      if (!page?.slug) continue;
      const theme = (page.theme ?? {}) as { heroImageUrl?: string; primaryColor?: string };
      out.push({
        slug: page.slug,
        title: toLocalized(inst.title),
        startsAt: iso(inst.startsAt),
        endsAt: iso(inst.endsAt),
        location: inst.location ?? '',
        heroImageUrl: theme.heroImageUrl ?? null,
        primaryColor: theme.primaryColor ?? null,
      });
    }
    return out;
  }

  async createSeries(dto: {
    type: string;
    title: Record<string, string>;
    description?: Record<string, string>;
    startsAt: string;
    endsAt: string;
    location?: string;
    nights: number;
    capacity?: number;
    paymentMethods: string[];
    pricingConfig: unknown;
    registrationOpensAt: string;
    registrationClosesAt: string;
    recurrence?: string;
    unlisted?: boolean;
  }) {
    const series = await this.prisma.eventSeries.create({
      data: {
        type: dto.type as 'ONE_TIME' | 'EVERGREEN',
        recurrence: dto.recurrence,
        instances: {
          create: {
            title: dto.title as any,
            description: (dto.description ?? undefined) as any,
            startsAt: new Date(dto.startsAt),
            endsAt: new Date(dto.endsAt),
            location: dto.location,
            nights: dto.nights,
            capacity: dto.capacity,
            paymentMethods: dto.paymentMethods as ('ONLINE' | 'BANK_TRANSFER')[],
            pricingConfig: dto.pricingConfig as any,
            registrationOpensAt: new Date(dto.registrationOpensAt),
            registrationClosesAt: new Date(dto.registrationClosesAt),
            // Utworzony event jest od razu OPEN — widoczny publicznie po slug.
            status: (dto as { status?: string }).status === 'DRAFT' ? 'DRAFT' : 'OPEN',
            // Ukryty event od utworzenia (opcjonalne; domyślnie widoczny na listach).
            ...(dto.unlisted === true ? { unlisted: true } : {}),
          } as never,
        },
      },
      include: { instances: true },
    });
    // Otwarto nowy event → wznów monitor keep-alive (best-effort).
    void resumeUptimeMonitor();
    return series;
  }

  async cloneInstance(id: string) {
    const src = await this.getInstance(id);
    return this.prisma.eventInstance.create({
      data: {
        seriesId: src.seriesId,
        title: src.title as any,
        description: (src.description as any | null) ?? undefined,
        startsAt: src.startsAt,
        endsAt: src.endsAt,
        location: src.location ?? undefined,
        countryCode: (src as { countryCode?: string | null }).countryCode ?? undefined,
        nights: src.nights,
        capacity: src.capacity ?? undefined,
        paymentMethods: src.paymentMethods,
        pricingConfig: src.pricingConfig as any,
        registrationOpensAt: src.registrationOpensAt,
        registrationClosesAt: src.registrationClosesAt,
        status: 'DRAFT',
        // Klon ukrytego eventu też jest ukryty (bezpieczniejsze niż przypadkowe ujawnienie).
        ...((src as { unlisted?: boolean }).unlisted === true ? { unlisted: true } : {}),
      } as never,
    });
  }

  async configureSeriesPage(
    seriesId: string,
    dto: {
      slug: string;
      theme?: unknown;
      enabledFields: unknown;
      customFields?: unknown;
      paymentInfo?: unknown;
      locales: string[];
      isEvergreen: boolean;
    },
  ) {
    return this.prisma.registrationPage.upsert({
      where: { seriesId },
      create: {
        seriesId,
        slug: dto.slug,
        isEvergreen: dto.isEvergreen,
        theme: (dto.theme as any) ?? undefined,
        enabledFields: dto.enabledFields as any,
        customFields: (dto.customFields as any) ?? undefined,
        paymentInfo: (dto.paymentInfo as any) ?? undefined,
        locales: dto.locales,
        published: false,
      },
      update: {
        slug: dto.slug,
        theme: (dto.theme as any) ?? undefined,
        enabledFields: dto.enabledFields as any,
        customFields: (dto.customFields as any) ?? undefined,
        paymentInfo: (dto.paymentInfo as any) ?? undefined,
        locales: dto.locales,
      },
    });
  }

  async publishSeries(seriesId: string) {
    const page = await this.prisma.registrationPage.update({
      where: { seriesId },
      data: { published: true },
    });
    void resumeUptimeMonitor();
    return page;
  }

  async updatePricing(instanceId: string, pricingConfig: unknown, caller?: ConfigCaller) {
    // `_client` (znacznik panelu) nie jest częścią cennika — nie zapisujemy go.
    const { _client, ...config } = (pricingConfig && typeof pricingConfig === 'object' ? pricingConfig : {}) as Record<string, unknown>;
    await this.writeInstanceConfig(instanceId, { pricingConfig: config }, _client, caller);
    return this.prisma.eventInstance.findUnique({ where: { id: instanceId } });
  }

  /** Edycja istniejącego eventu (instancji) — pola podstawowe + cennik + metody płatności. */
  async updateInstance(
    instanceId: string,
    dto: {
      title?: Record<string, string>;
      description?: Record<string, string> | null;
      startsAt?: string;
      endsAt?: string;
      location?: string | null;
      nights?: number;
      capacity?: number | null;
      paymentMethods?: string[];
      pricingConfig?: unknown;
      registrationOpensAt?: string;
      registrationClosesAt?: string;
      status?: string;
      shareWithIcpeGo?: boolean;
      countryCode?: string | null;
      unlisted?: boolean;
      /** Znacznik panelu: { version, configLevel, configRev } — wymagany przy zapisie cennika z panelu. */
      _client?: unknown;
    },
    caller?: ConfigCaller,
  ) {
    const data: Record<string, unknown> = {};
    if (dto.countryCode !== undefined) {
      const cc = typeof dto.countryCode === 'string' ? dto.countryCode.trim().toUpperCase() : '';
      if (cc && !/^[A-Z]{2}$/.test(cc)) throw new BadRequestException('Kraj: oczekiwany kod ISO 3166-1 alpha-2, np. PL');
      data.countryCode = cc || null;
    }
    if (dto.shareWithIcpeGo !== undefined) data.shareWithIcpeGo = dto.shareWithIcpeGo === true;
    if (dto.unlisted !== undefined) data.unlisted = dto.unlisted === true;
    if (dto.title !== undefined) data.title = dto.title as any;
    if (dto.description !== undefined) data.description = (dto.description ?? null) as any;
    if (dto.startsAt !== undefined) data.startsAt = new Date(dto.startsAt);
    if (dto.endsAt !== undefined) data.endsAt = new Date(dto.endsAt);
    if (dto.location !== undefined) data.location = dto.location ?? null;
    if (dto.nights !== undefined) data.nights = dto.nights;
    if (dto.capacity !== undefined) data.capacity = dto.capacity ?? null;
    if (dto.paymentMethods !== undefined) data.paymentMethods = dto.paymentMethods as any;
    if (dto.pricingConfig !== undefined) data.pricingConfig = dto.pricingConfig as any;
    if (dto.registrationOpensAt !== undefined) data.registrationOpensAt = new Date(dto.registrationOpensAt);
    if (dto.registrationClosesAt !== undefined) data.registrationClosesAt = new Date(dto.registrationClosesAt);
    if (dto.status !== undefined) {
      if (!INSTANCE_STATUSES.includes(dto.status)) throw new BadRequestException('Nieprawidłowy status eventu');
      data.status = dto.status as any;
      const current = await this.prisma.eventInstance.findUnique({ where: { id: instanceId }, select: { status: true } });
      if (!current) throw new NotFoundException('Event not found');
      // Archiwum jest dla eventów zamkniętych: otwarty trzeba najpierw zamknąć (zapisy, przypomnienia i recepcja
      // pomocników przestają działać dopiero po zamknięciu — archiwizacja „z marszu” byłaby zamknięciem bez pytania).
      if (dto.status === 'ARCHIVED' && current.status === 'OPEN') {
        throw new BadRequestException('Najpierw zamknij event — archiwizować można tylko zamknięty.');
      }
      // Ręczne ponowne otwarcie → zapamiętujemy, żeby automat nie zamknął eventu z powrotem.
      if (dto.status === 'OPEN' && current.status !== 'OPEN') {
        data.reopenedAt = new Date();
        void resumeUptimeMonitor();
      }
    }
    if (dto.pricingConfig !== undefined) {
      // Zapis z cennikiem: ochrona przed nieaktualnym panelem + historia (patrz `writeInstanceConfig`).
      await this.writeInstanceConfig(instanceId, data, dto._client, caller);
    } else {
      await this.prisma.eventInstance.update({ where: { id: instanceId }, data });
    }
    return this.getInstanceContract(instanceId);
  }
}
