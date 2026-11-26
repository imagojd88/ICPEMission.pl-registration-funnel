import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { countRoomsByType, roomAvailability, roomShortageMessage, roomStockShortages, type PricingConfig } from '../shared';

export interface RoomUsage {
  /** pokoje zajęte przez zwykłe zgłoszenia (zapis publiczny) */
  public: Record<string, number>;
  /** pokoje zajęte przez zgłoszenia „z rezerwy" (goście specjalni, ustawia admin) */
  reserved: Record<string, number>;
}

/**
 * Limit pokoi (`pricingConfig.rooms[].stock`, rezerwa `reserved`): ile pokoi każdego typu
 * zajmują zgłoszenia instancji. Liczymy wszystkie zgłoszenia poza anulowanymi (także
 * czekające na wpłatę — pokój jest „trzymany" do anulowania). `excludeRegistrationId` —
 * własne zgłoszenie przy zmianie noclegu (jego pokoje wracają do puli).
 */
export async function instanceRoomUsage(
  prisma: PrismaService,
  instanceId: string,
  excludeRegistrationId?: string,
): Promise<RoomUsage> {
  const regs = (await prisma.registration.findMany({
    where: {
      instanceId,
      status: { not: 'CANCELLED' },
      ...(excludeRegistrationId ? { id: { not: excludeRegistrationId } } : {}),
    },
    select: { roomsJson: true, roomsReserved: true } as never,
  })) as unknown as Array<{ roomsJson: unknown; roomsReserved?: boolean | null }>;
  const usage: RoomUsage = { public: {}, reserved: {} };
  for (const r of regs) {
    const bucket = r.roomsReserved ? usage.reserved : usage.public;
    const c = countRoomsByType(Array.isArray(r.roomsJson) ? (r.roomsJson as Array<{ roomId: string }>) : []);
    for (const [k, v] of Object.entries(c)) bucket[k] = (bucket[k] ?? 0) + v;
  }
  return usage;
}

const hasLimits = (cfg: PricingConfig | null | undefined) => !!cfg?.rooms?.some((r) => Number(r.stock ?? 0) > 0);

/** Wolne pokoje per typ dla zapisu publicznego (tylko typy z limitem). */
export async function instanceRoomAvailability(
  prisma: PrismaService,
  instanceId: string,
  cfg: PricingConfig | null,
  excludeRegistrationId?: string,
): Promise<Record<string, number>> {
  if (!hasLimits(cfg)) return {};
  const u = await instanceRoomUsage(prisma, instanceId, excludeRegistrationId);
  return roomAvailability(cfg, u.public, u.reserved);
}

/** Dla panelu: zajętość (publiczna + z rezerwy) i wolne publicznie. */
export async function instanceRoomStock(prisma: PrismaService, instanceId: string, cfg: PricingConfig | null) {
  if (!hasLimits(cfg)) return { roomAvailability: {}, roomUsage: {}, roomUsageReserved: {} };
  const u = await instanceRoomUsage(prisma, instanceId);
  return { roomAvailability: roomAvailability(cfg, u.public, u.reserved), roomUsage: u.public, roomUsageReserved: u.reserved };
}

/**
 * Rzuca 409 (`code: 'ROOM_SOLD_OUT'`, komunikat z nazwą pokoju w języku gościa), gdy zapis publiczny
 * chce więcej pokoi danego typu, niż zostało. Zgłoszenia „z rezerwy" (admin) nie są tu sprawdzane —
 * admin przydziela świadomie.
 *
 * Samo wywołanie NIE chroni przed wyścigiem. Wiążące sprawdzenie robi się W TRANSAKCJI, po
 * `lockInstanceStock` (wspólna blokada eventu z dodatkami — `addon-stock.ts`), podając klienta
 * transakcji jako `prisma`: drugie równoczesne zgłoszenie czeka na blokadę i liczy zajętość
 * już z pierwszym.
 */
export async function assertRoomStock(
  prisma: PrismaService,
  instanceId: string,
  cfg: PricingConfig | null,
  rooms: Array<{ roomId: string; participantIndexes: number[] }>,
  excludeRegistrationId?: string,
  lng = 'pl',
): Promise<void> {
  if (!rooms.length || !hasLimits(cfg)) return;
  const available = await instanceRoomAvailability(prisma, instanceId, cfg, excludeRegistrationId);
  const short = roomStockShortages(cfg, rooms, available);
  if (short.length) {
    const s = short[0];
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      message: roomShortageMessage(cfg, s, lng),
      code: 'ROOM_SOLD_OUT',
      roomId: s.roomId,
      available: s.available,
    });
  }
}
