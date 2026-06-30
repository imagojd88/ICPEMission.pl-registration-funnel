import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class UploadsService {
  constructor(private readonly prisma: PrismaService) {}

  async save(file?: UploadedFileLike): Promise<{ path: string; id: string }> {
    if (!file) throw new BadRequestException('Brak pliku');
    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Dozwolone tylko obrazki (image/*)');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Maksymalny rozmiar to 5 MB');
    }
    const rec = await this.prisma.upload.create({
      data: { mimeType: file.mimetype, size: file.size, data: file.buffer },
      select: { id: true },
    });
    return { path: `/uploads/${rec.id}`, id: rec.id };
  }

  /** Lista wgranych obrazków (do galerii w panelu) — bez danych binarnych. */
  async list(): Promise<Array<{ id: string; path: string; mimeType: string; size: number; createdAt: Date }>> {
    const rows = await this.prisma.upload.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, mimeType: true, size: true, createdAt: true },
    });
    return rows.map((r: { id: string; mimeType: string; size: number; createdAt: Date }) => ({
      id: r.id,
      path: `/uploads/${r.id}`,
      mimeType: r.mimeType,
      size: r.size,
      createdAt: r.createdAt,
    }));
  }

  async get(id: string): Promise<{ mimeType: string; data: Buffer }> {
    const rec = await this.prisma.upload.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Nie znaleziono pliku');
    return { mimeType: rec.mimeType, data: Buffer.from(rec.data as Uint8Array) };
  }
}
