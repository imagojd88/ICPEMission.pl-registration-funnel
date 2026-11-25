import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const nameOf = (contact: unknown): string => {
  const c = (contact ?? {}) as { firstName?: string; lastName?: string };
  return `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
};

/**
 * Panel admina: wgląd w pracę Recepcji — dziennik działań (`DeskActionLog`) i prośby dodatkowe
 * (`RegistrationRequest`) jednego eventu. Odczyt + zmiana statusu prośby. Sama Recepcja (/desk/*) bez zmian.
 */
@Injectable()
export class DeskAdminService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): Db {
    return this.prisma as Db;
  }

  private async assertInstance(instanceId: string) {
    const inst = await this.db.eventInstance.findUnique({ where: { id: instanceId }, select: { id: true } });
    if (!inst) throw new NotFoundException('Nie ma takiego wydarzenia.');
  }

  /** Imię i nazwisko zgłaszającego per zgłoszenie (zgłoszenie mogło zostać usunięte → brak wpisu). */
  private async registrantNames(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const uniq = [...new Set(ids.filter(Boolean))];
    if (!uniq.length) return map;
    const regs = (await this.db.registration.findMany({ where: { id: { in: uniq } }, select: { id: true, contact: true } })) as Array<{ id: string; contact: unknown }>;
    for (const r of regs) map.set(r.id, nameOf(r.contact));
    return map;
  }

  /** `GET /admin/instances/:id/desk-log?actor=&action=&page=&pageSize=` — od najnowszych, stronicowane. */
  async log(instanceId: string, q: { actor?: string; action?: string; page?: string | number; pageSize?: string | number }) {
    await this.assertInstance(instanceId);
    const pageSize = Math.min(200, Math.max(10, Math.trunc(Number(q.pageSize) || 50)));
    const page = Math.max(1, Math.trunc(Number(q.page) || 1));
    const actor = String(q.actor ?? '').trim().slice(0, 200);
    const action = String(q.action ?? '').trim().slice(0, 60);
    const where = { instanceId, ...(actor ? { actor } : {}), ...(action ? { action } : {}) };
    const [total, rows, actors, actions] = await Promise.all([
      this.db.deskActionLog.count({ where }) as Promise<number>,
      this.db.deskActionLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }) as Promise<
        Array<{ id: string; registrationId: string | null; action: string; actor: string; detail: unknown; createdAt: Date }>
      >,
      // Listy do filtrów — z całego dziennika eventu, nie tylko z bieżącej strony.
      this.db.deskActionLog.findMany({ where: { instanceId }, distinct: ['actor'], select: { actor: true }, orderBy: { actor: 'asc' } }) as Promise<Array<{ actor: string }>>,
      this.db.deskActionLog.findMany({ where: { instanceId }, distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }) as Promise<Array<{ action: string }>>,
    ]);
    const names = await this.registrantNames(rows.map((r) => r.registrationId ?? ''));
    return {
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      actors: actors.map((a) => a.actor),
      actions: actions.map((a) => a.action),
      items: rows.map((r) => {
        const d = (r.detail ?? {}) as { amount?: unknown; method?: unknown; kind?: unknown; via?: unknown };
        return {
          id: r.id,
          createdAt: iso(r.createdAt),
          actor: r.actor,
          action: r.action,
          registrationId: r.registrationId,
          registrant: r.registrationId ? names.get(r.registrationId) ?? null : null,
          // Tylko pola potrzebne do opisu wpisu (kwota i metoda wpłaty, rodzaj prośby, skąd wykonano).
          amount: typeof d.amount === 'number' ? d.amount : null,
          method: typeof d.method === 'string' ? d.method : null,
          kind: typeof d.kind === 'string' ? d.kind : null,
          via: typeof d.via === 'string' ? d.via : null,
        };
      }),
    };
  }

  /** `GET /admin/instances/:id/desk-requests?status=OPEN|DONE` — prośby dodatkowe eventu (najnowsze pierwsze). */
  async requests(instanceId: string, status?: string) {
    await this.assertInstance(instanceId);
    const s = String(status ?? '').toUpperCase();
    const rows = (await this.db.registrationRequest.findMany({
      where: { registration: { instanceId }, ...(s === 'OPEN' ? { status: { not: 'DONE' } } : s === 'DONE' ? { status: 'DONE' } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      include: {
        registration: { select: { id: true, status: true, contact: true, roomLabel: true, participants: { select: { id: true, firstName: true, lastName: true } } } },
      },
    })) as Array<{
      id: string; registrationId: string; participantId: string | null; kind: string; note: string; status: string;
      createdBy: string; createdAt: Date; resolvedBy: string | null; resolvedAt: Date | null;
      registration: { id: string; status: string; contact: unknown; roomLabel: string | null; participants: Array<{ id: string; firstName: string; lastName: string }> };
    }>;
    const all = (await this.db.registrationRequest.groupBy({ by: ['status'], where: { registration: { instanceId } }, _count: { _all: true } })) as Array<{ status: string; _count: { _all: number } }>;
    const done = all.filter((g) => g.status === 'DONE').reduce((n, g) => n + g._count._all, 0);
    const total = all.reduce((n, g) => n + g._count._all, 0);
    return {
      counts: { open: total - done, done, total },
      items: rows.map((r) => {
        const person = r.participantId ? r.registration.participants.find((p) => p.id === r.participantId) : null;
        return {
          id: r.id,
          registrationId: r.registrationId,
          registrant: nameOf(r.registration.contact),
          registrationStatus: r.registration.status,
          roomLabel: r.registration.roomLabel ?? null,
          /** osoba, której dotyczy prośba (gdy wskazano) */
          participant: person ? `${person.firstName} ${person.lastName}`.trim() : null,
          kind: r.kind,
          note: r.note,
          status: r.status === 'DONE' ? 'DONE' : 'OPEN',
          createdBy: r.createdBy,
          createdAt: iso(r.createdAt),
          resolvedBy: r.resolvedBy,
          resolvedAt: iso(r.resolvedAt),
        };
      }),
    };
  }

  /** `PATCH /admin/instances/:id/desk-requests/:requestId` — załatwiona / otwarta ponownie (wpis w dzienniku Recepcji). */
  async setRequestStatus(instanceId: string, requestId: string, status: string, actor: string) {
    if (status !== 'OPEN' && status !== 'DONE') throw new BadRequestException('Nieznany status prośby.');
    const q = (await this.db.registrationRequest.findFirst({
      where: { id: requestId, registration: { instanceId } },
      select: { id: true, registrationId: true, status: true },
    })) as { id: string; registrationId: string; status: string } | null;
    if (!q) throw new NotFoundException('Nie ma takiej prośby w tym wydarzeniu.');
    if (q.status !== status) {
      await this.db.registrationRequest.update({
        where: { id: q.id },
        data: status === 'DONE' ? { status, resolvedBy: actor, resolvedAt: new Date() } : { status, resolvedBy: null, resolvedAt: null },
      });
      try {
        await this.db.deskActionLog.create({
          data: { instanceId, registrationId: q.registrationId, action: status === 'DONE' ? 'REQUEST_DONE' : 'REQUEST_REOPEN', actor, detail: { requestId, via: 'panel' } },
        });
      } catch {
        /* dziennik nie może zablokować zmiany statusu */
      }
    }
    return { ok: true, id: q.id, status };
  }
}
