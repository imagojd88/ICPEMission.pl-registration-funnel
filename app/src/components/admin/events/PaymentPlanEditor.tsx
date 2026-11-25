import { Plus, Trash2 } from 'lucide-react'
import type { PaymentPlan } from '@icpe/shared'

/** Wiersz raty w formularzu (wartości jako tekst — tak jak reszta pól cennika). */
export interface InstallmentRow {
  id: string
  label: string
  pct: string
  /** '' = przy rejestracji; inaczej data YYYY-MM-DD */
  due: string
}

export interface PaymentPlanForm {
  enabled: boolean
  rows: InstallmentRow[]
  remindBefore: string
  remindAfter: string
}

export interface RoomDepositRow {
  key: string
  name: string
  depositPct: string
}

export const EMPTY_PLAN_FORM: PaymentPlanForm = {
  enabled: false,
  rows: [
    { id: 'r1', label: 'Zadatek', pct: '20', due: '' },
    { id: 'r2', label: 'Dopłata', pct: '', due: '' },
  ],
  remindBefore: '3',
  remindAfter: '7',
}

/** Plan z cennika eventu → stan formularza. */
export function planToForm(plan: PaymentPlan | null | undefined): PaymentPlanForm {
  if (!plan || !Array.isArray(plan.installments) || plan.installments.length === 0) return EMPTY_PLAN_FORM
  return {
    enabled: !!plan.enabled,
    rows: plan.installments.map((i, idx) => ({
      id: String(i.id || `r${idx + 1}`),
      label: i.label ?? '',
      pct: String(i.pct ?? ''),
      due: i.due === 'registration' ? '' : String(i.due ?? ''),
    })),
    remindBefore: String(plan.remindBeforeDays ?? 3),
    remindAfter: String(plan.remindAfterDays ?? 7),
  }
}

/** Stan formularza → plan do zapisu (undefined = nie zapisuj planu w cenniku). */
export function formToPlan(form: PaymentPlanForm): PaymentPlan | undefined {
  const installments = form.rows.map((r, idx) => ({
    id: r.id || `r${idx + 1}`,
    ...(r.label.trim() ? { label: r.label.trim() } : {}),
    pct: Math.min(100, Math.max(0, parseFloat(r.pct.replace(',', '.')) || 0)),
    due: r.due ? r.due : ('registration' as const),
  }))
  if (!form.enabled && installments.length === 0) return undefined
  const days = (v: string, d: number) => {
    const n = parseInt(v)
    return Number.isFinite(n) && n >= 0 ? Math.min(60, n) : d
  }
  return { enabled: form.enabled, installments, remindBeforeDays: days(form.remindBefore, 3), remindAfterDays: days(form.remindAfter, 7) }
}

/** Błąd konfiguracji planu do pokazania przed zapisem (null = OK). */
export function planFormError(form: PaymentPlanForm): string | null {
  if (!form.enabled) return null
  if (form.rows.length === 0) return 'Harmonogram wpłat: dodaj co najmniej jedną ratę albo wyłącz harmonogram.'
  const withDate = form.rows.filter((r) => r.due)
  if (new Set(withDate.map((r) => r.due)).size !== withDate.length) return 'Harmonogram wpłat: dwie raty mają ten sam termin.'
  const sum = form.rows.slice(0, -1).reduce((s, r) => s + (parseFloat(r.pct.replace(',', '.')) || 0), 0)
  if (sum > 100) return `Harmonogram wpłat: raty przed ostatnią dają razem ${sum}% (maksymalnie 100%).`
  return null
}

interface Props {
  form: PaymentPlanForm
  onChange: (f: PaymentPlanForm) => void
  /** typy zakwaterowania — opcjonalny wyższy zadatek przy zapisie */
  rooms: RoomDepositRow[]
  onRoomDeposit: (key: string, pct: string) => void
}

/**
 * Harmonogram wpłat eventu: dowolne % i terminy rat, przypomnienia mailowe przed i po terminie,
 * wyższy zadatek dla wybranych typów zakwaterowania. Zapis w `pricingConfig.paymentPlan`
 * i `pricingConfig.rooms[].depositPct`.
 */
export default function PaymentPlanEditor({ form, onChange, rooms, onRoomDeposit }: Props) {
  const inputCls = 'rounded-[10px] border px-3 py-2 text-sm'
  const inputStyle = { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }
  const setRow = (id: string, patch: Partial<InstallmentRow>) =>
    onChange({ ...form, rows: form.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
  const before = form.rows.slice(0, -1).reduce((s, r) => s + (parseFloat(r.pct.replace(',', '.')) || 0), 0)
  const rest = Math.max(0, Math.round((100 - before) * 100) / 100)
  const err = planFormError(form)

  return (
    <section className="flex flex-col gap-3 rounded-[14px] border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
      <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
        <input type="checkbox" checked={form.enabled} onChange={(e) => onChange({ ...form, enabled: e.target.checked })} className="accent-[var(--brand)] w-4 h-4" />
        Harmonogram wpłat (zadatek i raty z terminami)
      </label>
      <p className="text-xs -mt-1" style={{ color: 'var(--muted)' }}>
        Wyłączony = cała kwota do zapłaty od razu, jak dotąd. Włączony: zgłoszenie jest potwierdzane po wpłacie zadatku, a gość dostaje harmonogram w mailu.
      </p>

      {form.enabled && (
        <>
          <div className="flex flex-col gap-2">
            {form.rows.map((r, idx) => {
              const last = idx === form.rows.length - 1
              return (
                <div key={r.id} className="flex items-center gap-2 flex-wrap">
                  <input value={r.label} onChange={(e) => setRow(r.id, { label: e.target.value })} placeholder={idx === 0 ? 'Zadatek' : last ? 'Dopłata' : `Rata ${idx + 1}`} className={inputCls} style={{ ...inputStyle, width: 150 }} aria-label="Nazwa raty" />
                  {last ? (
                    <span className="text-sm" style={{ color: 'var(--muted)', width: 96 }}>reszta ({rest}%)</span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <input value={r.pct} onChange={(e) => setRow(r.id, { pct: e.target.value.replace(/[^\d.,]/g, '') })} inputMode="decimal" placeholder="0" className={inputCls} style={{ ...inputStyle, width: 70 }} aria-label="Procent kwoty" />
                      <span className="text-sm" style={{ color: 'var(--muted)' }}>%</span>
                    </span>
                  )}
                  <select value={r.due ? 'date' : 'registration'} onChange={(e) => setRow(r.id, { due: e.target.value === 'date' ? (r.due || new Date().toISOString().slice(0, 10)) : '' })} className={inputCls} style={inputStyle} aria-label="Termin">
                    <option value="registration">przy rejestracji</option>
                    <option value="date">do dnia…</option>
                  </select>
                  {r.due && <input type="date" value={r.due} onChange={(e) => setRow(r.id, { due: e.target.value })} className={inputCls} style={inputStyle} aria-label="Termin wpłaty" />}
                  {form.rows.length > 1 && (
                    <button type="button" onClick={() => onChange({ ...form, rows: form.rows.filter((x) => x.id !== r.id) })} aria-label="Usuń ratę" style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer' }}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              )
            })}
            <button
              type="button"
              onClick={() => {
                const rows = [...form.rows]
                rows.splice(Math.max(0, rows.length - 1), 0, { id: `r${Date.now()}`, label: '', pct: '', due: new Date().toISOString().slice(0, 10) })
                onChange({ ...form, rows })
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold self-start rounded-full px-3 py-1.5"
              style={{ background: 'transparent', color: 'var(--brand)', border: '1px dashed var(--brand)', cursor: 'pointer' }}
            >
              <Plus size={12} /> Dodaj ratę
            </button>
            <p className="text-xs" style={{ color: err ? 'var(--err)' : 'var(--muted)' }}>
              {err ?? 'Ostatnia rata zawsze domyka do 100%. Kto zapisze się po terminie raty, płaci ją od razu razem z zadatkiem. Terminy liczone wg czasu polskiego (do końca dnia).'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-sm" style={{ color: 'var(--ink)' }}>
            <span>Mail przypominający</span>
            <input value={form.remindBefore} onChange={(e) => onChange({ ...form, remindBefore: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className={inputCls} style={{ ...inputStyle, width: 56 }} aria-label="Dni przed terminem" />
            <span>dni przed terminem i ponaglenie</span>
            <input value={form.remindAfter} onChange={(e) => onChange({ ...form, remindAfter: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className={inputCls} style={{ ...inputStyle, width: 56 }} aria-label="Dni po terminie" />
            <span>dni po terminie</span>
            <span className="text-xs" style={{ color: 'var(--faint)' }}>(0 = nie wysyłaj; tylko do osób z niedopłatą)</span>
          </div>

          {rooms.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Wyższy zadatek dla typu zakwaterowania</p>
              {rooms.map((r) => (
                <div key={r.key} className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                  <span className="flex-1 min-w-0 truncate">{r.name || '(bez nazwy)'}</span>
                  <input value={r.depositPct} onChange={(e) => onRoomDeposit(r.key, e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="jak wyżej" className={inputCls} style={{ ...inputStyle, width: 96 }} aria-label={`Zadatek dla: ${r.name}`} />
                  <span style={{ color: 'var(--muted)' }}>% przy rejestracji</span>
                </div>
              ))}
              <p className="text-xs" style={{ color: 'var(--muted)' }}>Np. 50 dla pokoju lub domku na wyłączność. Puste = zadatek z harmonogramu.</p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
