import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { memberJwtSecret } from './course-utils';

export interface MemberRequest {
  headers: Record<string, string | undefined>;
  member?: { guestId: string; email: string };
}

/** JWT kursanta (realm 'member', osobny sekret). Dostęp do konkretnego kursu sprawdza serwis. */
@Injectable()
export class MemberAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<MemberRequest>();
    const h = req.headers['authorization'];
    if (!h?.startsWith('Bearer ')) throw new UnauthorizedException('Zaloguj się ponownie.');
    try {
      const p = this.jwt.verify<{ sub: string; email: string; realm: string }>(h.slice(7), { secret: memberJwtSecret() });
      if (p.realm !== 'member' || !p.sub) throw new Error('realm');
      req.member = { guestId: p.sub, email: p.email };
      return true;
    } catch {
      throw new UnauthorizedException('Sesja wygasła — zaloguj się ponownie.');
    }
  }
}
