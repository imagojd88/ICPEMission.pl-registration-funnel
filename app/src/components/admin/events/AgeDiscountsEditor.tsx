import { Plus, Trash2 } from 'lucide-react'
import type { AgeBracket } from '@icpe/shared'

/**
 * Zniżki wiekowe dla dzieci — osobno na NOCLEG i na samo WYDARZENIE (kreator i „Edytuj event").
 *  - Nocleg = pokój liczony za osobę + posiłki tylko dla nocujących (`AgeBracket.multiplier`).
 *  - Wydarzenie = opłata formacyjna + wyżywienie dzienne (`AgeBracket.eventMultiplier`).
 * W formularzu wpisuje się % zniżki (0–100); w cenniku zapisuje się mnożnik (1 − %/100).
 * Puste „na wydarzenie" = dotychczasowe zasady (brak `eventMultiplier`) — stare eventy liczą się bez zmian.
 */
export interface AgeDiscountRow {
  id: string
  /** górna granica wieku (wyłącznie), np. „4” = 0–3 lata */
  ltAge: string
  /** % zniżki na nocleg */
  stayPct: string
  /** % zniżki na wydarzenie; '' = dotychczasowe zasady */
  eventPct: string
}

const pct = (mult: number) => String(Math.round((1 - mult) * 100))
const mult = (p: string) => Math.min(1, Math.max(0, 1 - (parseFloat(p) || 0) / 100))

export function rowsFromBrackets(brackets: AgeBracket[] | undefined, idPrefix = 'b'): AgeDiscountRow[] {
  return (brackets ?? []).map((b, i) => ({
    id: `${idPrefix}-${i}`,
    ltAge: String(b.ltAge),
    stayPct: pct(b.multiplier),
    eventPct: typeof b.eventMultiplier === 'number' ? pct(b.eventMultiplier) : '',
  }))
}

export function bracketsFromRows(rows: AgeDiscountRow[]): AgeBracket[] {
  return rows
    .map((r) => {
      const b: AgeBracket = { ltAge: parseInt(r.ltAge) || 0, multiplier: mult(r.stayPct) }
      if (r.eventPct.trim() !== '') b.eventMultiplier = mult(r.eventPct)
      return b
    })
    .filter((b) => b.ltAge > 0)
    .sort((a, b) => a.ltAge - b.ltAge)
}

/** Zakres wieku progu, np. „0–3 lata”, „4–12 lat”. */
function rangeLabel(rows: AgeDiscountRow[], i: number): string {
  const sorted = [...rows].map((r) => parseInt(r.ltAge) || 0)
  const hi = (parseInt(rows[i].ltAge) || 0) - 1
  const lower = sorted.filter((x) => x > 0 && x - 1 < hi).reduce((m, x) => Math.max(m, x), 0)
  if (hi < 0) return ''
  return `${lower}–${hi} lat`
}

export default function AgeDiscountsEditor({
  rows,
  onChange,
  inputCls,
  inputStyle,
}: {
  rows: AgeDiscountRow[]
  onChange: (rows: AgeDiscountRow[]) => void
  inputCls?: string
  inputStyle?: React.CSSProperties
}) {
  const box = inputCls ?? 'rounded-[10px] border px-2.5 py-1.5 text-sm'
  const boxStyle: React.CSSProperties = inputStyle ?? { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }
  const set = (id: string, patch: Partial<AgeDiscountRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Zniżka w % osobno na <strong>nocleg</strong> (pokój liczony za osobę + posiłki dla nocujących) i na{' '}
        <strong>wydarzenie</strong> (opłata formacyjna + wyżywienie w dniu wydarzenia). „Do wieku” wyłącznie: 4 = dzieci 0–3 lata.
        Pokój liczony „za pokój” kosztuje tyle samo bez względu na wiek.
      </p>
      {rows.map((r, i) => (
        <div key={r.id} className="flex items-center gap-2 flex-wrap text-sm" style={{ color: 'var(--ink)' }}>
          <span>do</span>
          <input value={r.ltAge} onChange={(e) => set(r.id, { ltAge: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className={box} style={{ ...boxStyle, width: 64 }} aria-label="Do wieku (wyłącznie)" />
          <span>lat</span>
          <span className="text-xs" style={{ color: 'var(--faint)', minWidth: 64 }}>{rangeLabel(rows, i)}</span>
          <span>· nocleg −</span>
          <input value={r.stayPct} onChange={(e) => set(r.id, { stayPct: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" className={box} style={{ ...boxStyle, width: 64 }} aria-label="Zniżka na nocleg w %" />
          <span>%</span>
          <span>· wydarzenie −</span>
          <input value={r.eventPct} onChange={(e) => set(r.id, { eventPct: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" placeholder="jak dotąd" className={box} style={{ ...boxStyle, width: 92 }} aria-label="Zniżka na wydarzenie w %" />
          <span>%</span>
          <button type="button" onClick={() => onChange(rows.filter((x) => x.id !== r.id))} className="p-2 rounded-[8px]" style={{ color: 'var(--err)', background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Usuń próg">
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      {rows.some((r) => r.eventPct.trim() === '') && (
        <p className="text-xs" style={{ color: 'var(--faint)' }}>
          Puste „wydarzenie” = dotychczasowe zasady: opłata formacyjna pełna (0 zł tylko przy 100% zniżki na nocleg), wyżywienie ze zniżką jak nocleg.
        </p>
      )}
      <button
        type="button"
        onClick={() => onChange([...rows, { id: `b-new-${Date.now()}`, ltAge: '', stayPct: '0', eventPct: '0' }])}
        className="self-start flex items-center gap-1.5 text-sm font-semibold rounded-[10px] px-3 py-1.5"
        style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer' }}
      >
        <Plus size={14} /> Dodaj próg
      </button>
    </div>
  )
}
