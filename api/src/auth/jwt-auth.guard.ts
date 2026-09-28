import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';

interface RequestWithUser {
  headers: Record<string, string>;
  user?: unknown;
}

/**
 * Accepts either a valid JWT (realm=admin) or a raw SERVICE_TOKEN Bearer.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly authService: AuthService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException();
    const token = authHeader.slice(7);

    // Try JWT first — tylko realm 'admin'. Inne JWT (np. kursanci, realm 'member',
    // podpisywane osobnym sekretem) NIE mogą wejść na /admin/*, nawet gdyby sekret był wspólny.
    try {
      const result = (await super.canActivate(context)) as boolean;
      const user = req.user as { realm?: string } | undefined;
      if (result && user?.realm === 'admin') return true;
      req.user = undefined;
    } catch {
      // fall through
    }

    // Try service token
    const svc = await this.authService.validateServiceToken(token);
    if (svc) {
      req.user = { realm: 'service', scopes: svc.scopes };
      return true;
    }

    throw new UnauthorizedException();
  }
}
