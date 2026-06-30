import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlacesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.place.findMany({ orderBy: { label: 'asc' } });
  }

  /** Tworzy miejsce; jeśli takie samo (label) już istnieje — zwraca istniejące (bez duplikatu). */
  async create(label: string) {
    const v = (label ?? '').trim();
    if (!v) return null;
    const existing = await this.prisma.place.findFirst({ where: { label: v } });
    if (existing) return existing;
    return this.prisma.place.create({ data: { label: v } });
  }

  async remove(id: string) {
    await this.prisma.place.delete({ where: { id } });
    return { ok: true };
  }
}
