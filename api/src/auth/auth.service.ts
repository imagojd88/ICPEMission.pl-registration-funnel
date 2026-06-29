import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Bootstrap produkcyjny: tworzy konto admina i token serwisowy z ENV,
   * jeśli baza jest pusta. Idempotentne (działa tylko gdy brak rekordów).
   */
  async ensureBootstrap(): Promise<void> {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (email && password && (await this.prisma.adminUser.count()) === 0) {
      await this.prisma.adminUser.create({
        data: { email, passwordHash: await argon2.hash(password), role: 'SUPER_ADMIN', locale: 'pl' },
      });
      this.logger.log(`Utworzono konto admina: ${email}`);
    }

    const svc = process.env.SERVICE_TOKEN;
    if (svc && (await this.prisma.serviceToken.count()) === 0) {
      await this.prisma.serviceToken.create({
        data: { name: 'personal-os', tokenHash: await argon2.hash(svc), scopes: ['admin:read', 'admin:write'] },
      });
      this.logger.log('Utworzono token serwisowy (Personal OS).');
    }
  }

  async loginAdmin(email: string, password: string) {
    const user = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const payload = { sub: user.id, email: user.email, role: user.role, realm: 'admin' };
    return {
      accessToken: this.jwt.sign(payload),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async validateServiceToken(token: string): Promise<{ scopes: string[] } | null> {
    const tokens = await this.prisma.serviceToken.findMany();
    for (const t of tokens) {
      try {
        const ok = await argon2.verify(t.tokenHash, token);
        if (ok) {
          await this.prisma.serviceToken.update({ where: { id: t.id }, data: { lastUsedAt: new Date() } });
          return { scopes: t.scopes };
        }
      } catch { /* skip */ }
    }
    return null;
  }
}
