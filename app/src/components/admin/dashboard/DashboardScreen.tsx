import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import {
  getAdminInstances, getEventAnalytics, getEventDashboard, setEventTargetPeople,
  type EventAnalytics, type EventDashboard,
} from '@/lib/api'
import type { EventInstanceDto } from '@icpe/shared'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { isInternalBrowser, markInternalBrowserOnce, setInternalBrowser } from '@/lib/analytics'
import {
  AlertsCard, FunnelCard, HeadlineTiles, LodgingCard, MoneyCard, PaceCard, RecentCard, SourcesCard, type NavTarget,
} from './DashboardSections'
import { fmtDay, plural } from './labels'

/**
 * Dashboard JEDNEGO eventu: „Czy zdążymy?”, „Gdzie ludzie odpadają?”, „Skąd przychodzą?”,
 * „Ile mamy pieniędzy?”, „Co jest wyprzedane?” i „Co wymaga uwagi?”.
 * Liczby o ludziach, wpłatach i pokojach — z bazy (`GET /admin/instances/:id/dashboard`, co 60 s);
 * zachowanie na stronie — z PostHoga (`…/dashboard/analytics`, cache 5–15 min).
 */

const PICK_KEY = 'icpe.dashboard.instance'

function titleOf(t: unknown): string {
  if (typeof t === 'string') return t
  if (t && typeof t === 'object') {
    const m = t as Record<string, string>
    return m.pl ?? m.en ?? Object.values(m)[0] ?? ''
  }
  return ''
}

/** Domyślny event: zapamiętany wybór, inaczej najbliższy nadchodzący publiczny, inaczej ostatni. */
function defaultInstance(list: EventInstanceDto[]): string {
  try {
    const saved = window.localStorage.getItem(PICK_KEY)
    if (saved && list.some((i) => i.id === saved)) return saved
  } catch {
    /* brak storage */
  }
  const now = Date.now()
  const upcoming = list.filter((i) => new Date(i.endsAt).getTime() >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  return (upcoming.find((i) => !i.unlisted) ?? upcoming[0] ?? list[0])?.id ?? ''
}

function formatUpdatedAt(d: Date): string {
  return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function DashboardScreen({ onNavigate }: { onNavigate?: (s: NavTarget) => void }) {
  const [instances, setInstances] = useState<EventInstanceDto[]>([])
  const [instanceId, setInstanceId] = useState('')
  const [data, setData] = useState<EventDashboard | null>(null)
  const [analytics, setAnalytics] = useState<EventAnalytics | null>(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [loadingA, setLoadingA] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [internal, setInternal] = useState(() => {
    markInternalBrowserOnce() // panel otwarty = przeglądarka organizatora (chyba że wyłączył to niżej)
    return isInternalBrowser()
  })

  useEffect(() => {
    getAdminInstances()
      .then((list) => {
        const visible = list.filter((i) => !i.archived)
        setInstances(visible)
        setInstanceId(defaultInstance(visible))
        if (!visible.length) setLoading(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      })
  }, [])

  const load = useCallback(async (silent = false) => {
    if (!instanceId) return
    if (!silent) setLoading(true)
    try {
      setData(await getEventDashboard(instanceId))
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [instanceId])

  const loadAnalytics = useCallback(async (refresh = false) => {
    if (!instanceId) return
    setLoadingA(true)
    try {
      setAnalytics(await getEventAnalytics(instanceId, days, refresh))
    } catch {
      setAnalytics(null)
    } finally {
      setLoadingA(false)
    }
  }, [instanceId, days])

  useEffect(() => {
    setData(null)
    void load(false)
  }, [load])

  useEffect(() => {
    void loadAnalytics(false)
  }, [loadAnalytics])

  const { lastUpdatedAt, refreshing, refreshNow } = useAutoRefresh(() => load(true), { intervalMs: 60000 })

  const pick = (id: string) => {
    setInstanceId(id)
    setAnalytics(null)
    try {
      window.localStorage.setItem(PICK_KEY, id)
    } catch {
      /* brak storage */
    }
  }

  const sorted = useMemo(() => [...instances].sort((a, b) => b.startsAt.localeCompare(a.startsAt)), [instances])

  const saveTarget = async (v: number | null) => {
    if (!instanceId) return
    await setEventTargetPeople(instanceId, v)
    await load(true)
  }

  const toggleInternal = () => {
    setInternalBrowser(!internal)
    setInternal(!internal)
  }

  const ev = data?.event
  const state = !ev
    ? null
    : ev.registrationOpen
      ? { t: 'Zapisy otwarte', c: 'var(--ok)', bg: 'var(--ok-soft)' }
      : new Date(ev.registrationOpensAt).getTime() > Date.now() && ev.status !== 'CLOSED'
        ? { t: `Zapisy od ${fmtDay(ev.registrationOpensAt.slice(0, 10), true)}`, c: 'var(--warn)', bg: 'var(--warn-soft)' }
        : { t: 'Zapisy zamknięte', c: 'var(--muted)', bg: 'var(--border)' }

  return (
    <div className="flex flex-col gap-5">
      {/* Wybór eventu + odświeżanie */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={instanceId}
          onChange={(e) => pick(e.target.value)}
          className="px-3 py-2 rounded-[10px] text-sm font-semibold"
          style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', minWidth: 280 }}
          aria-label="Event"
        >
          {sorted.map((i) => (
            <option key={i.id} value={i.id}>
              {titleOf(i.title)} · {fmtDay(i.startsAt.slice(0, 10), true)}{i.unlisted ? ' · ukryty' : ''}{i.status === 'CLOSED' ? ' · zakończony' : ''}
            </option>
          ))}
        </select>
        {state && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: state.bg, color: state.c }}>{state.t}</span>
        )}
        {ev && ev.daysToEvent >= 0 && (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            do eventu {ev.daysToEvent} {plural(ev.daysToEvent, 'dzień', 'dni', 'dni')}
          </span>
        )}
        {ev?.slug && (
          <a href={`https://rejestracja.icpemission.pl/r/${ev.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--brand)' }}>
            Strona zapisów <ExternalLink size={12} />
          </a>
        )}
        <div className="flex-1" />
        {lastUpdatedAt && <span className="text-xs" style={{ color: 'var(--faint)' }}>Zaktualizowano {formatUpdatedAt(lastUpdatedAt)}</span>}
        <button
          type="button"
          onClick={() => {
            void refreshNow()
            void loadAnalytics(true)
          }}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-[8px]"
          style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
        >
          <RefreshCw size={13} className={refreshing || loadingA ? 'animate-spin' : undefined} /> Odśwież
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-[12px] text-sm" style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}>
          {error}
        </div>
      )}

      {!instances.length && !loading && !error && (
        <p className="text-sm" style={{ color: 'var(--faint)' }}>Nie ma jeszcze żadnego eventu.</p>
      )}

      {loading && !data && <p className="text-sm" style={{ color: 'var(--faint)' }}>Ładowanie…</p>}

      {data && (
        <>
          <AlertsCard alerts={data.alerts} onNavigate={onNavigate} />
          <HeadlineTiles d={data} a={analytics} />
          <PaceCard key={data.event.id} d={data} onSaveTarget={saveTarget} />
          <FunnelCard a={analytics} d={data} days={days} onDays={setDays} loading={loadingA} />
          <SourcesCard a={analytics} d={data} />
          <MoneyCard d={data} />
          <LodgingCard d={data} />
          <RecentCard d={data} onNavigate={onNavigate} />
        </>
      )}

      <p className="text-xs" style={{ color: 'var(--faint)' }}>
        Statystyki PostHog: ta przeglądarka {internal ? 'NIE jest liczona' : 'JEST liczona'} (Twoje testy na stronach zapisów{' '}
        {internal ? 'nie psują lejka' : 'trafiają do lejka'}).{' '}
        <button type="button" onClick={toggleInternal} className="underline" style={{ color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {internal ? 'Licz mnie jednak' : 'Nie licz tej przeglądarki'}
        </button>
        {' '}· Na telefonie wystarczy raz zalogować się do panelu.
      </p>
    </div>
  )
}
