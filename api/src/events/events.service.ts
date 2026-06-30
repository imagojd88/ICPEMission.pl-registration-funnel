import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  toLocalized,
  localizedName,
  mapInstanceStatus,
  num,
  iso,
} from '../admin/personal-os.mapper';
import { resumeUptimeMonitor } from '../integrations/uptime-keepalive';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

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
    // slug strony rejestracji (z RegistrationPage po seriesId) — potrzebny, by panel
    // i Personal OS mogły pokazać/skopiować link publiczny /r/<slug>.
    const page = await this.prisma.registrationPage.findUnique({
      where: { seriesId: inst.seriesId },
      select: { slug: true },
    });
    return {
      id: inst.id,
      seriesId: inst.seriesId,
      slug: page?.slug ?? null,
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
    const instance = page.series.instances[0];
    if (!instance) throw new NotFoundException('No open instance');
    return { page, instance };
  }

  async getSlugConfig(slug: string, locale: string) {
    const { page, instance } = await this.findBySlug(slug);
    const seriesType = (page.series as { type?: string }).type ?? 'ONE_TIME';
    return {
      instanceId: instance.id,
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
        locales: dto.locales,
        published: false,
      },
      update: {
        slug: dto.slug,
        theme: (dto.theme as any) ?? undefined,
        enabledFields: dto.enabledFields as any,
        customFields: (dto.customFields as any) ?? undefined,
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
}
