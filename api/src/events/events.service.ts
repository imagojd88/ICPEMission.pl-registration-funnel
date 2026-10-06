import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  toLocalized,
  localizedName,
  mapInstanceStatus,
  num,
  iso,
} from '../admin/personal-os.mapper';
import { resumeUptimeMonitor } from '../integrations/uptime-keepalive';

/** Po ilu dniach od końca eventu automat przełącza go na CLOSED (→ zakładka „Poprzednie"). */
export const AUTO_CLOSE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const INSTANCE_STATUSES = ['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED'];

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
        payments: { where: { status: 'PAID' }, select: { amount: true } },
      },
    });
    const registeredCount = regs.length;
    const confirmedCount = regs.filter((r: { status: string }) => r.status === 'CONFIRMED').length;
    const revenue = regs.reduce(
      (s: number, r: { payments: Array<{ amount: unknown }> }) =>
        s + r.payments.reduce((ps: number, p: { amount: unknown }) => ps + num(p.amount as number), 0),
      0,
    );
    return { registeredCount, confirmedCount, revenue };
  }

  /** Kształt instancji wg kontraktu Personal OS (lista). */
  private async toContractInstance(inst: {
    id: string; seriesId: string; title: unknown; startsAt: Date; endsAt: Date;
    location: string | null; status: string; capacity: number | null;
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
    const instance = {
      ...raw,
      type: (page.series as { type?: string }).type ?? 'ONE_TIME',
      slug: page.slug,
    };
    return { page, instance };
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
      location: instance.location,
      nights: instance.nights,
      capacity: instance.capacity,
      paymentMethods: instance.paymentMethods,
      pricingConfig: instance.pricingConfig,
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
          location: string | null; status: string; capacity: number | null;
        }) => this.toContractInstance(i),
      ),
    );
  }

  /** Publiczna lista aktywnych eventów (OPEN, z opublikowaną stroną) — do strony głównej. */
  async listPublicActive() {
    await this.maybeCloseExpired();
    const instances = await this.prisma.eventInstance.findMany({
      where: { status: 'OPEN' },
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
          },
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
        nights: src.nights,
        capacity: src.capacity ?? undefined,
        paymentMethods: src.paymentMethods,
        pricingConfig: src.pricingConfig as any,
        registrationOpensAt: src.registrationOpensAt,
        registrationClosesAt: src.registrationClosesAt,
        status: 'DRAFT',
      },
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

  async updatePricing(instanceId: string, pricingConfig: unknown) {
    return this.prisma.eventInstance.update({
      where: { id: instanceId },
      data: { pricingConfig: pricingConfig as any },
    });
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
    },
  ) {
    const data: Record<string, unknown> = {};
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
      // Ręczne ponowne otwarcie → zapamiętujemy, żeby automat nie zamknął eventu z powrotem.
      if (dto.status === 'OPEN' && current.status !== 'OPEN') {
        data.reopenedAt = new Date();
        void resumeUptimeMonitor();
      }
    }
    await this.prisma.eventInstance.update({ where: { id: instanceId }, data });
    return this.getInstanceContract(instanceId);
  }
}
