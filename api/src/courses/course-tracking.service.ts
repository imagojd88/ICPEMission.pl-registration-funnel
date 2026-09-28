import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { pickText } from './course-utils';

export type CourseEventType =
  | 'LOGIN' | 'COURSE_VIEW' | 'VIDEO_PLAY' | 'PDF_OPEN' | 'PDF_DOWNLOAD' | 'EMAIL_LINK' | 'PASSWORD_SET' | 'RESET_REQUEST';

/** Długość odcinka filmu, z którego liczymy procent obejrzenia (unikalny czas, odporny na przewijanie). */
export const BUCKET_SEC = 10;
const COMPLETE_PCT = 90;

type Ev = { guestId: string; itemId: string | null; type: string; createdAt: Date; meta?: unknown };
type Prog = { itemId: string; guestId: string; percent: number; positionSec: number; durationSec: number | null; completedAt: Date | null; firstAt: Date; updatedAt: Date };

export const EVENT_LABEL: Record<string, string> = {
  LOGIN: 'Logowanie',
  COURSE_VIEW: 'Wejście do kursu',
  VIDEO_PLAY: 'Włączenie filmu',
  PDF_OPEN: 'Otwarcie PDF',
  PDF_DOWNLOAD: 'Pobranie PDF',
  EMAIL_LINK: 'Kliknięcie linku z maila',
  PASSWORD_SET: 'Ustawienie hasła',
  RESET_REQUEST: 'Prośba o link do hasła',
};

/**
 * Aktywność kursantów: zdarzenia (kto, co, kiedy) + postęp oglądania filmów.
 * Zapisy są „fire-and-forget" — błąd trackingu nigdy nie blokuje kursanta.
 */
@Injectable()
export class CourseTrackingService {
  private readonly logger = new Logger('CourseTracking');

  constructor(private readonly prisma: PrismaService) {}

  log(courseId: string | null | undefined, guestId: string | null | undefined, type: CourseEventType, itemId?: string | null, meta?: Record<string, unknown>) {
    if (!courseId || !guestId) return;
    void this.prisma.courseEvent
      .create({ data: { courseId, guestId, type, itemId: itemId ?? null, meta: (meta ?? undefined) as never } })
      .catch((e: Error) => this.logger.warn(`log ${type}: ${e.message}`));
  }

  /** Wejście do kursu — najwyżej raz na 30 min na osobę (odświeżenia strony nie zaśmiecają historii). */
  async logCourseView(courseId: string, guestId: string) {
    const recent = await this.prisma.courseEvent.findFirst({
      where: { courseId, guestId, type: 'COURSE_VIEW' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!recent || Date.now() - recent.createdAt.getTime() > 30 * 60 * 1000) this.log(courseId, guestId, 'COURSE_VIEW');
  }

  /**
   * Heartbeat z odtwarzacza: numery obejrzanych 10-sekundowych odcinków + pozycja.
   * Scalamy z zapisanymi (OR), więc powtórki i przewijanie nie zawyżają wyniku.
   */
  async recordProgress(courseId: string, itemId: string, guestId: string, body: { buckets?: unknown; position?: unknown; duration?: unknown }) {
    const duration = Math.round(Number(body.duration));
    if (!Number.isFinite(duration) || duration <= 0 || duration > 24 * 3600) throw new BadRequestException('Nieprawidłowa długość filmu');
    const count = Math.max(1, Math.ceil(duration / BUCKET_SEC));
    const idx = Array.isArray(body.buckets) ? body.buckets.slice(0, 5000) : [];
    const position = Math.max(0, Math.min(duration, Math.round(Number(body.position) || 0)));

    const existing = await this.prisma.videoProgress.findUnique({ where: { itemId_guestId: { itemId, guestId } } });
    const bits = (existing?.buckets ?? '').padEnd(count, '0').slice(0, count).split('');
    for (const v of idx) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 0 && n < count) bits[n] = '1';
    }
    const buckets = bits.join('');
    const ones = buckets.split('').filter((c) => c === '1').length;
    const percent = Math.min(100, Math.round((ones / count) * 100));
    const completedAt = existing?.completedAt ?? (percent >= COMPLETE_PCT ? new Date() : null);
    const data = { buckets, durationSec: duration, positionSec: position, percent, completedAt };
    if (existing) await this.prisma.videoProgress.update({ where: { id: existing.id }, data });
    else await this.prisma.videoProgress.create({ data: { courseId, itemId, guestId, ...data } });
    return { percent, completed: !!completedAt };
  }

  // ── Raporty dla panelu ─────────────────────────────────────────────────────

  private async loadCourseData(courseId: string) {
    const [items, enrollments, events, progress] = await Promise.all([
      this.prisma.courseItem.findMany({ where: { courseId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.courseEnrollment.findMany({ where: { courseId }, include: { guest: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.courseEvent.findMany({ where: { courseId }, select: { guestId: true, itemId: true, type: true, createdAt: true } }),
      this.prisma.videoProgress.findMany({ where: { courseId } }),
    ]);
    return { items, enrollments, events: events as Ev[], progress: progress as Prog[] };
  }

  async activity(courseId: string) {
    const { items, enrollments, events, progress } = await this.loadCourseData(courseId);
    const cols = (items as Array<{ id: string; kind: string; title: unknown; durationSec: number | null }>).map((i) => ({
      id: i.id, kind: i.kind, title: i.title, durationSec: i.durationSec,
    }));
    const rows = (enrollments as Array<{
      id: string; guestId: string; source: string; revokedAt: Date | null; createdAt: Date; lastSeenAt: Date | null;
      guest: { email: string; firstName: string; lastName: string; passwordHash: string | null; lastLoginAt: Date | null };
    }>).map((e) => {
      const ev = events.filter((x) => x.guestId === e.guestId);
      const last = ev.reduce<Date | null>((m, x) => (!m || x.createdAt > m ? x.createdAt : m), null);
      const perItem: Record<string, unknown> = {};
      for (const c of cols) {
        if (c.kind === 'VIDEO') {
          const p = progress.find((x) => x.itemId === c.id && x.guestId === e.guestId);
          const plays = ev.filter((x) => x.itemId === c.id && x.type === 'VIDEO_PLAY').length;
          perItem[c.id] = p || plays
            ? { percent: p?.percent ?? 0, completed: !!p?.completedAt, positionSec: p?.positionSec ?? 0, plays, lastAt: p?.updatedAt ?? null }
            : null;
        } else {
          const opened = ev.filter((x) => x.itemId === c.id && x.type === 'PDF_OPEN').length;
          const downloaded = ev.filter((x) => x.itemId === c.id && x.type === 'PDF_DOWNLOAD').length;
          perItem[c.id] = opened || downloaded ? { opened, downloaded } : null;
        }
      }
      return {
        enrollmentId: e.id,
        email: e.guest.email,
        firstName: e.guest.firstName,
        lastName: e.guest.lastName,
        source: e.source,
        active: !e.revokedAt,
        passwordSet: !!e.guest.passwordHash,
        logins: ev.filter((x) => x.type === 'LOGIN' || x.type === 'PASSWORD_SET').length,
        lastActivityAt: last ?? e.lastSeenAt,
        items: perItem,
      };
    });
    return { items: cols, rows };
  }

  async history(courseId: string, enrollmentId: string) {
    const e = await this.prisma.courseEnrollment.findFirst({ where: { id: enrollmentId, courseId }, include: { guest: true } });
    if (!e) return null;
    const [events, progress, items] = await Promise.all([
      this.prisma.courseEvent.findMany({ where: { courseId, guestId: e.guestId }, orderBy: { createdAt: 'desc' }, take: 500 }),
      this.prisma.videoProgress.findMany({ where: { courseId, guestId: e.guestId } }),
      this.prisma.courseItem.findMany({ where: { courseId }, select: { id: true, title: true, kind: true } }),
    ]);
    const title = (id: string | null) => {
      const it = (items as Array<{ id: string; title: unknown }>).find((i) => i.id === id);
      return it ? pickText(it.title, 'pl') : null;
    };
    return {
      person: { email: e.guest.email, firstName: e.guest.firstName, lastName: e.guest.lastName },
      videos: (progress as Prog[]).map((p) => ({
        itemId: p.itemId, title: title(p.itemId), percent: p.percent, completedAt: p.completedAt,
        positionSec: p.positionSec, durationSec: p.durationSec, firstAt: p.firstAt, lastAt: p.updatedAt,
      })),
      events: (events as Ev[]).map((x) => ({
        type: x.type, label: EVENT_LABEL[x.type] ?? x.type, itemId: x.itemId, itemTitle: title(x.itemId), meta: x.meta ?? null, at: x.createdAt,
      })),
    };
  }

  /** CSV (średniki + BOM — polski Excel otwiera bez kreatora importu). */
  async csv(courseId: string): Promise<string> {
    const { items, rows } = await this.activity(courseId);
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const fmt = (d: unknown) => (d ? new Date(d as string).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' }) : '');
    const header = ['Imię', 'Nazwisko', 'E-mail', 'Źródło', 'Dostęp aktywny', 'Hasło ustawione', 'Logowania', 'Ostatnia aktywność'];
    for (const c of items) {
      const tt = pickText(c.title, 'pl');
      if (c.kind === 'VIDEO') header.push(`${tt} — % obejrzenia`, `${tt} — ukończony`);
      else header.push(`${tt} — otwarcia`, `${tt} — pobrania`);
    }
    const lines = [header.map(esc).join(';')];
    for (const r of rows) {
      const line: unknown[] = [
        r.firstName, r.lastName, r.email, r.source === 'AUTO' ? 'z eventu' : 'ręcznie', r.active ? 'tak' : 'nie',
        r.passwordSet ? 'tak' : 'nie', r.logins, fmt(r.lastActivityAt),
      ];
      for (const c of items) {
        const v = r.items[c.id] as { percent?: number; completed?: boolean; opened?: number; downloaded?: number } | null;
        if (c.kind === 'VIDEO') line.push(v ? v.percent : 0, v?.completed ? 'tak' : 'nie');
        else line.push(v?.opened ?? 0, v?.downloaded ?? 0);
      }
      lines.push(line.map(esc).join(';'));
    }
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  /** Sprzątanie przy usuwaniu kursu / pozycji. */
  async purge(where: { courseId: string; itemId?: string }) {
    await Promise.all([
      this.prisma.courseEvent.deleteMany({ where }),
      this.prisma.videoProgress.deleteMany({ where }),
    ]);
  }
}
