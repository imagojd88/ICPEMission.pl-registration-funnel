import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, ChevronLeft, KeyRound, RefreshCw, Search, WifiOff, X } from 'lucide-react'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { DeskError, deskOverview, type DeskOverview, type DeskRegistration } from '@/lib/deskApi'
import DeskCard from './DeskCard'
import { Notice, Pill, fieldStyle, fmtDateRange, fmtMoney, fmtTime, fold, titleOf } from './deskUi'

type Filter = 'all' | 'absent' | 'unpaid' | 'requests'

function Tile({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'ok' | 'warn' | 'brand' }) {
  return (
    <div className="rounded-[14px] px-3 py-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="text-xl font-bold leading-tight mt-0.5" style={{ color: tone ? `var(--${tone})` : 'var(--ink)' }}>{value}</p>
      {sub ? <p className="text-xs mt-0.5" style={{ color: 'var(--faint)' }}>{sub}</p> : null}
    </div>
  )
}

const openRequests = (r: DeskRegistration) => r.requests.filter((q) => q.status === 'OPEN').length

/** Ekran eventu: liczniki, wyszukiwarka, filtry, lista zgłoszeń z rozwijaną kartą. Odświeżanie co 30 s. */
export default function DeskEvent({ instanceId, showBack }: { instanceId: string; showBack: boolean }) {
  const { t, i18n } = useTranslation()
  const lng = i18n.language
  const [data, setData] = useState<DeskOverview | null>(null)
  const [fatal, setFatal] = useState<'forbidden' | 'notfound' | 'server' | null>(null)
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)
  const [lastOk, setLastOk] = useState<Date | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await deskOverview(instanceId)
      setData(d)
      setFatal(null)
      setOffline(false)
      setLastOk(new Date())
    } catch (e) {
      const kind = e instanceof DeskError ? e.kind : 'server'
      if (kind === 'offline') setOffline(true)
      else if (kind === 'forbidden' || kind === 'notfound') {
        // odebrany albo wygasły dostęp: dane gości znikają z ekranu od razu
        setData(null)
        setFatal(kind)
      }
      else if (kind === 'server') setFatal((prev) => prev ?? 'server')
      // 'auth': token został wyczyszczony, strona pokaże logowanie
      throw e
    }
  }, [instanceId])

  const { refreshing, refreshNow } = useAutoRefresh(load, { intervalMs: 30000 })

  useEffect(() => {
    void refreshNow()
  }, [refreshNow, instanceId])

  useEffect(() => {
    const on = () => void refreshNow()
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [refreshNow])

  const regs = useMemo(() => data?.registrations ?? [], [data])
  const withMoney = !!data?.me.scopes.includes('payments')
  const currency = data?.counters.currency ?? 'PLN'

  // Liczniki liczone z listy, żeby zmieniały się od razu po akcji (bez czekania na odświeżenie).
  const c = useMemo(() => {
    const arrived = regs.filter((r) => !!r.checkedInAt)
    return {
      regs: regs.length,
      regsArrived: arrived.length,
      people: regs.reduce((s, r) => s + r.people.length, 0),
      peopleArrived: arrived.reduce((s, r) => s + r.people.length, 0),
      toPay: Math.round(regs.reduce((s, r) => s + (r.money?.remaining ?? 0), 0) * 100) / 100,
      toPayCount: regs.filter((r) => (r.money?.remaining ?? 0) > 0).length,
      keysIssued: regs.filter((r) => !!r.key.issuedAt).length,
      keysOut: regs.filter((r) => !!r.key.issuedAt && !r.key.returnedAt).length,
      requestsOpen: regs.reduce((s, r) => s + openRequests(r), 0),
    }
  }, [regs])

  const shown = useMemo(() => {
    const q = fold(search.trim())
    return regs.filter((r) => {
      if (filter === 'absent' && r.checkedInAt) return false
      if (filter === 'unpaid' && !((r.money?.remaining ?? 0) > 0)) return false
      if (filter === 'requests' && openRequests(r) === 0) return false
      if (!q) return true
      const hay = fold(
        [r.contact.lastName, r.contact.firstName, r.contact.lastName, r.contact.email, r.id, r.roomLabel ?? '', ...r.people.map((p) => `${p.firstName} ${p.lastName} ${p.firstName}`)].join(' '),
      )
      return q.split(/\s+/).every((part) => hay.includes(part))
    })
  }, [regs, search, filter])

  function applyUpdate(next: DeskRegistration) {
    setData((d) => (d ? { ...d, registrations: d.registrations.map((r) => (r.id === next.id ? next : r)) } : d))
    void refreshNow()
  }

  if (!data) {
    if (fatal === 'forbidden' || fatal === 'notfound') {
      return (
        <div className="flex flex-col gap-4">
          <Notice tone="err">{t(fatal === 'forbidden' ? 'desk.errors.no_access' : 'desk.errors.notfound')}</Notice>
          <Link to="/recepcja" className="font-semibold" style={{ color: 'var(--brand)' }}>
            ← {t('desk.top.events')}
          </Link>
        </div>
      )
    }
    if (offline) return <Notice tone="warn">{t('desk.offline.first_load')}</Notice>
    if (fatal === 'server') return <Notice tone="err">{t('desk.errors.server')}</Notice>
    return <p className="text-sm py-8 text-center" style={{ color: 'var(--faint)' }}>{t('desk.common.loading')}</p>
  }

  const filters: Array<{ id: Filter; label: string; n: number }> = [
    { id: 'all', label: t('desk.filter.all'), n: c.regs },
    { id: 'absent', label: t('desk.filter.absent'), n: c.regs - c.regsArrived },
    ...(withMoney ? [{ id: 'unpaid' as Filter, label: t('desk.filter.unpaid'), n: c.toPayCount }] : []),
    { id: 'requests', label: t('desk.filter.requests'), n: regs.filter((r) => openRequests(r) > 0).length },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div>
        {showBack && (
          <Link to="/recepcja" className="inline-flex items-center gap-1 text-sm font-semibold mb-1" style={{ color: 'var(--brand)' }}>
            <ChevronLeft size={16} /> {t('desk.top.events')}
          </Link>
        )}
        <h1 className="font-bold leading-tight" style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: 24, color: 'var(--ink)' }}>
          {titleOf(data.event.title, lng)}
        </h1>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {[fmtDateRange(data.event.startsAt, data.event.endsAt, lng), data.event.location].filter(Boolean).join(' · ')}
        </p>
      </div>

      {offline && (
        <Notice tone="warn">
          <span className="inline-flex items-start gap-2">
            <WifiOff size={18} className="shrink-0 mt-0.5" />
            <span>{t('desk.offline.banner', { time: lastOk ? fmtTime(lastOk, lng) : '—' })}</span>
          </span>
        </Notice>
      )}

      {/* Liczniki */}
      <div className="grid grid-cols-2 gap-2">
        <Tile
          label={t('desk.counters.arrived')}
          tone="ok"
          value={t('desk.counters.x_of_y', { a: c.regsArrived, b: c.regs })}
          sub={`${t('desk.counters.regs')} · ${t('desk.counters.people_x_of_y', { a: c.peopleArrived, b: c.people })}`}
        />
        {withMoney ? (
          <Tile label={t('desk.counters.to_pay')} tone={c.toPay > 0 ? 'warn' : 'ok'} value={fmtMoney(c.toPay, currency, lng)} sub={t('desk.counters.regs_n', { n: c.toPayCount })} />
        ) : (
          <Tile label={t('desk.counters.people')} value={t('desk.counters.x_of_y', { a: c.peopleArrived, b: c.people })} sub={t('desk.counters.on_site')} />
        )}
        <Tile label={t('desk.counters.keys')} value={c.keysIssued} sub={t('desk.counters.keys_out', { n: c.keysOut })} />
        <Tile label={t('desk.counters.requests')} tone={c.requestsOpen > 0 ? 'warn' : undefined} value={c.requestsOpen} />
      </div>

      {/* Szukaj */}
      <div className="relative">
        <Search size={18} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--faint)' }} />
        <input
          type="search"
          inputMode="search"
          autoComplete="off"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('desk.search.placeholder')}
          aria-label={t('desk.search.placeholder')}
          style={{ ...fieldStyle, paddingLeft: 42, paddingRight: 44 }}
        />
        {search && (
          <button type="button" aria-label={t('desk.search.clear')} onClick={() => setSearch('')} style={{ position: 'absolute', right: 4, top: 4, width: 40, height: 40, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* Filtry */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className="shrink-0 rounded-full px-4 font-semibold text-sm"
            style={{
              minHeight: 42,
              cursor: 'pointer',
              background: filter === f.id ? 'var(--brand)' : 'var(--surface)',
              color: filter === f.id ? '#fff' : 'var(--ink)',
              border: `1px solid ${filter === f.id ? 'var(--brand)' : 'var(--border)'}`,
            }}
          >
            {f.label} ({f.n})
          </button>
        ))}
      </div>

      {/* Stan odświeżania */}
      <div className="flex items-center justify-between text-xs" style={{ color: 'var(--faint)' }}>
        <span>{lastOk ? t('desk.top.updated', { time: fmtTime(lastOk, lng) }) : ''}</span>
        <button type="button" onClick={() => void refreshNow()} className="inline-flex items-center gap-1 font-semibold" style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', minHeight: 36 }}>
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {t('desk.top.refresh')}
        </button>
      </div>

      {/* Lista */}
      {shown.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--faint)' }}>
          {regs.length === 0 ? t('desk.list.empty') : t('desk.list.none_match')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((r) => {
            const open = openId === r.id
            const nReq = openRequests(r)
            return (
              <li key={r.id} className="rounded-[16px] overflow-hidden" style={{ background: 'var(--surface)', border: `1px solid ${open ? 'var(--brand)' : 'var(--border)'}` }}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="w-full text-left px-4 py-3 flex items-start gap-3"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', minHeight: 64 }}
                >
                  <span
                    className="shrink-0 inline-flex items-center justify-center rounded-full mt-0.5"
                    style={{ width: 28, height: 28, background: r.checkedInAt ? 'var(--ok)' : 'transparent', border: r.checkedInAt ? 'none' : '2px solid var(--border)', color: '#fff' }}
                    aria-label={r.checkedInAt ? t('desk.badge.arrived') : t('desk.badge.absent')}
                  >
                    {r.checkedInAt ? <Check size={16} /> : null}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold truncate" style={{ color: 'var(--ink)', fontSize: 17 }}>
                      {r.contact.lastName} {r.contact.firstName}
                    </span>
                    <span className="block text-sm truncate" style={{ color: 'var(--muted)' }}>
                      {t('desk.list.people', { n: r.people.length })} · {t('desk.card.room')}: {r.roomLabel || t('desk.list.no_room')}
                    </span>
                    <span className="flex flex-wrap gap-1.5 mt-1.5">
                      {r.money && r.money.remaining > 0 && <Pill tone={r.money.overdue > 0 ? 'err' : 'warn'}>{t('desk.badge.due', { amount: fmtMoney(r.money.remaining, r.money.currency, lng) })}</Pill>}
                      {r.money && r.money.remaining <= 0 && r.money.total > 0 && <Pill tone="ok">{t('desk.money.settled')}</Pill>}
                      {r.key.issuedAt && !r.key.returnedAt && (
                        <Pill tone="brand">
                          <KeyRound size={12} /> {t('desk.badge.key_out')}
                        </Pill>
                      )}
                      {r.key.returnedAt && <Pill tone="muted">{t('desk.badge.key_back')}</Pill>}
                      {nReq > 0 && <Pill tone="warn">{t('desk.badge.requests', { n: nReq })}</Pill>}
                    </span>
                  </span>
                  <ChevronDown size={20} className="shrink-0 mt-1" style={{ color: 'var(--faint)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
                </button>
                {open && <DeskCard instanceId={instanceId} reg={r} scopes={data.me.scopes} full={data.me.full} onUpdated={applyUpdate} onOffline={() => setOffline(true)} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
