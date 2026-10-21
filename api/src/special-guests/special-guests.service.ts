import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SavedGuestInput {
  id?: string;
  name?: Record<string, string>;
  bio?: Record<string, string>;
  photoUrl?: string;
  plural?: boolean;
}

/** Usuwa puste wpisy z mapy językowej. */
function clean(m: unknown): Record<string, string> {
  if (!m || typeof m !== 'object') return {};
  return Object.fromEntries(
    Object.entries(m as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'string' && v.trim())
      .map(([k, v]) => [k, (v as string).trim()]),
  );
}

/** Biblioteka gości specjalnych (wielokrotne użycie portretu i opisu w kolejnych eventach). */
@Injectable()
export class SpecialGuestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (this.prisma as any).savedGuest.findMany({ orderBy: { updatedAt: 'desc' } });
    return rows;
  }

  /**
   * Zapis gościa: z `id` → aktualizacja; bez `id` → jeśli w bibliotece jest już gość
   * o tym samym imieniu (PL) — aktualizujemy go (bez duplikatów), inaczej tworzymy nowego.
   */
  async save(dto: SavedGuestInput) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (this.prisma as any).savedGuest;
    const name = clean(dto.name);
    if (!Object.keys(name).length) return null;
    const data = {
      name,
      bio: clean(dto.bio),
      photoUrl: (dto.photoUrl ?? '').trim() || null,
      plural: !!dto.plural,
    };
    if (dto.id) {
      const found = await db.findUnique({ where: { id: dto.id } });
      if (found) return db.update({ where: { id: dto.id }, data });
    }
    const plName = (name.pl ?? Object.values(name)[0] ?? '').toLowerCase();
    const all: Array<{ id: string; name: Record<string, string> }> = await db.findMany();
    const same = all.find((g) => ((g.name?.pl ?? Object.values(g.name ?? {})[0] ?? '') as string).toLowerCase() === plName);
    if (same) return db.update({ where: { id: same.id }, data });
    return db.create({ data });
  }

  async remove(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (this.prisma as any).savedGuest;
    const found = await db.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Guest not found');
    await db.delete({ where: { id } });
    return { ok: true };
  }
}
