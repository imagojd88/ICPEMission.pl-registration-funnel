import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { NotificationsService } from '../notifications/notifications.service';
import { buildIcs, googleCalendarUrl } from '../shared';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { v4 as uuid } from 'uuid';
import { PriceInput } from '../shared';
import {
  mapRegStatus,
  mapPaymentStatus,
  mapPaymentMethod,
  mapGender,
  mapParticipantType,
  contractStatusFilter,
  num,
  iso,
} from '../admin/personal-os.mapper';

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateRegistrationDto) {
    const instance = await this.prisma.eventInstance.findUnique({
      where: { id: dto.instanceId },
      include: { series: { include: { page: true } } },
    });
    if (!instance) throw new NotFoundException('Event instance not found');

    // Buduj PriceInput z nowego modelu kompozycji pokoi
    const priceInput: PriceInput = {
      rooms: dto.rooms.map(entry => ({
        roomId: entry.roomId,
        participants: entry.participantIndexes.map(i => ({
          type: dto.participants[i].type,
          age: dto.participants[i].age ?? 0,
        })),
      })),
      options: dto.options,
      discountCode: dto.discountCode,
    };

    // Cena wiążąca — obliczona server-side na podstawie config eventu (lub DEFAULT_PRICING)
    const priceResult = await this.pricing.quote(priceInput, dto.instanceId);

    const editToken = uuid();

    const registration = await this.prisma.registration.create({
      data: {
        instanceId: dto.instanceId,
        locale: dto.locale,
        contact: dto.contact as object,
        // roomsJson — skład pokoi (nowy model kompozycji); pole dodane do schematu Prisma
        ...(({ roomsJson: dto.rooms as unknown }) as { roomsJson: unknown }),
        dietaryNotes: dto.dietaryNotes,
        totalPrice: priceResult.total,
        currency: priceResult.currency,
        paymentMethod: dto.paymentMethod,
        editToken,
        status: dto.paymentMethod === 'ONLINE' ? 'PENDING_PAYMENT' : 'AWAITING_TRANSFER',
        participants: {
          create: dto.participants.map(p => ({
            type: p.type === 'adult' ? 'ADULT' : 'CHILD' as 'ADULT' | 'CHILD',
            firstName: p.firstName,
            lastName: p.lastName ?? '',
            age: p.age,
            gender: (p.gender === 'F' ? 'FEMALE' : p.gender === 'M' ? 'MALE' : 'OTHER') as 'MALE' | 'FEMALE' | 'OTHER',
            dietary: p.dietary,
          })),
        },
      } as any,
      include: { participants: true },
    });

    // Send confirmation mail (fire-and-forget)
    const title = (instance.title as Record<string, string>)[dto.locale] ?? (instance.title as Record<string, string>)['pl'] ?? 'Event';
    this.notifications.sendConfirmation({
      to: (dto.contact as { email: string }).email,
      locale: dto.locale,
      registrationId: registration.id,
      eventTitle: title,
      startsAt: instance.startsAt,
      totalPrice: priceResult.total,
      currency: priceResult.currency,
      paymentMethod: dto.paymentMethod,
      editToken,
    }).catch(console.error);

    return {
      registration: this.mapToDto(registration),
      summary: priceResult,
      payment:
        dto.paymentMethod === 'BANK_TRANSFER'
          ? { method: 'BANK_TRANSFER', transferTitle: `REG-${registration.id}` }
          : dto.paymentMethod === 'CASH'
            ? { method: 'CASH', note: 'Płatność gotówką na miejscu' }
            : { method: 'ONLINE', registrationId: registration.id },
    };
  }

  async findById(id: string, token?: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include: { participants: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 }, assignments: { include: { room: { include: { roomType: true } } } } },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (token && reg.editToken !== token) throw new ForbiddenException('Invalid token');
    return this.mapToDto(reg);
  }

  async update(id: string, token: string, dto: Partial<CreateRegistrationDto>) {
    const reg = await this.prisma.registration.findUnique({ where: { id } });
    if (!reg) throw new NotFoundException();
    if (reg.editToken !== token) throw new ForbiddenException('Invalid token');
    if (['CONFIRMED', 'CANCELLED'].includes(reg.status)) {
      throw new BadRequestException('Cannot edit registration in current status');
    }

    const updated = await this.prisma.registration.update({
      where: { id },
      data: {
        locale: dto.locale ?? reg.locale,
        contact: dto.contact ? dto.contact as object : reg.contact as object,
        dietaryNotes: dto.dietaryNotes ?? reg.dietaryNotes ?? undefined,
      },
      include: { participants: true, payments: true },
    });
    return this.mapToDto(updated);
  }

  async getIcs(id: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include: { instance: true },
    });
    if (!reg) throw new NotFoundException();
    const title = (reg.instance.title as Record<string, string>)[reg.locale]
      ?? (reg.instance.title as Record<string, string>)['pl']
      ?? 'ICPE Event';
    return buildIcs({
      uid: `reg-${id}@icpemission.pl`,
      title,
      startsAt: reg.instance.startsAt,
      endsAt: reg.instance.endsAt,
      location: reg.instance.location ?? undefined,
      details: `Zgłoszenie REG-${id}`,
    });
  }

  async getGoogleCalendarUrl(id: string) {
    const reg = await this.prisma.registration.findUnique({
      where: { id },
      include: { instance: true },
    });
    if (!reg) throw new NotFoundException();
    const title = (reg.instance.title as Record<string, string>)[reg.locale]
      ?? (reg.instance.title as Record<string, string>)['pl']
      ?? 'ICPE Event';
    return googleCalendarUrl({
      uid: `reg-${id}@icpemission.pl`,
      title,
      startsAt: reg.instance.startsAt,
      endsAt: reg.instance.endsAt,
      location: reg.instance.location ?? undefined,
      details: `Zgłoszenie REG-${id}`,
    });
  }

  async listForInstance(instanceId: string, status?: string, q?: string) {
    const statusSet = status ? contractStatusFilter(status) : undefined;
    // Mapa id pokoju → nazwa (z cennika instancji) do podsumowania pokoi w zgłoszeniu.
    const instance = await this.prisma.eventInstance.findUnique({
      where: { id: instanceId },
      select: { pricingConfig: true },
    });
    const roomNames = new Map<string, string>();
    const pcRooms =
      ((instance?.pricingConfig as { rooms?: Array<{ id: unknown; name: unknown }> })?.rooms) ?? [];
    for (const r of pcRooms) roomNames.set(String(r.id), String(r.name));

    const regs = await this.prisma.registration.findMany({
      where: {
        instanceId,
        ...(statusSet ? { status: { in: statusSet as never } } : {}),
        ...(q ? { OR: [
          { contact: { path: ['firstName'], string_contains: q } },
          { contact: { path: ['lastName'], string_contains: q } },
          { contact: { path: ['email'], string_contains: q } },
        ] } : {}),
      },
      include: {
        participants: true,
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        assignments: { include: { room: true }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    return regs.map((r: Parameters<RegistrationsService['toContractRegistration']>[0]) =>
      this.toContractRegistration(r, roomNames),
    );
  }

  /** Mapowanie zgłoszenia → dokładny kontrakt Personal OS. */
  private toContractRegistration(
    reg: {
      id: string; instanceId: string; status: string; locale: string; contact: unknown;
      participants: Array<{ type: string; firstName: string; lastName: string; age: number | null; gender: string | null; dietary: string | null }>;
      preferredRoomTypeId?: string | null;
      roomsJson?: unknown;
      totalPrice: { toString(): string }; currency: string; paymentMethod?: string | null;
      checkedInAt?: Date | null;
      createdAt: Date;
      payments?: Array<{ status: string }>;
      assignments?: Array<{ room?: { label: string } | null }>;
    },
    roomNames?: Map<string, string>,
  ) {
    const c = (reg.contact ?? {}) as { firstName?: string; lastName?: string; email?: string; phone?: string };
    // Skomponowane pokoje (roomsJson) → czytelne podsumowanie typów pokoi.
    const comp = (Array.isArray(reg.roomsJson) ? reg.roomsJson : []) as Array<{ roomId?: string }>;
    const summaryParts = comp
      .map((rb) => roomNames?.get(String(rb.roomId)) ?? (rb.roomId ? String(rb.roomId) : ''))
      .filter(Boolean);
    const roomSummary = summaryParts.join(', ');
    return {
      id: reg.id,
      instanceId: reg.instanceId,
      status: mapRegStatus(reg.status),
      locale: reg.locale,
      contact: {
        firstName: c.firstName ?? '',
        lastName: c.lastName ?? '',
        email: c.email,
        phone: c.phone,
      },
      participants: reg.participants.map((p) => ({
        type: mapParticipantType(p.type),
        firstName: p.firstName,
        lastName: p.lastName,
        age: p.age ?? undefined,
        gender: mapGender(p.gender),
        dietary: p.dietary ?? undefined,
      })),
      preferredRoomType: reg.preferredRoomTypeId ?? (roomSummary || undefined),
      assignedRoom: reg.assignments?.[0]?.room?.label ?? (roomSummary || undefined),
      roomSummary: roomSummary || undefined,
      totalPrice: num(reg.totalPrice),
      currency: reg.currency || 'EUR',
      paymentMethod: mapPaymentMethod(reg.paymentMethod),
      paymentStatus: mapPaymentStatus(reg.status, reg.payments?.[0]?.status),
      checkedInAt: reg.checkedInAt ? iso(reg.checkedInAt) : null,
      createdAt: iso(reg.createdAt),
    };
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.registration.update({
      where: { id },
      data: { status: status as 'DRAFT' | 'PENDING_PAYMENT' | 'AWAITING_TRANSFER' | 'CONFIRMED' | 'WAITLIST' | 'CANCELLED' },
    });
  }

  async markPaid(id: string) {
    await this.prisma.registration.update({ where: { id }, data: { status: 'CONFIRMED' } });
    return this.prisma.payment.create({
      data: {
        registrationId: id,
        provider: 'manual',
        method: 'BANK_TRANSFER',
        amount: (await this.prisma.registration.findUniqueOrThrow({ where: { id } })).totalPrice,
        currency: 'PLN',
        status: 'PAID',
      },
    });
  }

  private mapToDto(reg: {
    id: string; instanceId: string; status: string; locale: string; contact: unknown;
    participants: Array<{ id: string; type: string; firstName: string; lastName: string; age: number | null; gender: string; dietary: string | null }>;
    preferredRoomTypeId?: string | null; dietaryNotes?: string | null;
    totalPrice: { toString(): string }; currency: string; paymentMethod?: string | null;
    editToken: string; createdAt: Date;
    payments?: Array<{ status: string }>;
    assignments?: Array<{ room?: { roomType?: { name: unknown } } }>;
  }) {
    const paymentStatus = reg.payments?.[0]?.status ?? (reg.status === 'AWAITING_TRANSFER' ? 'AWAITING_TRANSFER' : 'PENDING');
    return {
      id: reg.id,
      instanceId: reg.instanceId,
      status: reg.status,
      locale: reg.locale,
      contact: reg.contact,
      participants: reg.participants.map(p => ({
        id: p.id,
        type: p.type === 'ADULT' ? 'adult' : 'child',
        firstName: p.firstName,
        lastName: p.lastName,
        age: p.age ?? 0,
        gender: p.gender === 'FEMALE' ? 'F' : p.gender === 'MALE' ? 'M' : 'other',
        dietary: p.dietary ?? undefined,
      })),
      preferredRoomId: reg.preferredRoomTypeId ?? undefined,
      dietaryNotes: reg.dietaryNotes ?? undefined,
      totalPrice: parseFloat(reg.totalPrice.toString()),
      currency: reg.currency,
      paymentMethod: reg.paymentMethod ?? undefined,
      paymentStatus,
      editToken: reg.editToken,
      createdAt: reg.createdAt.toISOString(),
    };
  }
}
