import { useMemo, useRef, useState } from 'react'
import type { EventDashboard, EventAnalytics } from '@/lib/api'
import { fmtDay, fmtInt } from './labels'

// Wspólne: oś czasu po dniach `YYYY-MM-DD` (UTC w południe — bez przesunięć przy zmianie czasu).
const dayNum = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

function niceMax(v: number): number {
  if (v <= 10) return 10
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p
  return 10 * p
}

/** Krok osi: 1, 2, 2,5 lub 5 × 10^n — bez etykiet typu 62,5. */
function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))))
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p
  return 10 * p
}

const W = 720
const H = 250
const PAD = { l: 40, r: 16, t: 18, b: 30 }

interface Tip {
  x: number
  y: number
  lines: string[]
}

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null
  const left = (tip.x / W) * width
  return (
    <div
      className="absolute pointer-events-none px-2.5 py-1.5 rounded-[8px] text-xs shadow-md"
      style={{
        left: Math.min(Math.max(left, 70), width - 70),
        top: 0,
        transform: 'translateX(-50%)',
        background: 'var(--ink)',
        color: 'var(--surface)',
        whiteSpace: 'nowrap',
        zIndex: 5,
      }}
    >
      {tip.lines.map((l, i) => (
        <div key={i} style={i === 0 ? { fontWeight: 600 } : undefined}>{l}</div>
      ))}
    </div>
  )
}

/**
 * Tempo zapisów: osoby narastająco dzień po dniu, cel frekwencji (linia przerywana),
 * limit miejsc (kropkowana) i „potrzebne tempo” od dziś do dnia zamknięcia zapisów.
 */
export function PaceChart({ data }: { data: EventDashboard }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const { daily, pace, milestones, event, today } = data
  const opensOn = event.registrationOpensAt.slice(0, 10)
  const closesOn = data.milestones.find((m) => m.kind === 'closes')?.date ?? event.registrationClosesAt.slice(0, 10)

  const g = useMemo(() => {
    const start = daily[0]?.date ?? opensOn
    const end = [closesOn, daily[daily.length - 1]?.date ?? start].sort().reverse()[0]
    const x0 = dayNum(start)
    const x1 = Math.max(dayNum(end), x0 + 1)
    const current = daily[daily.length - 1]?.cumulativePeople ?? 0
    const target = event.targetPeople ?? event.capacity ?? 0
    const rawMax = Math.max(current, target, event.capacity ?? 0, 5) * 1.08
    const tStep = niceStep(rawMax / 4)
    const yMax = Math.ceil(rawMax / tStep) * tStep
    const sx = (iso: string) => PAD.l + ((dayNum(iso) - x0) / (x1 - x0)) * (W - PAD.l - PAD.r)
    const sy = (v: number) => H - PAD.b - (v / yMax) * (H - PAD.t - PAD.b)
    const path = daily.map((p, i) => `${i ? 'L' : 'M'}${sx(p.date).toFixed(1)},${sy(p.cumulativePeople).toFixed(1)}`).join(' ')
    const area = daily.length ? `${path} L${sx(daily[daily.length - 1].date).toFixed(1)},${sy(0)} L${sx(daily[0].date).toFixed(1)},${sy(0)} Z` : ''
    const ticks: number[] = []
    for (let t = 0; t <= yMax + 1e-9; t += tStep) ticks.push(t)
    // Etykiety osi X: ~6 dat rozłożonych równo.
    const span = x1 - x0
    const step = Math.max(1, Math.ceil(span / 6))
    const xt: string[] = []
    for (let d = x0; d <= x1; d += step) xt.push(new Date(d * 86_400_000).toISOString().slice(0, 10))
    return { start, end, x0, x1, sx, sy, path, area, ticks, xt, current, target, yMax }
  }, [daily, opensOn, closesOn, event.targetPeople, event.capacity])

  const lastPoint = daily[daily.length - 1]
  const showNeeded = !!pace && pace.status !== 'reached' && pace.status !== 'closed' && g.target > 0 && closesOn > today
  const neededFrom = today < opensOn ? opensOn : lastPoint?.date ?? today

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    const vx = ((e.clientX - r.left) / r.width) * W
    let best = 0
    let bestD = Infinity
    daily.forEach((p, i) => {
      const d = Math.abs(g.sx(p.date) - vx)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    const p = daily[best]
    if (!p) return setTip(null)
    const ms = milestones.filter((m) => m.date === p.date).map((m) => m.label)
    setTip({
      x: g.sx(p.date),
      y: g.sy(p.cumulativePeople),
      lines: [
        fmtDay(p.date, true),
        `Razem: ${fmtInt(p.cumulativePeople)} os. (${fmtInt(p.cumulativeRegistrations)} zgł.)`,
        `Tego dnia: +${fmtInt(p.people)} os. (${fmtInt(p.registrations)} zgł.)`,
        ...ms,
      ],
    })
  }

  return (
    <div ref={wrap} className="relative" onMouseLeave={() => setTip(null)}>
      <Tooltip tip={tip} width={wrap.current?.clientWidth ?? W} />
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Liczba zapisanych osób narastająco w czasie, z celem frekwencji">
        {g.ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={g.sy(t)} y2={g.sy(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.l - 6} y={g.sy(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--faint)">{fmtInt(t)}</text>
          </g>
        ))}
        {g.xt.map((d) => (
          <text key={d} x={g.sx(d)} y={H - 10} textAnchor="middle" fontSize={10} fill="var(--faint)">{fmtDay(d)}</text>
        ))}
        {/* Kamienie milowe: start/koniec zapisów, progi cenowe, terminy rat */}
        {milestones
          .filter((m) => m.date >= g.start && m.date <= g.end && m.kind !== 'event')
          .map((m) => (
            <g key={`${m.kind}-${m.date}-${m.label}`}>
              <line x1={g.sx(m.date)} x2={g.sx(m.date)} y1={PAD.t} y2={H - PAD.b} stroke="var(--border)" strokeWidth={1} strokeDasharray="2 3" />
              <circle cx={g.sx(m.date)} cy={H - PAD.b} r={3.5} fill={m.kind === 'tier' ? 'var(--accent)' : m.kind === 'installment' ? 'var(--warn)' : 'var(--muted)'} stroke="var(--surface)" strokeWidth={2}>
                <title>{`${fmtDay(m.date, true)} — ${m.label}`}</title>
              </circle>
            </g>
          ))}
        {/* Limit miejsc */}
        {event.capacity && event.capacity !== g.target ? (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={g.sy(event.capacity)} y2={g.sy(event.capacity)} stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="1 4" strokeLinecap="round" />
            <text x={W - PAD.r} y={g.sy(event.capacity) - 5} textAnchor="end" fontSize={10.5} fill="var(--muted)">Limit miejsc {fmtInt(event.capacity)}</text>
          </g>
        ) : null}
        {/* Cel frekwencji */}
        {g.target > 0 && (
          <g>
            <line x1={PAD.l} x2={W - PAD.r} y1={g.sy(g.target)} y2={g.sy(g.target)} stroke="var(--ink)" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={PAD.l + 4} y={g.sy(g.target) - 5} fontSize={10.5} fill="var(--muted)" fontWeight={600}>
              {event.targetPeople ? `Cel ${fmtInt(g.target)}` : `Limit ${fmtInt(g.target)}`}
            </text>
          </g>
        )}
        {/* Potrzebne tempo: od dziś do celu w dniu zamknięcia zapisów */}
        {showNeeded && (
          <line
            x1={g.sx(neededFrom)}
            y1={g.sy(g.current)}
            x2={g.sx(closesOn)}
            y2={g.sy(g.target)}
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        )}
        {g.area && <path d={g.area} fill="var(--brand)" fillOpacity={0.08} />}
        {g.path && <path d={g.path} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {lastPoint && (
          <circle cx={g.sx(lastPoint.date)} cy={g.sy(lastPoint.cumulativePeople)} r={4.5} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
        )}
        {tip && (
          <g pointerEvents="none">
            <line x1={tip.x} x2={tip.x} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted)" strokeWidth={1} />
            <circle cx={tip.x} cy={tip.y} r={5} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
        <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="transparent" onMouseMove={onMove} />
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs" style={{ color: 'var(--muted)' }}>
        <LegendLine color="var(--brand)" label="Zapisane osoby (narastająco)" />
        {g.target > 0 && <LegendLine color="var(--ink)" dash="6 4" label={event.targetPeople ? 'Cel frekwencji' : 'Limit miejsc'} />}
        {showNeeded && <LegendLine color="var(--accent)" dash="4 4" label="Tempo potrzebne do celu" />}
        <span className="inline-flex items-center gap-1.5"><Dot color="var(--accent)" /> próg cenowy</span>
        <span className="inline-flex items-center gap-1.5"><Dot color="var(--warn)" /> termin raty</span>
        <span className="inline-flex items-center gap-1.5"><Dot color="var(--muted)" /> start / koniec zapisów</span>
      </div>
    </div>
  )
}

function LegendLine({ color, dash, label }: { color: string; dash?: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="20" height="8" aria-hidden><line x1="1" x2="19" y1="4" y2="4" stroke={color} strokeWidth={2} strokeDasharray={dash} /></svg>
      {label}
    </span>
  )
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block rounded-full" style={{ width: 8, height: 8, background: color }} />
}

/** Wejścia na stronę eventu dzień po dniu (PostHog), w dymku także start formularza i wysłane zgłoszenia. */
export function DailyVisitsChart({ daily }: { daily: EventAnalytics['daily'] }) {
  const wrap = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  if (!daily.length) return <p className="text-sm" style={{ color: 'var(--faint)' }}>Brak wejść w wybranym okresie.</p>
  const h = 160
  const DW = 1100
  const pad = { l: 32, r: 8, t: 10, b: 24 }
  // Pełna oś dni (dni bez wejść = 0).
  const x0 = dayNum(daily[0].date)
  const x1 = dayNum(daily[daily.length - 1].date)
  const byDay = new Map(daily.map((d) => [d.date, d]))
  const days: Array<{ date: string; visit: number; start: number; submit: number }> = []
  for (let d = x0; d <= x1; d++) {
    const iso = new Date(d * 86_400_000).toISOString().slice(0, 10)
    days.push(byDay.get(iso) ?? { date: iso, visit: 0, start: 0, submit: 0 })
  }
  const max = niceMax(Math.max(...days.map((d) => d.visit), 4))
  const bw = (DW - pad.l - pad.r) / days.length
  const sy = (v: number) => h - pad.b - (v / max) * (h - pad.t - pad.b)
  const labelEvery = Math.max(1, Math.ceil(days.length / 8))
  return (
    <div ref={wrap} className="relative" onMouseLeave={() => setTip(null)}>
      <Tooltip tip={tip ? { ...tip, x: (tip.x / DW) * W } : null} width={wrap.current?.clientWidth ?? W} />
      <svg viewBox={`0 0 ${DW} ${h}`} width="100%" role="img" aria-label="Osoby, które weszły na stronę eventu, dzień po dniu">
        {[0, Math.round(max / 2), max].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={DW - pad.r} y1={sy(t)} y2={sy(t)} stroke="var(--border)" />
            <text x={pad.l - 5} y={sy(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--faint)">{fmtInt(t)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad.l + i * bw
          const bh = Math.max(0, sy(0) - sy(d.visit))
          const w = Math.max(2, Math.min(bw - 2, 22))
          return (
            <g key={d.date}>
              {d.visit > 0 && (
                <path
                  d={roundedTop(x + (bw - w) / 2, sy(d.visit), w, bh, Math.min(4, w / 2, bh))}
                  fill="var(--brand)"
                  fillOpacity={tip && tip.x !== x + bw / 2 ? 0.55 : 1}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={x + bw / 2} y={h - 8} textAnchor="middle" fontSize={10} fill="var(--faint)">{fmtDay(d.date)}</text>
              )}
              <rect
                x={x}
                y={pad.t}
                width={bw}
                height={h - pad.t - pad.b}
                fill="transparent"
                onMouseEnter={() =>
                  setTip({
                    x: x + bw / 2,
                    y: sy(d.visit),
                    lines: [fmtDay(d.date, true), `Weszli: ${d.visit}`, `Zaczęli formularz: ${d.start}`, `Wysłali zgłoszenie: ${d.submit}`],
                  })
                }
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Słupek z zaokrąglonym górnym końcem (podstawa przy osi prosta). */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return ''
  const rr = Math.max(0, Math.min(r, h))
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

/** Poziomy pasek wartości (lejek, źródła, pokoje). `value` względem `max`. */
export function HBar({ value, max, color = 'var(--brand)', height = 8 }: { value: number; max: number; color?: string; height?: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, background: 'var(--border)' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999, minWidth: value > 0 ? 3 : 0 }} />
    </div>
  )
}
