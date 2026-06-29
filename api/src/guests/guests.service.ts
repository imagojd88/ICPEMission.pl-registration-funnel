import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';

@Injectable()
export class GuestsService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: { email: string; password?: string; firstName: string; lastName: string; phone?: string; locale?: string }) {
    const exists = await this.prisma.guestAccount.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');
    const passwordHash = dto.password ? await argon2.hash(dto.password) : null;
    return this.prisma.guestAccount.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        locale: dto.locale ?? 'pl',
      },
      select: { id: true, email: true, firstName: true, lastName: true, locale: true },
    });
  }

  async getMyRegistrations(guestId: string) {
    return this.prisma.registration.findMany({
      where: { guestId },
      include: { instance: true, participants: true, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateProfile(guestId: string, dto: { firstName?: string; lastName?: string; phone?: string; locale?: string }) {
    const guest = await this.prisma.guestAccount.findUnique({ where: { id: guestId } });
    if (!guest) throw new NotFoundException('Guest not found');
    return this.prisma.guestAccount.update({
      where: { id: guestId },
      data: dto,
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, locale: true },
    });
  }
}
