import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildIcs, googleCalendarUrl } from '../shared';

type Response = 'YES' | 'NO';

interface RsvpRecord {
  id: string;
  instanceId: string;
  name: string;
  email: string | null;
  response: string;
  locale: string;
  editToken: string;
  createdAt: Date;
}

interface InstanceLite {
  id: string;
  title: unknown;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
}

@Injectable()
export class RsvpService {
  constructor(private readonly prisma: PrismaService) {}

  private title(t: unknown, locale: string): string {
    if (typeof t === 'string') return t;
    const o = (t ?? {}) as Record<string, string>;
    return o[locale] ?? o.pl ?? o.en ?? o.it ?? 'Event';
  }

  private calendar(instance: InstanceLite, locale: string) {
    const title = this.title(instance.title, locale);
    return {
      google: googleCalendarUrl({
        uid: `rsvp-${instance.id}@icpe`,
        title,
        startsAt: instance.startsAt,
        endsAt: instance.endsAt,
        location: instance.location ?? undefined,
        details: 'ICPE Mission',
      }),
    };
  }

  /** Zapis/aktualizacja RSVP. Jeśli podano e-mail — jeden wpis na (event, e-mail). */
  async create(dto: { instanceId: string; name: string; email?: string; response: Response; locale?: string }) {
    const instance = (await this.prisma.eventInstance.findUnique({
      where: { id: dto.instanceId },
      include: { series: true },
    })) as (InstanceLite & { series: { type: string } }) | null;
    if (!instance) throw new NotFoundException('Instance not found');
    if (instance.series.type !== 'STANDALONE') {
      throw new ForbiddenException('RSVP dostępne tylko dla eventów typu STANDALONE');
    }

    const locale = dto.locale ?? 'pl';
    let rsvp: RsvpRecord | null = null;

    if (dto.email) {
      const existing = (await this.prisma.eventRsvp.findFirst({
        where: { instanceId: dto.instanceId, email: dto.email },
      })) as RsvpRecord | null;
      if (existing) {
        rsvp = (await this.prisma.eventRsvp.update({
          where: { id: existing.id },
          data: { name: dto.name, response: dto.response, locale },
        })) as RsvpRecord;
      }
    }
    if (!rsvp) {
      rsvp = (await this.prisma.eventRsvp.create({
        data: { instanceId: dto.instanceId, name: dto.name, email: dto.email, response: dto.response, locale },
      })) as RsvpRecord;
    }

    return {
      id: rsvp.id,
      response: rsvp.response,
      editToken: rsvp.editToken,
      calendar: this.calendar(instance, locale),
    };
  }

  private async loadWithToken(id: string, token?: string): Promise<RsvpRecord> {
    const rsvp = (await this.prisma.eventRsvp.findUnique({ where: { id } })) as RsvpRecord | null;
    if (!rsvp) throw new NotFoundException('RSVP not found');
    if (token && rsvp.editToken !== token) throw new ForbiddenException('Invalid token');
    return rsvp;
  }

  async findById(id: string, token?: string) {
    const rsvp = await this.loadWithToken(id, token);
    return {
      id: rsvp.id,
      instanceId: rsvp.instanceId,
      name: rsvp.name,
      email: rsvp.email ?? undefined,
      response: rsvp.response,
      locale: rsvp.locale,
    };
  }

  async update(id: string, token: string, dto: { name?: string; response?: Response }) {
    await this.loadWithToken(id, token);
    const updated = (await this.prisma.eventRsvp.update({
      where: { id },
      data: { ...(dto.name ? { name: dto.name } : {}), ...(dto.response ? { response: dto.response } : {}) },
    })) as RsvpRecord;
    return { id: updated.id, response: updated.response };
  }

  async getGoogleUrl(id: string): Promise<string> {
    const rsvp = await this.loadWithToken(id);
    const instance = (await this.prisma.eventInstance.findUniqueOrThrow({ where: { id: rsvp.instanceId } })) as InstanceLite;
    return this.calendar(instance, rsvp.locale).google;
  }

  async getIcs(id: string): Promise<string> {
    const rsvp = await this.loadWithToken(id);
    const instance = (await this.prisma.eventInstance.findUniqueOrThrow({ where: { id: rsvp.instanceId } })) as InstanceLite;
    return buildIcs({
      uid: `rsvp-${rsvp.id}@icpe`,
      title: this.title(instance.title, rsvp.locale),
      startsAt: instance.startsAt,
      endsAt: instance.endsAt,
      location: instance.location ?? undefined,
      details: 'ICPE Mission',
    });
  }

  /** Admin: lista RSVP + liczniki. */
  async listForInstance(instanceId: string) {
    const items = (await this.prisma.eventRsvp.findMany({
      where: { instanceId },
      orderBy: { createdAt: 'desc' },
    })) as RsvpRecord[];
    const yes = items.filter((r) => r.response === 'YES').length;
    return {
      total: items.length,
      yes,
      no: items.length - yes,
      items: items.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email ?? undefined,
        response: r.response,
        locale: r.locale,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
