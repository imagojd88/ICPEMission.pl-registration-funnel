import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsService } from '../rooms/rooms.service';
import { AdminSummaryDto } from '../shared';
import {
  mapRegStatus,
  mapPaymentStatus,
  mapPaymentMethod,
  mapGender,
  mapParticipantType,
  contractStatusToInternal,
  num,
  iso,
} from './personal-os.mapper';

interface RegRow { totalPrice: { toString(): string } }
interface CapRow { capacity: number | null; _count: { registrations: number } }

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
  ) {}

  async getSummary(): Promise<AdminSummaryDto> {
    const [openInstances, todayRegistrations, confirmedRegs, capacityData] = await Promise.all([
      this.prisma.eventInstance.count({ where: { status: 'OPEN' } }),
      this.prisma.registration.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      this.prisma.registration.findMany({
        where: { status: 'CONFIRMED' },
        select: { totalPrice: true, instanceId: true },
      }),
      this.prisma.eventInstance.findMany({
        where: { status: 'OPEN' },
        select: { id: true, capacity: true, _count: { select: { registrations: true } } },
      }),
    ]);

    const revenue = (confirmedRegs as RegRow[]).reduce(
      (sum: number, r: RegRow) => sum + parseFloat(r.totalPrice.toString()),
      0,
    );

    let occupancyPct = 0;
    const withCapacity = (capacityData as CapRow[]).filter((i) => i.capacity !== null);
    if (withCapacity.length > 0) {
      const totalCap = withCapacity.reduce((s: number, i: CapRow) => s + (i.capacity ?? 0), 0);
      const totalReg = withCapacity.reduce((s: number, i: CapRow) => s + i._count.registrations, 0);
      occupancyPct = totalCap > 0 ? Math.round((totalReg / totalCap) * 100) : 0;
    }

    return {
      openInstances,
      registrationsToday: todayRegistrations,
      revenue,
      currency: 'PLN',
      occupancyPct,
    };
  }

  async assignRoom(registrationId: string, roomId: string, adminId?: string, participantId?: string) {
    await this.rooms.assignRoom(registrationId, roomId, adminId ?? 'service-token', participantId);
    return this.loadContractRegistration(registrationId);
  }

  async updateRegistrationStatus(id: string, status: string) {
    await this.prisma.registration.update({
      where: { id },
      data: {
        status: contractStatusToInternal(status) as
          | 'DRAFT'
          | 'PENDING_PAYMENT'
          | 'AWAITING_TRANSFER'
          | 'CONFIRMED'
          | 'WAITLIST'
          | 'CANCELLED',
      },
    });
    return this.loadContractRegistration(id);
  }

  /** Idempotentne: ponowny mark-paid opłaconego zgłoszenia → 200, bez duplikatu płatności. */
  async markPaid(registrationId: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: { payments: { where: { status: 'PAID' }, take: 1 } },
    });
    if (!reg) throw new NotFoundException('Registration not found');

    if (reg.payments.length === 0) {
      await this.prisma.payment.create({
        data: {
          registrationId,
          provider: 'manual',
          method: 'BANK_TRANSFER',
          amount: reg.totalPrice,
          currency: reg.currency,
          status: 'PAID',
        },
      });
    }
    if (reg.status !== 'CONFIRMED') {
      await this.prisma.registration.update({
        where: { id: registrationId },
        data: { status: 'CONFIRMED' },
      });
    }
    return this.loadContractRegistration(registrationId);
  }

  /** Wczytuje zgłoszenie i mapuje na kontrakt Personal OS (zwracane po akcjach zapisu). */
  private async loadContractRegistration(id: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include: {
        participants: true,
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        assignments: { include: { room: true }, take: 1 },
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    const c = (reg.contact ?? {}) as { firstName?: string; lastName?: string; email?: string; phone?: string };
    return {
      ok: true,
      id: reg.id,
      instanceId: reg.instanceId,
      status: mapRegStatus(reg.status),
      locale: reg.locale,
      contact: { firstName: c.firstName ?? '', lastName: c.lastName ?? '', email: c.email, phone: c.phone },
      participants: reg.participants.map((p: {
        type: string; firstName: string; lastName: string; age: number | null; gender: string | null; dietary: string | null;
      }) => ({
        type: mapParticipantType(p.type),
        firstName: p.firstName,
        lastName: p.lastName,
        age: p.age ?? undefined,
        gender: mapGender(p.gender),
        dietary: p.dietary ?? undefined,
      })),
      preferredRoomType: reg.preferredRoomTypeId ?? undefined,
      assignedRoom: reg.assignments?.[0]?.room?.label ?? undefined,
      totalPrice: num(reg.totalPrice),
      currency: reg.currency || 'EUR',
      paymentMethod: mapPaymentMethod(reg.paymentMethod),
      paymentStatus: mapPaymentStatus(reg.status, reg.payments?.[0]?.status),
      createdAt: iso(reg.createdAt),
    };
  }
}
