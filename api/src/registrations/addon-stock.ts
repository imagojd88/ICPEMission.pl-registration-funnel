import { ConflictException, BadRequestException } from '@nestjs/common';
import {
  addonAvailability, addonProblemMessage, addonUsage, eventAddons, validateAddonSelection,
  type AddonDef, type AddonPerson, type AddonSelection, type PricingConfig,
} from '../shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * „Dodatki z limitem” (`pricingConfig.addons`): ile sztuk zajmują zgłoszenia instancji.
 * Liczą się zgłoszenia aktywne — bez anulowanych i bez listy rezerwowej (ta sama definicja
 * co licznik miejsc). `excludeRegistrationId` — własne zgłoszenie przy edycji.
 */
export async function instanceAddonUsage(db: Db, instanceId: string, excludeRegistrationId?: string): Promise<Record<string, number>> {
  const regs = (await db.registration.findMany({
    where: {
      instanceId,
      status: { notIn: ['CANCELLED', 'WAITLIST'] },
      ...(excludeRegistrationId ? { id: { not: excludeRegistrationId } } : {}),
    },
    select: { status: true, optionsJson: true },
  })) as Array<{ status: string; optionsJson: unknown }>;
  return addonUsage(regs.map((r) => ({ status: r.status, options: r.optionsJson })));
}

/** Wolne sztuki per dodatek (tylko dodatki z limitem). Event bez dodatków → {} bez zapytania do bazy. */
export async function instanceAddonAvailability(
  db: Db,
  instanceId: string,
  cfg: PricingConfig | null,
  excludeRegistrationId?: string,
): Promise<Record<string, number>> {
  const defs = eventAddons(cfg);
  if (!defs.some((d) => Number(d.limit) > 0)) return {};
  return addonAvailability(defs, await instanceAddonUsage(db, instanceId, excludeRegistrationId));
}

/**
 * Blokada na czas transakcji: wszystkie zapisy dodatków jednego eventu idą po kolei
 * (`pg_advisory_xact_lock` — zwalnia się sama przy COMMIT / ROLLBACK). Dzięki temu dwa
 * równoczesne zgłoszenia nie zajmą tej samej ostatniej sztuki: drugie czeka, po czym
 * liczy zajętość już z pierwszym.
 *
 * Różnica względem limitu pokoi (`assertRoomStock`): tam sprawdzenie i zapis są osobnymi
 * operacjami bez blokady, więc przy równoczesnych zgłoszeniach limit pokoi może zostać
 * przekroczony o jedno zgłoszenie.
 */
export async function lockInstanceAddons(tx: Db, instanceId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'icpe-addons:' + instanceId}))`;
}

/**
 * Wywoływać W TRANSAKCJI, po `lockInstanceAddons`: przelicza zajętość i rzuca 409 z nazwą
 * dodatku (w języku gościa), gdy limit jest wyczerpany. 400 — gdy wybór łamie reguły dodatku.
 */
export async function assertAddonStock(
  tx: Db,
  instanceId: string,
  defs: AddonDef[],
  selection: AddonSelection,
  people: AddonPerson[],
  lng: string,
  opts: { excludeRegistrationId?: string; ignoreLimit?: boolean; adminOverride?: boolean } = {},
): Promise<void> {
  if (!Object.keys(selection).length) return;
  const available = addonAvailability(defs, await instanceAddonUsage(tx, instanceId, opts.excludeRegistrationId));
  const problems = validateAddonSelection(defs, selection, people, available, { ignoreLimit: opts.ignoreLimit, adminOverride: opts.adminOverride });
  if (!problems.length) return;
  const p = problems[0];
  const message = addonProblemMessage(p, defs, lng);
  if (p.code === 'SOLD_OUT') throw new ConflictException({ statusCode: 409, error: 'Conflict', message, code: 'ADDON_SOLD_OUT', addonId: p.addonId, available: p.allowed });
  throw new BadRequestException(message);
}
