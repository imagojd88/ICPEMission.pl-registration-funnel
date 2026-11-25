import { Plus, Trash2 } from 'lucide-react'
import type { PriceTier } from '@icpe/shared'

/** Wiersz poziomu cen w formularzu (wartości jako tekst). */
export interface PriceTierRow {
  id: string
  name: string
  /** pierwszy dzień obowiązywania YYYY-MM-DD */
  from: string
  mealsFee: string
  formationFee: string
  /** cena typu zakwaterowania: klucz wiersza pokoju w formularzu → cena za noc */
  roomPrices: Record<string, string>
}

export interface TierRoom {
  /** klucz wiersza pokoju w formularzu */
  key: string
  name: string
  /** cena bazowa (pierwszy poziom) — podpowiedź w pustym polu */
  basePrice: string
  unit: 'person' | 'room'
}

const num = (v: string) => {
  const n = parseFloat((v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : undefined
}
const nameOf = (n: PriceTier['name']) => (typeof n === 'string' ? n : n?.pl ?? Object.values(n ?? {})[0] ?? '')

/** Poziomy z cennika → wiersze formularza. `keyOfRoomId` mapuje id typu pokoju na klucz wiersza. */
export function tiersToRows(tiers: PriceTier[] | undefined, keyOfRoomId: (id: string) => string | undefined): PriceTierRow[] {
  return [...(tiers ?? [])]
    .sort((a, b) => String(a.from).localeCompare(String(b.from)))
    .map((t, i) => ({
      id: String(t.id || `t${i + 1}`),
      name: nameOf(t.name),
      from: String(t.from ?? ''),
      mealsFee: typeof t.mealsFee === 'number' ? String(t.mealsFee) : '',
      formationFee: typeof t.formationFee === 'number' ? String(t.formationFee) : '',
      roomPrices: Object.fromEntries(
        Object.entries(t.rooms ?? {})
          .map(([id, price]) => [keyOfRoomId(id), String(price)] as const)
          .filter((e): e is readonly [string, string] => !!e[0]),
      ),
    }))
}

/** Wiersze formularza → poziomy do zapisu. `roomIdOfKey` mapuje klucz wiersza pokoju na id typu w cenniku. */
export function rowsToTiers(rows: PriceTierRow[], roomIdOfKey: (key: string) => string | undefined): PriceTier[] {
  return rows
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.from))
    .map((r, i) => {
      const rooms: Record<string, number> = {}
      for (const [key, v] of Object.entries(r.roomPrices)) {
        const id = roomIdOfKey(key)
        const n = num(v)
        if (id && n !== undefined && v.trim() !== '') rooms[id] = n
      }
      const meals = r.mealsFee.trim() === '' ? undefined : num(r.mealsFee)
      const formation = r.formationFee.trim() === '' ? undefined : num(r.formationFee)
      return {
        id: r.id || `t${i + 1}`,
        ...(r.name.trim() ? { name: r.name.trim() } : {}),
        from: r.from,
        ...(meals !== undefined ? { mealsFee: meals } : {}),
        ...(formation !== undefined ? { formationFee: formation } : {}),
        ...(Object.keys(rooms).length ? { rooms } : {}),
      }
    })
    .sort((a, b) => a.from.localeCompare(b.from))
}

/** Błąd konfiguracji poziomów (null = OK). */
export function tiersError(rows: PriceTierRow[]): string | null {
  if (rows.some((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.from))) return 'Poziomy cen: każdy poziom musi mieć datę „od dnia”.'
  if (new Set(rows.map((r) => r.from)).size !== rows.length) return 'Poziomy cen: dwa poziomy zaczynają się tego samego dnia.'
  return null
}

interface Props {
  baseName: string
  onBaseName: (v: string) => void
  rows: PriceTierRow[]
  onChange: (rows: PriceTierRow[]) => void
  rooms: TierRoom[]
  /** bazowe wyżywienie i opłata formacyjna — podpowiedzi w pustych polach */
  baseMeals: string
  baseFormation: string
  /** liczba nocy i waluta do podglądu ceny osoby */
  nights: number
}

/**
 * Poziomy cen z datami (np. Early bird → Pre-Summer → Regular). Ceny wpisane wyżej w cenniku
 * to pierwszy poziom; każdy kolejny obowiązuje od wskazanego dnia i nadpisuje tylko wypełnione pola.
 * Zgłoszenie zachowuje cenę z dnia zapisu.
 */
export default function PriceTiersEditor({ baseName, onBaseName, rows, onChange, rooms, baseMeals, baseFormation, nights }: Props) {
  const inputCls = 'rounded-[10px] border px-3 py-2 text-sm'
  const inputStyle = { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }
  const set = (id: string, patch: Partial<PriceTierRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const err = tiersError(rows)
  /** cena za cały pobyt dla jednej osoby w danym typie (do podglądu) */
  const total = (r: PriceTierRow | null, room: TierRoom) => {
    const price = num(r?.roomPrices[room.key] ?? '') ?? num(room.basePrice) ?? 0
    const meals = num(r?.mealsFee ?? '') ?? num(baseMeals) ?? 0
    const formation = num(r?.formationFee ?? '') ?? num(baseFormation) ?? 0
    return room.unit === 'room' ? `${price * nights} zł za pokój + ${meals + formation} zł / os.` : `${price * nights + meals + formation} zł / os.`
  }

  return (
    <section className="flex flex-col gap-3 rounded-[14px] border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Poziomy cen z datami</p>
      <p className="text-xs -mt-2" style={{ color: 'var(--muted)' }}>
        Ceny wpisane w cenniku to pierwszy poziom. Kolejne poziomy obowiązują od wskazanego dnia (czas polski) i zmieniają tylko pola, które wypełnisz.
        Kto zapisał się wcześniej, zachowuje swoją cenę.
      </p>
      <div className="flex items-center gap-2 flex-wrap text-sm" style={{ color: 'var(--ink)' }}>
        <span>Nazwa pierwszego poziomu</span>
        <input value={baseName} onChange={(e) => onBaseName(e.target.value)} placeholder="np. Early bird" className={inputCls} style={{ ...inputStyle, width: 180 }} aria-label="Nazwa pierwszego poziomu cen" />
        {rooms[0] && <span className="text-xs" style={{ color: 'var(--faint)' }}>{rooms[0].name}: {total(null, rooms[0])}</span>}
      </div>

      {rows.map((r) => (
        <div key={r.id} className="flex flex-col gap-2 rounded-[12px] border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
          <div className="flex items-center gap-2 flex-wrap text-sm" style={{ color: 'var(--ink)' }}>
            <input value={r.name} onChange={(e) => set(r.id, { name: e.target.value })} placeholder="Nazwa poziomu, np. Regular" className={inputCls} style={{ ...inputStyle, width: 200 }} aria-label="Nazwa poziomu" />
            <span>od dnia</span>
            <input type="date" value={r.from} onChange={(e) => set(r.id, { from: e.target.value })} className={inputCls} style={inputStyle} aria-label="Od dnia" />
            <button type="button" onClick={() => onChange(rows.filter((x) => x.id !== r.id))} aria-label="Usuń poziom" className="ml-auto" style={{ background: 'none', border: 'none', color: 'var(--err)', cursor: 'pointer' }}>
              <Trash2 size={15} />
            </button>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-sm" style={{ color: 'var(--ink)' }}>
            <span style={{ minWidth: 190 }}>Wyżywienie (cały pobyt)</span>
            <input value={r.mealsFee} onChange={(e) => set(r.id, { mealsFee: e.target.value.replace(/[^\d.,]/g, '') })} inputMode="decimal" placeholder={baseMeals || '0'} className={inputCls} style={{ ...inputStyle, width: 100 }} aria-label="Wyżywienie w tym poziomie" />
            <span style={{ color: 'var(--muted)' }}>zł</span>
            <span className="ml-3">Opłata formacyjna</span>
            <input value={r.formationFee} onChange={(e) => set(r.id, { formationFee: e.target.value.replace(/[^\d.,]/g, '') })} inputMode="decimal" placeholder={baseFormation || '0'} className={inputCls} style={{ ...inputStyle, width: 100 }} aria-label="Opłata formacyjna w tym poziomie" />
            <span style={{ color: 'var(--muted)' }}>zł</span>
          </div>
          {rooms.map((room) => (
            <div key={room.key} className="flex items-center gap-2 flex-wrap text-sm" style={{ color: 'var(--ink)' }}>
              <span className="truncate" style={{ minWidth: 190, maxWidth: 260 }}>{room.name || '(bez nazwy)'}</span>
              <input
                value={r.roomPrices[room.key] ?? ''}
                onChange={(e) => set(r.id, { roomPrices: { ...r.roomPrices, [room.key]: e.target.value.replace(/[^\d.,]/g, '') } })}
                inputMode="decimal"
                placeholder={room.basePrice || '0'}
                className={inputCls}
                style={{ ...inputStyle, width: 100 }}
                aria-label={`Cena w tym poziomie: ${room.name}`}
              />
              <span style={{ color: 'var(--muted)' }}>{room.unit === 'room' ? 'zł za pokój / noc' : 'zł za osobę / noc'}</span>
              <span className="text-xs" style={{ color: 'var(--faint)' }}>= {total(r, room)}</span>
            </div>
          ))}
        </div>
      ))}

      {err && <p className="text-xs" style={{ color: 'var(--err)' }}>{err}</p>}
      <button
        type="button"
        onClick={() => onChange([...rows, { id: `t${Date.now()}`, name: '', from: '', mealsFee: '', formationFee: '', roomPrices: {} }])}
        className="inline-flex items-center gap-1 text-xs font-semibold self-start rounded-full px-3 py-1.5"
        style={{ background: 'transparent', color: 'var(--brand)', border: '1px dashed var(--brand)', cursor: 'pointer' }}
      >
        <Plus size={12} /> Dodaj poziom cen
      </button>
    </section>
  )
}
