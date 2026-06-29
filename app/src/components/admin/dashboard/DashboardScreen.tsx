import { useEffect, useState } from 'react'
import {
  CalendarDays,
  UserPlus,
  TrendingUp,
  BedDouble,
} from 'lucide-react'
import {
  getAdminSummary,
  getAdminInstances,
  getAdminRegistrations,
} from '@/lib/api'
import type { AdminSummaryDto, EventInstanceDto, RegistrationDto } from '@icpe/shared'

// ── KPI Tile ─────────────────────────────────────────────────────────────────

interface KpiTileProps {
  label: string
  value: string
  delta?: string
  deltaPositive?: boolean
  icon: React.ElementType
}

function KpiTile({ label, value, delta, deltaPositive = true, icon: Icon }: KpiTileProps) {
  return (
    <div
      className="flex flex-col gap-3 p-5 rounded-[15px] border"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}
    >
      <div className="flex items-start justify-between">
        <div
          className="flex items-center justify-center rounded-[11px]"
          style={{ width: 44, height: 44, background: 'var(--brand-soft)' }}
        >
          <Icon size={20} style={{ color: 'var(--brand)' }} />
        </div>
        {delta && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{
              background: deltaPositive ? 'var(--ok-soft)' : 'var(--err-soft)',
              color: deltaPositive ? 'var(--ok)' : 'var(--err)',
            }}
          >
            {delta}
          </span>
        )}
      </div>
      <div>
        <p className="text-xs font-medium mb-1" style={{ color: 'var(--faint)' }}>
          {label}
        </p>
        <p
          className="font-bold leading-none"
          style={{
            fontFamily: 'Newsreader, Georgia, serif',
            fontSize: 27,
            color: 'var(--ink)',
            whiteSpace: 'nowrap',
          }}
        >
          {value}
        </p>
      </div>
    </div>
  )
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────

const TREND_DATA = [8, 12, 6, 15, 18, 22, 14, 9, 17, 20, 25, 18, 28, 32]

function TrendChart() {
  const maxVal = Math.max(...TREND_DATA)
  const chartH = 120
  const barW = 18
  const gap = 6
  const paddingLeft = 32
  const paddingBottom = 24
  const totalW = paddingLeft + TREND_DATA.length * (barW + gap) - gap + 8

  const ticks = [0, Math.round(maxVal / 2), maxVal]

  return (
    <div
      className="p-5 rounded-[15px] border"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}
    >
      <p className="font-bold text-base mb-4" style={{ color: 'var(--ink)' }}>
        Trend zgłoszeń
      </p>
      <div style={{ overflowX: 'auto' }}>
        <svg
          viewBox={`0 0 ${totalW} ${chartH + paddingBottom}`}
          style={{ width: '100%', minWidth: totalW, height: chartH + paddingBottom }}
        >
          {ticks.map((tick) => {
            const y = chartH - (tick / maxVal) * chartH
            return (
              <g key={tick}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={totalW}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth={1}
                  strokeDasharray="3,3"
                />
                <text
                  x={paddingLeft - 4}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={9}
                  fill="var(--faint)"
                >
                  {tick}
                </text>
              </g>
            )
          })}

          {TREND_DATA.map((val, i) => {
            const barH = Math.max(4, (val / maxVal) * chartH)
            const x = paddingLeft + i * (barW + gap)
            const y = chartH - barH
            const isRecent = i >= TREND_DATA.length - 3
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={4}
                  fill={isRecent ? 'var(--accent)' : i % 2 === 0 ? 'var(--brand)' : 'var(--brand-soft)'}
                  opacity={isRecent ? 1 : 0.8}
                />
                <text
                  x={x + barW / 2}
                  y={chartH + paddingBottom - 6}
                  textAnchor="middle"
                  fontSize={8}
                  fill="var(--faint)"
                >
                  {i + 1}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <p className="mt-1 text-xs" style={{ color: 'var(--faint)' }}>
        Ostatnie 14 dni
      </p>
    </div>
  )
}

// ── Nearest Events ────────────────────────────────────────────────────────────

function statusStyle(status: string): { background: string; color: string } {
  switch (status) {
    case 'ok':
    case 'OPEN':
      return { background: 'var(--ok-soft)', color: 'var(--ok)' }
    case 'warn':
    case 'DRAFT':
      return { background: 'var(--warn-soft)', color: 'var(--warn)' }
    case 'err':
    case 'CLOSED':
    case 'ARCHIVED':
      return { background: 'var(--err-soft)', color: 'var(--err)' }
    default:
      return { background: 'var(--surface-3)', color: 'var(--ink)' }
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'OPEN': return 'Otwarty'
    case 'DRAFT': return 'Wkrótce'
    case 'CLOSED': return 'Zamknięty'
    case 'ARCHIVED': return 'Archiwalny'
    default: return status
  }
}

function resolveTitle(title: unknown): string {
  if (typeof title === 'string') return title
  if (title && typeof title === 'object') {
    const t = title as Record<string, string>
    return t.pl ?? t.en ?? t.it ?? ''
  }
  return ''
}

function NearestEvents({ instances, loading }: { instances: EventInstanceDto[]; loading: boolean }) {
  return (
    <div
      className="p-5 rounded-[15px] border h-full"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}
    >
      <p className="font-bold text-base mb-4" style={{ color: 'var(--ink)' }}>
        Najbliższe terminy
      </p>
      {loading ? (
        <p className="text-sm" style={{ color: 'var(--faint)' }}>Ładowanie...</p>
      ) : instances.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--faint)' }}>Brak otwartych eventów</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {instances.slice(0, 5).map((ev) => {
            const d = new Date(ev.startsAt)
            const day = d.getDate().toString()
            const month = d.toLocaleDateString('pl-PL', { month: 'short' }).replace('.', '')
            const name = resolveTitle(ev.title)
            return (
              <li key={ev.id} className="flex items-center gap-3">
                <div
                  className="flex flex-col items-center justify-center rounded-[10px] shrink-0"
                  style={{ width: 44, height: 44, background: 'var(--brand-soft)' }}
                >
                  <span className="font-bold leading-none" style={{ fontSize: 17, color: 'var(--brand)' }}>
                    {day}
                  </span>
                  <span className="text-xs uppercase" style={{ color: 'var(--brand)', fontSize: 9 }}>
                    {month}
                  </span>
                </div>
                <p className="flex-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {name}
                </p>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={statusStyle(ev.status)}
                >
                  {statusLabel(ev.status)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Recent Registrations Table ────────────────────────────────────────────────

interface RegistrationRow {
  id: string
  name: string
  email: string
  event: string
  people: number
  amount: string
  status: 'ok' | 'warn' | 'err'
  statusLabel: string
}

function buildRows(regs: RegistrationDto[], instanceTitle: string): RegistrationRow[] {
  return regs.slice(0, 5).map((r) => {
    let status: 'ok' | 'warn' | 'err' = 'warn'
    let sl = 'Oczekuje'
    if (r.paymentStatus === 'PAID') { status = 'ok'; sl = 'Opłacone' }
    else if (r.status === 'WAITLIST') { status = 'err'; sl = 'Lista oczek.' }
    return {
      id: r.id,
      name: `${r.contact.firstName} ${r.contact.lastName}`,
      email: r.contact.email,
      event: instanceTitle,
      people: r.participants.length,
      amount: `${r.totalPrice} zł`,
      status,
      statusLabel: sl,
    }
  })
}

function RecentRegistrations({
  regs,
  loading,
  instanceTitle,
}: {
  regs: RegistrationDto[]
  loading: boolean
  instanceTitle: string
}) {
  const rows = buildRows(regs, instanceTitle)

  return (
    <div
      className="rounded-[15px] border"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}
    >
      <div className="px-5 pt-5 pb-3">
        <p className="font-bold text-base" style={{ color: 'var(--ink)' }}>
          Ostatnie zgłoszenia
        </p>
      </div>
      {loading ? (
        <div className="px-5 pb-5">
          <p className="text-sm" style={{ color: 'var(--faint)' }}>Ładowanie...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 pb-5">
          <p className="text-sm" style={{ color: 'var(--faint)' }}>Brak zgłoszeń</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Zgłaszający', 'Event', 'Osoby', 'Kwota', 'Status'].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-2.5 text-left font-semibold text-xs"
                    style={{ color: 'var(--faint)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: idx < rows.length - 1 ? '1px solid var(--border-2)' : undefined,
                  }}
                  className="hover:bg-[var(--surface-2)] transition-colors"
                >
                  <td className="px-5 py-3">
                    <p className="font-medium" style={{ color: 'var(--ink)' }}>{row.name}</p>
                    <p className="text-xs" style={{ color: 'var(--faint)' }}>{row.email}</p>
                  </td>
                  <td className="px-5 py-3" style={{ color: 'var(--muted)' }}>
                    {row.event}
                  </td>
                  <td className="px-5 py-3 text-center" style={{ color: 'var(--ink)' }}>
                    {row.people}
                  </td>
                  <td className="px-5 py-3 font-medium" style={{ color: 'var(--ink)' }}>
                    {row.amount}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={statusStyle(row.status)}
                    >
                      {row.statusLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Dashboard Screen ──────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const [summary, setSummary] = useState<AdminSummaryDto | null>(null)
  const [instances, setInstances] = useState<EventInstanceDto[]>([])
  const [regs, setRegs] = useState<RegistrationDto[]>([])
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingInstances, setLoadingInstances] = useState(true)
  const [loadingRegs, setLoadingRegs] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoadingSummary(true)
    getAdminSummary()
      .then(setSummary)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingSummary(false))

    setLoadingInstances(true)
    getAdminInstances('OPEN')
      .then(async (list) => {
        setInstances(list)
        setLoadingInstances(false)
        if (list.length > 0) {
          setLoadingRegs(true)
          try {
            const r = await getAdminRegistrations(list[0].id)
            setRegs(r)
          } catch {
            setRegs([])
          } finally {
            setLoadingRegs(false)
          }
        }
      })
      .catch(() => {
        setInstances([])
        setLoadingInstances(false)
      })
  }, [])

  const s = summary ?? { openInstances: 0, registrationsToday: 0, revenue: 0, currency: 'PLN', occupancyPct: 0 }
  const firstInstanceTitle = instances.length > 0 ? resolveTitle(instances[0].title) : ''

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div
          className="px-4 py-3 rounded-[12px] text-sm"
          style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}
        >
          {error}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiTile
          label="Otwarte edycje"
          value={loadingSummary ? '—' : String(s.openInstances)}
          icon={CalendarDays}
        />
        <KpiTile
          label="Zgłoszenia dziś"
          value={loadingSummary ? '—' : String(s.registrationsToday)}
          icon={UserPlus}
        />
        <KpiTile
          label="Przychód (bieżący)"
          value={loadingSummary ? '—' : `${new Intl.NumberFormat('pl-PL').format(s.revenue)} zł`}
          icon={TrendingUp}
        />
        <KpiTile
          label="Obłożenie pokoi"
          value={loadingSummary ? '—' : `${s.occupancyPct}%`}
          icon={BedDouble}
        />
      </div>

      {/* Chart + Events */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 340px' }}>
        <TrendChart />
        <NearestEvents instances={instances} loading={loadingInstances} />
      </div>

      {/* Registrations table */}
      <RecentRegistrations
        regs={regs}
        loading={loadingRegs}
        instanceTitle={firstInstanceTitle}
      />
    </div>
  )
}
