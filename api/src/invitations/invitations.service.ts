import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface Invitee {
  firstName: string;
  lastName: string;
  email: string;
}

const norm = (s: string) => (s ?? '').trim().toLowerCase();

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Dodaje listę zaproszonych do eventu (instancji). Zwraca aktualną listę z tokenami. */
  async createMany(instanceId: string, invitees: Invitee[]) {
    const inst = await this.prisma.eventInstance.findUnique({ where: { id: instanceId } });
    if (!inst) throw new NotFoundException('Instance not found');
    const clean = (invitees ?? []).filter((i) => (i.firstName || '').trim() && (i.lastName || '').trim());
    for (const i of clean) {
      await this.prisma.invitation.create({
        data: {
          instanceId,
          firstName: i.firstName.trim(),
          lastName: i.lastName.trim(),
          email: (i.email || '').trim(),
        },
      });
    }
    return this.list(instanceId);
  }

  async list(instanceId: string) {
    const rows = await this.prisma.invitation.findMany({
      where: { instanceId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(
      (r: { id: string; firstName: string; lastName: string; email: string; token: string; confirmedAt: Date | null }) => ({
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        token: r.token,
        confirmedAt: r.confirmedAt ? r.confirmedAt.toISOString() : null,
      }),
    );
  }

  async remove(id: string) {
    await this.prisma.invitation.delete({ where: { id } });
    return { ok: true };
  }

  /** Publiczne: dane zaproszenia po tokenie (do strony potwierdzenia). */
  async getByToken(token: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { token },
      include: { instance: { include: { series: { include: { page: true } } } } },
    });
    if (!inv) throw new NotFoundException('Invitation not found');
    const inst = inv.instance;
    const page = inst.series.page;
    return {
      firstName: inv.firstName,
      lastName: inv.lastName,
      email: inv.email,
      confirmedAt: inv.confirmedAt ? inv.confirmedAt.toISOString() : null,
      event: {
        title: inst.title,
        description: inst.description,
        startsAt: inst.startsAt.toISOString(),
        endsAt: inst.endsAt.toISOString(),
        location: inst.location,
        theme: page?.theme ?? null,
        slug: page?.slug ?? null,
      },
    };
  }

  async confirmByToken(token: string) {
    const inv = await this.prisma.invitation.findUnique({ where: { token } });
    if (!inv) throw new NotFoundException('Invitation not found');
    if (!inv.confirmedAt) {
      await this.prisma.invitation.update({ where: { token }, data: { confirmedAt: new Date() } });
    }
    return { ok: true };
  }

  /** Bez linku: dopasowanie po imieniu + nazwisku + e-mailu w ramach eventu (slug), potem potwierdzenie. */
  async matchBySlug(slug: string, data: Invitee) {
    const page = await this.prisma.registrationPage.findUnique({
      where: { slug },
      include: { series: { include: { instances: { where: { status: 'OPEN' }, orderBy: { startsAt: 'asc' }, take: 1 } } } },
    });
    if (!page) throw new NotFoundException('Event not found');
    const inst = page.series.instances[0];
    if (!inst) throw new NotFoundException('No open instance');

    const all = await this.prisma.invitation.findMany({ where: { instanceId: inst.id } });
    const found = all.find(
      (x: { id: string; firstName: string; lastName: string; email: string; token: string; confirmedAt: Date | null }) =>
        norm(x.firstName) === norm(data.firstName) &&
        norm(x.lastName) === norm(data.lastName) &&
        norm(x.email) === norm(data.email),
    );
    if (!found) throw new NotFoundException('Nie znaleziono zaproszenia na podane dane');
    if (!found.confirmedAt) {
      await this.prisma.invitation.update({ where: { id: found.id }, data: { confirmedAt: new Date() } });
    }
    return { ok: true, token: found.token, firstName: found.firstName };
  }
}
