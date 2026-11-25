import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CourseAccessService } from '../courses/course-access.service';
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
import { netPaidByPayment } from '../payments/refund-ledger';

interface RegRow { totalPrice: { toString(): string } }
interface CapRow { capacity: number | null; _count: { registrations: number } }

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomsService,
    private readonly courseAccess: CourseAccessService,
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

  /**
   * Zmiana statusu (kontrakt). Anulowanie zapamiętuje status sprzed anulowania (`statusBeforeCancel`),
   * żeby „Przywróć zgłoszenie” mogło oddać np. listę rezerwową albo potwierdzenie bez wpłat.
   * Nie wysyła żadnego maila do gościa. Miejsce i pokoje zwalniają się same: liczniki miejsc
   * i limit pokoi pomijają zgłoszenia CANCELLED.
   */
  async updateRegistrationStatus(id: string, status: string) {
    const next = contractStatusToInternal(status) as
      | 'DRAFT'
      | 'PENDING_PAYMENT'
      | 'AWAITING_TRANSFER'
      | 'CONFIRMED'
      | 'WAITLIST'
      | 'CANCELLED';
    const current = await this.prisma.registration.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw new NotFoundException('Registration not found');
    const remember =
      next === 'CANCELLED'
        ? current.status !== 'CANCELLED' ? { statusBeforeCancel: current.status } : {}
        : { statusBeforeCancel: null };
    await this.prisma.registration.update({
      where: { id },
      data: { status: next, ...(remember as object) } as never,
    });
    this.courseAccess.syncRegistrationSafe(id);
    return this.loadContractRegistration(id);
  }

  /** Idempotentne: ponowny mark-paid opłaconego zgłoszenia → 200, bez duplikatu płatności. */
  async markPaid(registrationId: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: { payments: { where: { status: 'PAID' } } },
    });
    if (!reg) throw new NotFoundException('Registration not found');

    // Księgujemy brakującą resztę: przy wpłatach częściowych (zadatek, raty) nie dublujemy całej kwoty.
    const total = parseFloat(reg.totalPrice.toString());
    // Suma netto: zwroty częściowe wpłat online pomniejszają „wpłacono”.
    const net = await netPaidByPayment(this.prisma, reg.payments as Array<{ id: string; amount: unknown; provider: string }>);
    const paid = [...net.values()].reduce((s, v) => s + v, 0);
    const rest = Math.round((total - paid) * 100) / 100;
    if (reg.payments.length === 0 || rest > 0) {
      await this.prisma.payment.create({
        data: {
          registrationId,
          provider: 'manual',
          method: 'BANK_TRANSFER',
          amount: reg.payments.length === 0 ? reg.totalPrice : rest,
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
    this.courseAccess.syncRegistrationSafe(registrationId);
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
    const c = (reg.contact ?? {}) as { firstName?: string; lastName?: string; email?: string; phone?: string; address?: string; parish?: string; community?: string; communityOther?: boolean };
    return {
      ok: true,
      id: reg.id,
      instanceId: reg.instanceId,
      status: mapRegStatus(reg.status),
      locale: reg.locale,
      contact: {
        firstName: c.firstName ?? '', lastName: c.lastName ?? '', email: c.email, phone: c.phone,
        // Pola dodatkowe formularza (puste → pominięte): adres, parafia, wspólnota.
        ...(c.address ? { address: c.address } : {}),
        ...(c.parish ? { parish: c.parish } : {}),
        ...(c.community ? { community: c.community, communityOther: !!c.communityOther } : {}),
        // Kraj zamieszkania (ISO alpha-2), gdy zgłaszający go podał.
        ...(typeof (c as { countryCode?: unknown }).countryCode === 'string' && /^[A-Z]{2}$/.test((c as { countryCode: string }).countryCode)
          ? { countryCode: (c as { countryCode: string }).countryCode }
          : {}),
      },
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
      checkedInAt: reg.checkedInAt ? iso(reg.checkedInAt) : null,
      roomLabel: reg.roomLabel ?? null,
      roomNote: reg.roomNote ?? null,
      createdAt: iso(reg.createdAt),
    };
  }

  /** Zakwaterowanie: ustaw numer pokoju i komentarz dla zgłoszenia. */
  async setAccommodation(id: string, dto: { roomLabel?: string | null; roomNote?: string | null }) {
    const data: { roomLabel?: string | null; roomNote?: string | null } = {};
    if (dto.roomLabel !== undefined) data.roomLabel = dto.roomLabel?.trim() || null;
    if (dto.roomNote !== undefined) data.roomNote = dto.roomNote?.trim() || null;
    await this.prisma.registration.update({ where: { id }, data });
    return this.loadContractRegistration(id);
  }

  /** Obecność: przełącz check-in zgłoszenia. present=undefined → toggle. */
  async toggleCheckIn(id: string, present?: boolean) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      select: { checkedInAt: true },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    const next =
      present === undefined ? (reg.checkedInAt ? null : new Date()) : present ? new Date() : null;
    await this.prisma.registration.update({ where: { id }, data: { checkedInAt: next } });
    return this.loadContractRegistration(id);
  }
}
