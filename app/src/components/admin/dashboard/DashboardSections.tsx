import { useState } from 'react'
import { AlertTriangle, AlertCircle, Info, ArrowRight, Copy, Check, Pencil } from 'lucide-react'
import type { EventAnalytics, EventDashboard } from '@/lib/api'
import { DailyVisitsChart, HBar, PaceChart } from './DashboardCharts'
import {
  BLOCKED_LABELS, DEVICE_LABELS, FAILED_LABELS, LANG_LABELS, METHOD_LABELS, PROVIDER_LABELS, STATUS_LABELS, STEP_LABELS,
  countryLabel, fmtDateTime, fmtDay, fmtInt, fmtMoney, fmtPct, plural, sourceLabel,
} from './labels'

export type NavTarget = 'registrations' | 'payments' | 'accommodation' | 'events'

// ── Klocki ───────────────────────────────────────────────────────────────────

export function Card({ title, subtitle, right, children, className }: {
  title?: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`p-5 rounded-[15px] border ${className ?? ''}`}
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
    >
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h2 className="font-bold text-base" style={{ color: 'var(--ink)' }}>{title}</h2>}
            {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--faint)' }}>{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

function Stat({ label, value, hint, tone, text }: { label: string; value: string; hint?: string; tone?: 'ok' | 'warn' | 'err'; text?: boolean }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'err' ? 'var(--err)' : 'var(--ink)'
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium mb-1" style={{ color: 'var(--faint)' }}>{label}</p>
      {text ? (
        <p className="font-semibold text-sm leading-snug" style={{ color }}>{value}</p>
      ) : (
        <p className="font-bold leading-none" style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: 26, color, whiteSpace: 'nowrap' }}>{value}</p>
      )}
      {hint && <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>{hint}</p>}
    </div>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm" style={{ color: 'var(--faint)' }}>{children}</p>
}

const th = 'text-left text-xs font-semibold pb-2'
const td = 'py-1.5 text-sm'

// ── Alarmy ───────────────────────────────────────────────────────────────────

export function AlertsCard({ alerts, onNavigate }: { alerts: EventDashboard['alerts']; onNavigate?: (s: NavTarget) => void }) {
  if (!alerts.length) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-[12px] text-sm" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>
        <Check size={16} /> Nic nie wymaga dziś Twojej uwagi.
      </div>
    )
  }
  return (
    <Card title="Co wymaga uwagi">
      <ul className="flex flex-col gap-2">
        {alerts.map((a) => {
          const Icon = a.level === 'error' ? AlertCircle : a.level === 'warn' ? AlertTriangle : Info
          const color = a.level === 'error' ? 'var(--err)' : a.level === 'warn' ? 'var(--warn)' : 'var(--brand)'
          const bg = a.level === 'error' ? 'var(--err-soft)' : a.level === 'warn' ? 'var(--warn-soft)' : 'var(--brand-soft)'
          return (
            <li key={a.code} className="flex items-center gap-3 px-3 py-2 rounded-[10px]" style={{ background: bg }}>
              <Icon size={16} style={{ color, flexShrink: 0 }} aria-label={a.level === 'error' ? 'Pilne' : a.level === 'warn' ? 'Uwaga' : 'Informacja'} />
              <span className="flex-1 text-sm" style={{ color: 'var(--ink)' }}>{a.text}</span>
              {a.screen && onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate(a.screen!)}
                  className="inline-flex items-center gap-1 text-xs font-semibold"
                  style={{ color, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {({ registrations: 'Zgłoszenia', payments: 'Płatności', accommodation: 'Zakwaterowanie', events: 'Eventy' } as const)[a.screen]} <ArrowRight size={13} />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// ── Kafelki główne ───────────────────────────────────────────────────────────

export function HeadlineTiles({ d, a }: { d: EventDashboard; a: EventAnalytics | null }) {
  const target = d.event.targetPeople ?? d.event.capacity
  const f = d.finance
  const visits = a?.funnel.find((x) => x.step === 'visit')?.people ?? 0
  const submits = a?.funnel.find((x) => x.step === 'submit')?.people ?? 0
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
      <Card>
        <Stat
          label={target ? `Zapisane osoby / ${d.event.targetPeople ? 'cel' : 'limit'}` : 'Zapisane osoby'}
          value={target ? `${fmtInt(d.people.people)} / ${fmtInt(target)}` : fmtInt(d.people.people)}
          hint={`${fmtInt(d.people.adults)} dorosłych · ${fmtInt(d.people.children)} dzieci · ${fmtInt(d.people.registrations)} zgł.`}
        />
        {target ? <div className="mt-3"><HBar value={d.people.people} max={target} /></div> : null}
      </Card>
      <Card>
        <Stat
          label="Wpłacone / należne łącznie"
          value={d.event.free ? 'Bezpłatny' : fmtMoney(f.paid, f.currency)}
          hint={d.event.free ? undefined : `z ${fmtMoney(f.expected, f.currency)} · zostało ${fmtMoney(f.remaining, f.currency)}`}
        />
        {!d.event.free && f.expected > 0 && <div className="mt-3"><HBar value={f.paid} max={f.expected} color="var(--ok)" /></div>}
      </Card>
      <Card>
        <Stat
          label="Zaległe wpłaty"
          value={d.event.free ? '—' : fmtMoney(f.overdue, f.currency)}
          tone={f.overdue > 0 ? 'err' : 'ok'}
          hint={d.event.free ? undefined : f.overdueCount ? `${f.overdueCount} ${plural(f.overdueCount, 'zgłoszenie', 'zgłoszenia', 'zgłoszeń')} po terminie` : 'wszyscy płacą w terminie'}
        />
      </Card>
      <Card>
        <Stat
          label="Odwiedzający → zgłoszenie"
          value={a?.configured && visits ? fmtPct(submits, visits) : '—'}
          hint={a?.configured ? `${fmtInt(submits)} z ${fmtInt(visits)} osób · ostatnie ${a.days} dni` : 'wymaga połączenia z PostHogiem'}
        />
      </Card>
    </div>
  )
}

// ── 1. Tempo zapisów ─────────────────────────────────────────────────────────

export function PaceCard({ d, onSaveTarget }: { d: EventDashboard; onSaveTarget: (v: number | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(d.event.targetPeople ?? ''))
  const [saving, setSaving] = useState(false)
  const p = d.pace
  const statusText: Record<string, { t: string; tone: 'ok' | 'warn' | 'err' | undefined }> = {
    reached: { t: 'Cel osiągnięty', tone: 'ok' },
    on_track: { t: 'Zdążymy przy obecnym tempie', tone: 'ok' },
    behind: { t: 'Za wolno — trzeba przyspieszyć', tone: 'err' },
    closed: { t: 'Zapisy zakończone', tone: undefined },
    not_open: { t: 'Zapisy jeszcze nie ruszyły', tone: undefined },
  }
  const save = async () => {
    setSaving(true)
    try {
      const n = val.trim() ? Math.trunc(Number(val)) : null
      await onSaveTarget(n && n > 0 ? n : null)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card
      title="Czy zdążymy? — tempo zapisów"
      subtitle={`Zapisy ${fmtDay(d.event.registrationOpensAt.slice(0, 10), true)} – ${fmtDay(d.event.registrationClosesAt.slice(0, 10), true)} · osoby w zgłoszeniach bez anulowanych i listy rezerwowej`}
      right={
        editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="w-24 px-2 py-1 rounded-[8px] text-sm"
              style={{ border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)' }}
              placeholder="np. 170"
              aria-label="Cel frekwencji (osoby)"
            />
            <button type="button" onClick={() => void save()} disabled={saving} className="text-xs font-semibold px-2.5 py-1.5 rounded-[8px]" style={{ background: 'var(--brand)', color: '#fff', border: 'none', cursor: 'pointer' }}>
              {saving ? 'Zapisuję…' : 'Zapisz'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs" style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Anuluj</button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-[8px]" style={{ border: '1px solid var(--border)', color: 'var(--muted)', background: 'var(--surface)', cursor: 'pointer' }}>
            <Pencil size={12} /> {d.event.targetPeople ? `Cel: ${d.event.targetPeople}` : 'Ustaw cel frekwencji'}
          </button>
        )
      }
    >
      <div className="grid gap-6" style={{ gridTemplateColumns: 'minmax(0, 1fr) 220px' }}>
        <PaceChart data={d} />
        <div className="flex flex-col gap-4">
          {p ? (
            <>
              <Stat label="Stan" value={statusText[p.status].t} tone={statusText[p.status].tone} text />
              <Stat label="Brakuje do celu" value={`${fmtInt(p.missing)} os.`} hint={p.daysLeft > 0 ? `${p.daysLeft} ${plural(p.daysLeft, 'dzień', 'dni', 'dni')} zapisów` : undefined} />
              <Stat
                label="Potrzebne tempo"
                value={p.neededPerDay === null ? '—' : `${String(p.neededPerDay).replace('.', ',')} os./dzień`}
                hint={`obecne: ${String(p.recentPerDay).replace('.', ',')} os./dzień (ost. 14 dni)`}
              />
              {p.status !== 'not_open' && p.status !== 'reached' && (
                <Stat
                  label="Prognoza na koniec zapisów"
                  value={`ok. ${fmtInt(p.projected)} os.`}
                  tone={p.projected >= p.target ? 'ok' : 'warn'}
                  hint={d.event.capacity && p.projected > d.event.capacity ? `więcej niż limit ${fmtInt(d.event.capacity)} miejsc — zapisy mogą się wyczerpać wcześniej` : undefined}
                />
              )}
            </>
          ) : (
            <Muted>Ustaw cel frekwencji (np. minimum osób z umowy z ośrodkiem) albo limit miejsc w evencie — wtedy pokażę, czy tempo zapisów wystarczy.</Muted>
          )}
        </div>
      </div>
    </Card>
  )
}

// ── 2. Lejek ─────────────────────────────────────────────────────────────────

export function FunnelCard({ a, d, days, onDays, loading }: {
  a: EventAnalytics | null
  d: EventDashboard
  days: number
  onDays: (n: number) => void
  loading: boolean
}) {
  const daysPicker = (
    <div className="flex gap-1" role="group" aria-label="Okres">
      {[7, 30, 90, 365].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onDays(n)}
          className="text-xs font-medium px-2.5 py-1 rounded-[8px]"
          style={{
            border: '1px solid var(--border)',
            background: n === days ? 'var(--brand)' : 'var(--surface)',
            color: n === days ? '#fff' : 'var(--muted)',
            cursor: 'pointer',
          }}
        >
          {n === 365 ? 'rok' : `${n} dni`}
        </button>
      ))}
    </div>
  )
  if (!a || !a.configured) {
    return (
      <Card title="Gdzie ludzie odpadają? — lejek" right={daysPicker}>
        {loading ? <Muted>Ładowanie danych z PostHoga…</Muted> : <PosthogSetup />}
      </Card>
    )
  }
  const visit = a.funnel.find((x) => x.step === 'visit')?.people ?? 0
  const start = a.funnel.find((x) => x.step === 'start')?.people ?? 0
  // Kroki, których event nie ma (np. nocleg w evencie bez noclegu), mają 0 — chowamy je, chyba że kluczowe.
  const steps = a.funnel.filter((s) => s.people > 0 || ['visit', 'start', 'submit'].includes(s.step))
  // Największy spadek między kolejnymi krokami formularza (od „zaczęli” w dół).
  let worst: string | null = null
  let worstDrop = 0
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1].people
    const drop = prev - steps[i].people
    if (prev >= 3 && drop / prev > worstDrop && steps[i].step !== 'start') {
      worstDrop = drop / prev
      worst = steps[i].step
    }
  }
  const leadsSteps = Object.entries(d.people.leadsByStep).sort((x, y) => Number(x[0]) - Number(y[0]))
  return (
    <Card
      title="Gdzie ludzie odpadają? — lejek"
      subtitle={`PostHog · ostatnie ${a.days} dni · osoby, które doszły do kroku (bez Twoich wejść z przeglądarki panelu)`}
      right={daysPicker}
    >
      {a.error && <p className="text-xs mb-3" style={{ color: 'var(--warn)' }}>{a.error} Pokazuję ostatnie pobrane dane.</p>}
      <div className="grid gap-6" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)' }}>
        <div className="flex flex-col gap-2.5">
          {steps.map((s, i) => {
            const prev = i > 0 ? steps[i - 1].people : 0
            const isWorst = s.step === worst
            return (
              <div key={s.step}>
                <div className="flex items-baseline justify-between gap-2 text-sm mb-1">
                  <span style={{ color: 'var(--ink)', fontWeight: isWorst ? 600 : 400 }}>{STEP_LABELS[s.step] ?? s.step}</span>
                  <span className="whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                    <strong style={{ color: 'var(--ink)' }}>{fmtInt(s.people)}</strong>
                    <span className="ml-2 text-xs">{s.step === 'visit' ? '100%' : fmtPct(s.people, visit)}</span>
                    {i > 0 && prev > 0 && s.people < prev && (
                      <span className="ml-2 text-xs" style={{ color: isWorst ? 'var(--err)' : 'var(--faint)' }}>−{fmtPct(prev - s.people, prev)}</span>
                    )}
                  </span>
                </div>
                <HBar value={s.people} max={visit || 1} color={isWorst ? 'var(--err)' : 'var(--brand)'} />
              </div>
            )
          })}
          {worst && (
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Najwięcej osób odpada przy: <strong style={{ color: 'var(--err)' }}>{STEP_LABELS[worst]}</strong>. Liczby są małe — traktuj je jako sygnał, nie wyrok.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Urządzenia</p>
            <table className="w-full">
              <thead><tr style={{ color: 'var(--faint)' }}><th className={th}></th><th className={th}>Weszli</th><th className={th}>Zaczęli</th><th className={th}>Wysłali</th><th className={th}>Konwersja</th></tr></thead>
              <tbody>
                {a.devices.map((x) => (
                  <tr key={x.device} style={{ color: 'var(--ink)' }}>
                    <td className={td}>{DEVICE_LABELS[x.device] ?? x.device}</td><td className={td}>{x.visit}</td><td className={td}>{x.start}</td><td className={td}>{x.submit}</td><td className={td}>{fmtPct(x.submit, x.visit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Język strony</p>
            <table className="w-full">
              <thead><tr style={{ color: 'var(--faint)' }}><th className={th}></th><th className={th}>Weszli</th><th className={th}>Zaczęli</th><th className={th}>Wysłali</th><th className={th}>Konwersja</th></tr></thead>
              <tbody>
                {a.langs.slice(0, 6).map((x) => (
                  <tr key={x.lang} style={{ color: 'var(--ink)' }}>
                    <td className={td}>{LANG_LABELS[x.lang] ?? x.lang}</td><td className={td}>{x.visit}</td><td className={td}>{x.start}</td><td className={td}>{x.submit}</td><td className={td}>{fmtPct(x.submit, x.visit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid gap-6 mt-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Zatrzymani na kroku (komunikat w formularzu)</p>
          {a.blocked.length ? (
            <ul className="text-sm flex flex-col gap-1">{a.blocked.map((b) => <li key={b.step} style={{ color: 'var(--ink)' }}><strong>{b.count}×</strong> {BLOCKED_LABELS[b.step] ?? b.step}</li>)}</ul>
          ) : <Muted>Brak.</Muted>}
        </div>
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Nieudane wysyłki</p>
          {a.failed.length ? (
            <ul className="text-sm flex flex-col gap-1">{a.failed.map((b) => <li key={b.reason} style={{ color: 'var(--ink)' }}><strong>{b.count}×</strong> {FAILED_LABELS[b.reason] ?? b.reason}</li>)}</ul>
          ) : <Muted>Brak.</Muted>}
        </div>
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Porzucone formularze (z adresem e-mail)</p>
          {d.people.leadsOpen ? (
            <>
              <p className="text-sm" style={{ color: 'var(--ink)' }}>
                <strong>{d.people.leadsOpen}</strong> {plural(d.people.leadsOpen, 'osoba nie dokończyła', 'osoby nie dokończyły', 'osób nie dokończyło')}
                {d.people.leadsReminded ? ` · przypomnienie dostało ${d.people.leadsReminded}` : ''}
                {d.people.leadsConverted ? ` · ${d.people.leadsConverted} wróciło i wysłało` : ''}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                Gdzie przerwali: {leadsSteps.map(([k, v]) => `po kroku ${k}: ${v}`).join(' · ')}
              </p>
            </>
          ) : <Muted>Brak.</Muted>}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Wejścia na stronę eventu dzień po dniu</p>
        <DailyVisitsChart daily={a.daily} />
      </div>
    </Card>
  )
}

function PosthogSetup() {
  return (
    <div className="text-sm flex flex-col gap-2" style={{ color: 'var(--muted)' }}>
      <p style={{ color: 'var(--ink)' }}>Ta sekcja pokazuje dane z PostHoga, ale serwer nie ma jeszcze klucza.</p>
      <ol className="list-decimal pl-5 flex flex-col gap-1">
        <li>PostHog (organizacja ICPE PL) ▸ awatar ▸ <strong>Personal API keys</strong> ▸ <strong>Create personal API key</strong>.</li>
        <li>Nazwa np. „Panel ICPE”, projekt <strong>ICPE Rejestracja</strong>, zakres <strong>Endpoint: Read</strong> (nic więcej).</li>
        <li>Render ▸ <strong>icpe-api</strong> ▸ Environment ▸ dodaj <code>POSTHOG_PERSONAL_API_KEY</code> z tym kluczem ▸ Save (Render zrestartuje API).</li>
      </ol>
      <p>Bez klucza reszta dashboardu działa normalnie — liczby z bazy są kompletne.</p>
    </div>
  )
}

// ── 3. Źródła ────────────────────────────────────────────────────────────────

export function SourcesCard({ a, d }: { a: EventAnalytics | null; d: EventDashboard }) {
  const maxS = Math.max(1, ...(a?.sources.map((s) => s.sessions) ?? [1]))
  return (
    <Card title="Skąd przychodzą?" subtitle="Wizyty wg pierwszego wejścia (PostHog) oraz kraje i języki zapisanych osób (baza)">
      <div className="grid gap-6" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Źródło wizyty → zgłoszenie</p>
          {a?.configured ? (
            a.sources.length ? (
              <div className="flex flex-col gap-2.5">
                {a.sources.map((s) => (
                  <div key={s.source}>
                    <div className="flex justify-between text-sm mb-1 gap-2">
                      <span style={{ color: 'var(--ink)' }}>{sourceLabel(s.source)}</span>
                      <span className="whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                        <strong style={{ color: 'var(--ink)' }}>{s.sessions}</strong> wizyt · {s.submits} zgł. · {fmtPct(s.submits, s.sessions)}
                      </span>
                    </div>
                    <HBar value={s.sessions} max={maxS} />
                  </div>
                ))}
                <p className="text-xs mt-1" style={{ color: 'var(--faint)' }}>
                  WhatsApp, Messenger i SMS nie przekazują źródła — wpadają do „Bezpośrednio”. Rozróżnisz je linkami z oznaczeniem poniżej.
                </p>
              </div>
            ) : <Muted>Brak wizyt w wybranym okresie.</Muted>
          ) : <Muted>Wymaga połączenia z PostHogiem (instrukcja w sekcji lejka).</Muted>}
        </div>
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Kraj zamieszkania (osoby)</p>
            {d.countries.length ? (
              <ul className="text-sm flex flex-col gap-1">
                {d.countries.slice(0, 8).map((c) => (
                  <li key={c.key} className="flex justify-between" style={{ color: 'var(--ink)' }}><span>{countryLabel(c.key)}</span><strong>{c.count}</strong></li>
                ))}
              </ul>
            ) : <Muted>Brak zgłoszeń.</Muted>}
          </div>
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Język formularza (osoby)</p>
            {d.locales.length ? (
              <ul className="text-sm flex flex-col gap-1">
                {d.locales.map((c) => (
                  <li key={c.key} className="flex justify-between" style={{ color: 'var(--ink)' }}><span>{LANG_LABELS[c.key] ?? c.key}</span><strong>{c.count}</strong></li>
                ))}
              </ul>
            ) : <Muted>Brak zgłoszeń.</Muted>}
          </div>
        </div>
      </div>
      {d.event.slug && <UtmBuilder slug={d.event.slug} />}
    </Card>
  )
}

const UTM_PRESETS: Array<{ id: string; label: string; medium: string }> = [
  { id: 'facebook', label: 'Facebook', medium: 'social' },
  { id: 'instagram', label: 'Instagram', medium: 'social' },
  { id: 'whatsapp', label: 'WhatsApp', medium: 'messenger' },
  { id: 'messenger', label: 'Messenger', medium: 'messenger' },
  { id: 'newsletter', label: 'Newsletter / mail', medium: 'email' },
  { id: 'plakat', label: 'Plakat / kod QR', medium: 'print' },
  { id: 'icpego', label: 'Aplikacja ICPE Go', medium: 'app' },
]

function UtmBuilder({ slug }: { slug: string }) {
  const [src, setSrc] = useState('facebook')
  const [campaign, setCampaign] = useState('')
  const [copied, setCopied] = useState(false)
  const preset = UTM_PRESETS.find((p) => p.id === src) ?? UTM_PRESETS[0]
  const clean = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const params = new URLSearchParams({ utm_source: preset.id, utm_medium: preset.medium })
  if (clean(campaign)) params.set('utm_campaign', clean(campaign))
  const url = `https://rejestracja.icpemission.pl/r/${slug}?${params.toString()}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* brak dostępu do schowka — link można zaznaczyć ręcznie */
    }
  }
  return (
    <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
      <p className="text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Link z oznaczeniem źródła</p>
      <p className="text-xs mb-3" style={{ color: 'var(--faint)' }}>Wklejaj go w posty i wiadomości zamiast zwykłego linku — wtedy w tabeli wyżej zobaczysz, które ogłoszenie przyprowadziło ludzi.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={src} onChange={(e) => setSrc(e.target.value)} className="px-2 py-1.5 rounded-[8px] text-sm" style={{ border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)' }} aria-label="Gdzie wkleisz link">
          {UTM_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="nazwa akcji, np. ogloszenie-styczen (opcjonalnie)" className="flex-1 min-w-[220px] px-2 py-1.5 rounded-[8px] text-sm" style={{ border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)' }} aria-label="Nazwa akcji" />
        <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-[8px]" style={{ background: 'var(--brand)', color: '#fff', border: 'none', cursor: 'pointer' }}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Skopiowano' : 'Kopiuj link'}
        </button>
      </div>
      <code className="block mt-2 text-xs break-all" style={{ color: 'var(--muted)' }}>{url}</code>
    </div>
  )
}

// ── 4. Pieniądze ─────────────────────────────────────────────────────────────

export function MoneyCard({ d }: { d: EventDashboard }) {
  const f = d.finance
  const cur = f.currency
  if (d.event.free) {
    return <Card title="Ile mamy pieniędzy?"><Muted>Event bezpłatny — brak wpłat.</Muted></Card>
  }
  const maxF = Math.max(1, ...f.forecast.map((x) => x.amount))
  return (
    <Card title="Ile mamy pieniędzy?" subtitle="Aktywne zgłoszenia (bez anulowanych i listy rezerwowej) · wpłaty netto po zwrotach">
      <div className="grid gap-5 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Stat label="Wpłacone" value={fmtMoney(f.paid, cur)} hint={`${fmtPct(f.paid, f.expected)} należnej kwoty`} tone="ok" />
        <Stat label="Należne łącznie" value={fmtMoney(f.expected, cur)} hint={`${f.fullyPaidCount} z ${f.registrations} zgł. opłaconych w całości`} />
        <Stat label="Wymagane do dziś" value={fmtMoney(f.dueNow, cur)} hint="raty, których termin już nadszedł" tone={f.dueNow > 0 ? 'warn' : undefined} />
        {f.hasPlan && <Stat label="Zadatki" value={`${f.depositPaidCount} / ${f.registrations}`} hint={`${fmtMoney(f.depositPaid, cur)} z ${fmtMoney(f.depositRequired, cur)}`} />}
        <Stat label="Darowizny (pula)" value={fmtMoney(f.donations, cur)} hint={`${f.donationsCount} ${plural(f.donationsCount, 'darczyńca', 'darczyńców', 'darczyńców')}`} />
      </div>
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Prognoza wpływów wg terminów</p>
          {f.forecast.length ? (
            <div className="flex flex-col gap-2.5">
              {f.forecast.map((x) => (
                <div key={x.dueDate}>
                  <div className="flex justify-between text-sm mb-1">
                    <span style={{ color: x.overdue ? 'var(--err)' : 'var(--ink)' }}>{x.overdue ? `Zaległe (termin ${fmtDay(x.dueDate)})` : `do ${fmtDay(x.dueDate, true)}`}</span>
                    <span style={{ color: 'var(--muted)' }}><strong style={{ color: 'var(--ink)' }}>{fmtMoney(x.amount, cur)}</strong> · {x.count} zgł.</span>
                  </div>
                  <HBar value={x.amount} max={maxF} color={x.overdue ? 'var(--err)' : 'var(--brand)'} />
                </div>
              ))}
            </div>
          ) : <Muted>Wszystko wpłacone.</Muted>}
        </div>
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Skąd wpłynęło</p>
            {f.byProvider.length ? (
              <ul className="text-sm flex flex-col gap-1">
                {f.byProvider.map((p) => (
                  <li key={p.provider} className="flex justify-between" style={{ color: p.provider === 'test' ? 'var(--faint)' : 'var(--ink)' }}>
                    <span>{PROVIDER_LABELS[p.provider] ?? p.provider} <span style={{ color: 'var(--faint)' }}>({p.count})</span></span>
                    <strong>{fmtMoney(p.amount, cur)}</strong>
                  </li>
                ))}
              </ul>
            ) : <Muted>Brak wpłat.</Muted>}
          </div>
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Wybrany sposób płatności (zgłoszenia)</p>
            <ul className="text-sm flex flex-col gap-1">
              {Object.entries(f.paymentMethods).sort((x, y) => y[1] - x[1]).map(([k, v]) => (
                <li key={k} className="flex justify-between" style={{ color: 'var(--ink)' }}><span>{METHOD_LABELS[k] ?? k}</span><strong>{v}</strong></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── 5. Zakwaterowanie i logistyka ────────────────────────────────────────────

export function LodgingCard({ d }: { d: EventDashboard }) {
  const l = d.lodging
  const hasRooms = l.roomTypes.length > 0
  return (
    <Card title="Co jest wyprzedane? — zakwaterowanie i logistyka" subtitle="Pokoje trzymane przez zgłoszenia poza anulowanymi · rezerwa = pula dla gości specjalnych">
      {hasRooms ? (
        <table className="w-full mb-5">
          <thead>
            <tr style={{ color: 'var(--faint)' }}>
              <th className={th}>Typ</th><th className={th}>Zajęte</th><th className={th} style={{ width: '30%' }}></th><th className={`${th} pl-4`}>Wolne publicznie</th><th className={th}>Rezerwa</th><th className={th}>Osoby</th>
            </tr>
          </thead>
          <tbody>
            {l.roomTypes.map((r) => {
              const used = r.usedPublic + r.usedReserved
              const tone = r.available === null ? 'var(--brand)' : r.available <= 0 ? 'var(--err)' : r.available <= 2 ? 'var(--warn)' : 'var(--brand)'
              return (
                <tr key={r.id} style={{ color: 'var(--ink)' }}>
                  <td className={td}>{r.name}</td>
                  <td className={td}>{r.stock ? `${used} / ${r.stock}` : used}</td>
                  <td className={td}>{r.stock ? <HBar value={used} max={r.stock} color={tone} /> : <span className="text-xs" style={{ color: 'var(--faint)' }}>bez limitu</span>}</td>
                  <td className={`${td} pl-4`} style={{ color: tone, fontWeight: 600 }}>{r.available === null ? '—' : r.available <= 0 ? 'brak' : r.available}</td>
                  <td className={td}>{r.reserved ? `${r.usedReserved} / ${r.reserved}` : '—'}</td>
                  <td className={td}>{r.people}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : <div className="mb-5"><Muted>Event bez noclegu.</Muted></div>}
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {hasRooms && (
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Przydział pokoi</p>
            <p className="text-sm" style={{ color: 'var(--ink)' }}>
              <strong>{l.assigned}</strong> z {l.needRoom} zgłoszeń z noclegiem ma pokój
              {l.unassigned ? <> · <span style={{ color: 'var(--warn)' }}>{l.unassigned} czeka na przydział</span></> : null}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{l.noLodging} {plural(l.noLodging, 'zgłoszenie', 'zgłoszenia', 'zgłoszeń')} bez noclegu</p>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Dodatki z limitem</p>
          {d.addons.length ? (
            <ul className="text-sm flex flex-col gap-1">
              {d.addons.map((x) => (
                <li key={x.id} className="flex justify-between" style={{ color: 'var(--ink)' }}>
                  <span>{x.name}</span>
                  <strong style={{ color: x.available !== null && x.available <= 0 ? 'var(--err)' : 'var(--ink)' }}>{x.limit ? `${x.used} / ${x.limit}` : x.used}</strong>
                </li>
              ))}
            </ul>
          ) : <Muted>Brak.</Muted>}
        </div>
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Diety (osoby)</p>
          {d.diets.length ? (
            <ul className="text-sm flex flex-col gap-1">
              {d.diets.map((x) => (
                <li key={x.id} className="flex justify-between" style={{ color: 'var(--ink)' }}><span>{x.label}</span><strong>{x.total}</strong></li>
              ))}
            </ul>
          ) : <Muted>Brak zgłoszeń.</Muted>}
          <p className="text-xs mt-1" style={{ color: 'var(--faint)' }}>Pełne zestawienie dla ośrodka: Zgłoszenia ▸ „Diety i dodatki”.</p>
        </div>
      </div>
    </Card>
  )
}

// ── 6. Ostatnie zgłoszenia + status ─────────────────────────────────────────

export function RecentCard({ d, onNavigate }: { d: EventDashboard; onNavigate?: (s: NavTarget) => void }) {
  const cur = d.event.currency
  return (
    <Card
      title="Ostatnie zgłoszenia"
      subtitle={Object.entries(d.people.statusCounts).map(([k, v]) => `${STATUS_LABELS[k] ?? k}: ${v}`).join(' · ') || undefined}
      right={onNavigate ? (
        <button type="button" onClick={() => onNavigate('registrations')} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}>
          Wszystkie <ArrowRight size={13} />
        </button>
      ) : undefined}
    >
      {d.recent.length ? (
        <table className="w-full">
          <thead><tr style={{ color: 'var(--faint)' }}><th className={th}>Kiedy</th><th className={th}>Zgłaszający</th><th className={th}>Osoby</th><th className={th}>Kwota</th><th className={th}>Wpłacono</th><th className={th}>Status</th></tr></thead>
          <tbody>
            {d.recent.map((r) => (
              <tr key={r.id} style={{ color: r.status === 'CANCELLED' ? 'var(--faint)' : 'var(--ink)', borderTop: '1px solid var(--border)' }}>
                <td className={td}>{fmtDateTime(r.createdAt)}</td>
                <td className={td}>{r.name}</td>
                <td className={td}>{r.people}</td>
                <td className={td}>{d.event.free ? '—' : fmtMoney(r.total, cur)}</td>
                <td className={td}>{d.event.free ? '—' : fmtMoney(r.paid, cur)}</td>
                <td className={td}>{STATUS_LABELS[r.status] ?? r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Muted>Brak zgłoszeń.</Muted>}
      {(d.people.waitlistSignups > 0 || d.people.cancelledRegistrations > 0) && (
        <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>
          {d.people.waitlistSignups > 0 && <>Powiadomienie o starcie zapisów: {d.people.waitlistSignups} {plural(d.people.waitlistSignups, 'adres', 'adresy', 'adresów')}{d.people.waitlistNotified ? ` (wysłane: ${d.people.waitlistNotified})` : ''}. </>}
          {d.people.cancelledRegistrations > 0 && <>Anulowane: {d.people.cancelledRegistrations} zgł. ({d.people.cancelledPeople} os.).</>}
        </p>
      )}
    </Card>
  )
}
