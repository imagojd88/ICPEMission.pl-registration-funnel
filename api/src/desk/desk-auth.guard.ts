import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { DeskScope, EVENT_STAFF_ROLE, effectiveDeskScopes, isFullAdminRole } from '../shared';

/**
 * Wymaganie dostępu do końcówki recepcji:
 *  - 'self'  — wystarczy zalogowanie (końcówki bez eventu w adresie, np. /desk/me),
 *  - 'any'   — jakikolwiek ważny grant na event z adresu,
 *  - 'admin' — tylko pełny admin,
 *  - zakres albo lista zakresów (wystarczy jeden) — pomocnik musi go mieć w grancie na ten event.
 * Końcówka BEZ tego dekoratora jest dla pomocnika zamknięta (domyślnie odmowa).
 */
export type DeskRequirement = 'self' | 'any' | 'admin' | DeskScope | DeskScope[];
export const DESK_ACCESS_KEY = 'desk:access';
export const DeskAccess = (req: DeskRequirement) => SetMetadata(DESK_ACCESS_KEY, req);

export interface DeskActor {
  sub: string;
  email: string;
  role: string;
  /** pełny admin (bez grantu, wszystkie zakresy) */
  full: boolean;
  /** zakresy obowiązujące na evencie z adresu (puste dla końcówek bez eventu u pomocnika) */
  scopes: DeskScope[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Guard całego /desk/*. Przyjmuje:
 *  - JWT panelu (realm 'admin') z pełną rolą — dostęp do każdego eventu,
 *  - JWT recepcji (realm 'desk', rola EVENT_STAFF) — tylko event z ważnym grantem i tylko
 *    końcówki z przyznanego zakresu; konto i grant sprawdzane w bazie przy KAŻDYM żądaniu
 *    (odebranie dostępu, wygaśnięcie i reset hasła działają od razu, nie po wygaśnięciu tokenu).
 * Token serwisowy (Personal OS) NIE ma wstępu do recepcji.
 */
@Injectable()
export class DeskAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; params?: Record<string, string>; desk?: DeskActor }>();
    const h = req.headers['authorization'];
    if (!h?.startsWith('Bearer ')) throw new UnauthorizedException();
    let p: { sub?: string; email?: string; role?: string; realm?: string; iat?: number };
    try {
      p = this.jwt.verify(h.slice(7));
    } catch {
      throw new UnauthorizedException();
    }
    if (!p?.sub || !p.email) throw new UnauthorizedException();

    const requirement = this.reflector.getAllAndOverride<DeskRequirement | undefined>(DESK_ACCESS_KEY, [context.getHandler(), context.getClass()]);
    const instanceId = req.params?.instanceId;

    // ── Pełny admin ──
    if (p.realm === 'admin' && isFullAdminRole(p.role)) {
      req.desk = { sub: p.sub, email: p.email, role: String(p.role), full: true, scopes: effectiveDeskScopes(p.role, null) };
      return true;
    }

    // ── Pomocnik eventu ──
    if (p.realm !== 'desk' || p.role !== EVENT_STAFF_ROLE) throw new UnauthorizedException();
    const db = this.prisma as Db;
    const user = (await db.adminUser.findUnique({ where: { id: p.sub }, select: { id: true, email: true, role: true, updatedAt: true } })) as
      | { id: string; email: string; role: string; updatedAt: Date }
      | null;
    if (!user || user.role !== EVENT_STAFF_ROLE) throw new UnauthorizedException();
    // Reset hasła (zmiana konta) unieważnia wcześniej wydane tokeny pomocnika.
    if (typeof p.iat !== 'number' || p.iat * 1000 < user.updatedAt.getTime() - 1000) throw new UnauthorizedException();

    if (!requirement || requirement === 'admin') throw new ForbiddenException('Brak uprawnień do tej akcji.');
    if (requirement === 'self') {
      if (instanceId) throw new ForbiddenException('Brak uprawnień do tej akcji.');
      req.desk = { sub: user.id, email: user.email, role: EVENT_STAFF_ROLE, full: false, scopes: [] };
      return true;
    }
    if (!instanceId) throw new ForbiddenException('Brak uprawnień do tej akcji.');
    const grant = (await db.eventStaffGrant.findUnique({
      where: { adminUserId_instanceId: { adminUserId: user.id, instanceId } },
      select: { scopes: true, expiresAt: true },
    })) as { scopes: string[]; expiresAt: Date | null } | null;
    const scopes = effectiveDeskScopes(EVENT_STAFF_ROLE, grant);
    if (scopes.length === 0) throw new ForbiddenException('Brak dostępu do tego wydarzenia.');
    if (requirement !== 'any') {
      const need = Array.isArray(requirement) ? requirement : [requirement];
      if (!need.some((s) => scopes.includes(s))) throw new ForbiddenException('Brak uprawnień do tej akcji.');
    }
    req.desk = { sub: user.id, email: user.email, role: EVENT_STAFF_ROLE, full: false, scopes };
    return true;
  }
}
