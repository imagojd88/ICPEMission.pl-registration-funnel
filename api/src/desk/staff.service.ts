import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { EVENT_STAFF_ROLE, deskGrantExpired, normalizeDeskScopes } from '../shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Alfabet bez znaków łatwych do pomylenia (0/O, 1/l/I). */
const PASS_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Hasło tymczasowe: 3 grupy po 4 znaki (ok. 69 bitów), łatwe do przepisania z ekranu. */
export function tempPassword(): string {
  const group = () => Array.from({ length: 4 }, () => PASS_ALPHABET[randomInt(PASS_ALPHABET.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}

interface GrantRow {
  id: string;
  scopes: string[];
  createdBy: string;
  createdAt: Date;
  expiresAt: Date | null;
  adminUser: { email: string };
}

const GRANT_SELECT = { id: true, scopes: true, createdBy: true, createdAt: true, expiresAt: true, adminUser: { select: { email: true } } };

/** Zarządzanie pomocnikami eventu (panel admina ▸ Edytuj event ▸ Pomocnicy). */
@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): Db {
    return this.prisma as Db;
  }

  private view(g: GrantRow) {
    return {
      id: g.id,
      email: g.adminUser.email,
      scopes: normalizeDeskScopes(g.scopes),
      createdBy: g.createdBy,
      createdAt: g.createdAt.toISOString(),
      expiresAt: g.expiresAt ? g.expiresAt.toISOString() : null,
      expired: deskGrantExpired(g.expiresAt),
    };
  }

  private parseExpiry(v: unknown): Date | null | undefined {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const s = String(v);
    // Sama data = do końca tego dnia (czas serwera UTC; zapas kilku godzin nie szkodzi).
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T23:59:59.000Z`) : new Date(s);
    if (!Number.isFinite(d.getTime())) throw new BadRequestException('Nieprawidłowa data wygaśnięcia.');
    return d;
  }

  private scopesOrThrow(v: unknown) {
    const scopes = normalizeDeskScopes(v);
    if (scopes.length === 0) throw new BadRequestException('Wybierz co najmniej jeden zakres dostępu.');
    return scopes;
  }

  async list(instanceId: string) {
    const rows = (await this.db.eventStaffGrant.findMany({ where: { instanceId }, select: GRANT_SELECT, orderBy: { createdAt: 'asc' } })) as GrantRow[];
    return rows.map((g) => this.view(g));
  }

  /**
   * Dodaje pomocnika do eventu. Nowy e-mail → konto EVENT_STAFF z losowym hasłem tymczasowym,
   * zwracanym TYLKO w tej odpowiedzi (w bazie jest wyłącznie hash argon2, jak u adminów).
   * Istniejące konto pomocnika → dochodzi grant na ten event, hasło bez zmian.
   * Konto z pełną rolą nie może zostać pomocnikiem (ma już dostęp do wszystkiego).
   * System nie wysyła tu żadnego maila.
   */
  async add(instanceId: string, dto: { email?: string; scopes?: unknown; expiresAt?: unknown }, actor: string) {
    const email = String(dto?.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) throw new BadRequestException('Podaj poprawny adres e-mail.');
    const scopes = this.scopesOrThrow(dto?.scopes);
    const expiresAt = this.parseExpiry(dto?.expiresAt) ?? null;
    const inst = await this.db.eventInstance.findUnique({ where: { id: instanceId }, select: { id: true } });
    if (!inst) throw new NotFoundException('Instance not found');

    let user = (await this.db.adminUser.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, role: true } })) as
      | { id: string; role: string }
      | null;
    let password: string | null = null;
    if (user && user.role !== EVENT_STAFF_ROLE) {
      throw new ConflictException('Ten adres ma już konto administratora z pełnym dostępem — nie wymaga dodawania jako pomocnik.');
    }
    if (!user) {
      password = tempPassword();
      user = (await this.db.adminUser.create({
        data: { email, passwordHash: await argon2.hash(password), role: EVENT_STAFF_ROLE, locale: 'pl' },
        select: { id: true, role: true },
      })) as { id: string; role: string };
    }
    const existing = await this.db.eventStaffGrant.findUnique({ where: { adminUserId_instanceId: { adminUserId: user.id, instanceId } }, select: { id: true } });
    if (existing) throw new ConflictException('Ta osoba jest już pomocnikiem tego wydarzenia — zmień jej zakresy na liście.');
    const grant = (await this.db.eventStaffGrant.create({
      data: { adminUserId: user.id, instanceId, scopes, createdBy: actor, expiresAt },
      select: GRANT_SELECT,
    })) as GrantRow;
    return { grant: this.view(grant), accountCreated: !!password, tempPassword: password };
  }

  private async grantOf(instanceId: string, grantId: string) {
    const g = (await this.db.eventStaffGrant.findFirst({ where: { id: grantId, instanceId }, select: { id: true, adminUserId: true } })) as
      | { id: string; adminUserId: string }
      | null;
    if (!g) throw new NotFoundException('Nie ma takiego pomocnika w tym wydarzeniu.');
    return g;
  }

  async update(instanceId: string, grantId: string, dto: { scopes?: unknown; expiresAt?: unknown }) {
    const g = await this.grantOf(instanceId, grantId);
    const data: { scopes?: string[]; expiresAt?: Date | null } = {};
    if (dto?.scopes !== undefined) data.scopes = this.scopesOrThrow(dto.scopes);
    const exp = this.parseExpiry(dto?.expiresAt);
    if (exp !== undefined) data.expiresAt = exp;
    const row = (await this.db.eventStaffGrant.update({ where: { id: g.id }, data, select: GRANT_SELECT })) as GrantRow;
    return this.view(row);
  }

  /** Odebranie dostępu do eventu. Konto zostaje (może mieć granty na inne eventy); bez grantu nie widzi nic. */
  async remove(instanceId: string, grantId: string) {
    const g = await this.grantOf(instanceId, grantId);
    await this.db.eventStaffGrant.delete({ where: { id: g.id } });
    return { ok: true };
  }

  /** Nowe hasło tymczasowe (pokazywane raz). Zmiana konta unieważnia wcześniejsze sesje pomocnika. */
  async resetPassword(instanceId: string, grantId: string) {
    const g = await this.grantOf(instanceId, grantId);
    const user = (await this.db.adminUser.findUnique({ where: { id: g.adminUserId }, select: { id: true, role: true, email: true } })) as
      | { id: string; role: string; email: string }
      | null;
    if (!user || user.role !== EVENT_STAFF_ROLE) throw new BadRequestException('Hasło można zresetować tylko kontu pomocnika.');
    const password = tempPassword();
    await this.db.adminUser.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(password) } });
    return { email: user.email, tempPassword: password };
  }
}
