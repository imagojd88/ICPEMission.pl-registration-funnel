import { useState, useEffect, type ChangeEvent } from 'react'
import { X, Plus, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  createEventSeries,
  configureSeriesPage,
  addRoomType,
  uploadImage,
  updateEventInstance,
  getEventEditConfig,
} from '@/lib/api'
import { DEFAULT_PRICING } from '@icpe/shared'
import type { PricingConfig, AgeBracket } from '@icpe/shared'
import type { EventEditConfig } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type EventType = 'one_time' | 'evergreen' | 'standalone'
type PricingModel = 'os/noc' | 'za pokój' | 'za osobę' | 'dopłata 1-os'
type ColorSwatch = 'blue' | 'amber' | 'green' | 'purple'

interface RoomRow {
  id: string
  name: string
  model: PricingModel
  capacity: string
  price: string
  quantity: string
  tag?: string
}

/** Wiersz progu wiekowego w formularzu */
interface AgeBracketRow {
  id: string
  ltAge: string      // górna granica (wyłącznie) — string dla inputa
  multiplier: string // ułamek np. "0.7"
}

/** Opcje dodatkowe w formularzu */
interface OptionsForm {
  transport: string  // kwota zł
  bedding: string    // kwota zł/os
}

/** Kody rabatowe w formularzu */
interface DiscountRow {
  id: string
  code: string
  pct: string  // procent np. "10" → 0.1
}

interface WizardState {
  eventType: EventType
  // step 1
  name: string
  description: string
  dateStart: string
  dateEnd: string
  nights: string
  location: string
  capacity: string
  payOnline: boolean
  payTransfer: boolean
  payCash: boolean
  // step 2
  rooms: RoomRow[]
  newRoom: Omit<RoomRow, 'id'>
  // step 3 — cennik
  formationFee: string
  mealsFee: string
  ageBrackets: AgeBracketRow[]
  optionsForm: OptionsForm
  discountRows: DiscountRow[]
  // step 4
  slug: string
  color: ColorSwatch
  heroImageUrl: string
  titleColor: string
  langPL: boolean
  langEN: boolean
  langIT: boolean
}

// ── Color config ──────────────────────────────────────────────────────────────

const COLOR_OPTIONS: { id: ColorSwatch; label: string; hex: string }[] = [
  { id: 'blue', label: 'Niebiesk.', hex: '#1C5D99' },
  { id: 'amber', label: 'Bursztyn', hex: '#C56A3A' },
  { id: 'green', label: 'Leśna', hex: '#3E7D5A' },
  { id: 'purple', label: 'Fiolet', hex: '#7B52A8' },
]

const COLOR_MAP: Record<ColorSwatch, string> = {
  blue: '#1C5D99',
  amber: '#C56A3A',
  green: '#3E7D5A',
  purple: '#7B52A8',
}

const COLOR_DARK_MAP: Record<ColorSwatch, string> = {
  blue: '#164A78',
  amber: '#AD592E',
  green: '#2D5E41',
  purple: '#5E3E81',
}

const STEP_LABELS = ['Typ', 'Szczegóły', 'Pokoje', 'Cennik', 'Strona']
const FIELD_CHECKS = ['Telefon', 'Adres', 'Dieta', 'Dzieci', 'Parafia', 'Transport']

// ── Default age brackets from DEFAULT_PRICING ─────────────────────────────────

function defaultAgeBrackets(): AgeBracketRow[] {
  return DEFAULT_PRICING.childBrackets.map((b, i) => ({
    id: `bracket-${i}`,
    ltAge: String(b.ltAge),
    multiplier: String(b.multiplier),
  }))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapEventType(t: EventType): 'ONE_TIME' | 'EVERGREEN' | 'STANDALONE' {
  if (t === 'evergreen') return 'EVERGREEN'
  if (t === 'standalone') return 'STANDALONE'
  return 'ONE_TIME'
}

function apiTypeToEventType(t: string): EventType {
  if (t === 'EVERGREEN') return 'evergreen'
  if (t === 'STANDALONE') return 'standalone'
  return 'one_time'
}

function dateInput(iso?: string): string {
  return iso ? iso.slice(0, 10) : ''
}

function colorFromHex(hex?: string): ColorSwatch {
  const entry = (Object.entries(COLOR_MAP) as [ColorSwatch, string][]).find(
    ([, v]) => v.toLowerCase() === (hex ?? '').toLowerCase(),
  )
  return entry ? entry[0] : 'blue'
}

/** Mapuje dane istniejącego eventu (z API) na stan kreatora — tryb edycji. */
function mapEditConfigToState(prev: WizardState, cfg: EventEditConfig, slug: string): WizardState {
  const pc = cfg.pricingConfig
  const rooms: RoomRow[] = (pc?.rooms ?? []).map((r, i) => ({
    id: `edit-room-${i}`,
    name: r.name,
    model: (r.model as PricingModel) || 'os/noc',
    capacity: String(r.cap ?? 1),
    price: String(r.perPerson ?? 0),
    quantity: '1',
    tag: r.tag || '',
  }))
  const ageBrackets: AgeBracketRow[] = (pc?.childBrackets ?? []).map((b, i) => ({
    id: `edit-b-${i}`,
    ltAge: String(b.ltAge),
    multiplier: String(b.multiplier),
  }))
  const pm = cfg.paymentMethods ?? []
  return {
    ...prev,
    eventType: apiTypeToEventType(cfg.type),
    name: cfg.title?.pl ?? '',
    dateStart: dateInput(cfg.startsAt),
    dateEnd: dateInput(cfg.endsAt),
    nights: String(cfg.nights ?? 1),
    location: cfg.location ?? '',
    capacity: cfg.capacity != null ? String(cfg.capacity) : '',
    payOnline: pm.includes('ONLINE'),
    payTransfer: pm.includes('BANK_TRANSFER'),
    payCash: pm.includes('CASH'),
    rooms,
    formationFee: String(pc?.formationFee ?? prev.formationFee),
    mealsFee: String(pc?.mealsFee ?? prev.mealsFee),
    ageBrackets: ageBrackets.length > 0 ? ageBrackets : prev.ageBrackets,
    optionsForm: {
      transport: String(pc?.options?.transport ?? prev.optionsForm.transport),
      bedding: String(pc?.options?.bedding ?? prev.optionsForm.bedding),
    },
    discountRows: Object.entries(pc?.discountCodes ?? {}).map(([code, frac], i) => ({
      id: `edit-dc-${i}`,
      code,
      pct: String(Math.round((frac as number) * 100)),
    })),
    slug,
    color: colorFromHex(cfg.theme?.primaryColor),
    heroImageUrl: cfg.theme?.heroImageUrl ?? '',
    titleColor: cfg.theme?.titleColor ?? '#FFFFFF',
    langPL: (cfg.locales ?? ['pl']).includes('pl'),
    langEN: (cfg.locales ?? []).includes('en'),
    langIT: (cfg.locales ?? []).includes('it'),
  }
}

function mapPricingModel(m: PricingModel): 'PER_PERSON_PER_NIGHT' | 'PER_ROOM' | 'PER_PERSON' | 'SINGLE_SUPPLEMENT' {
  if (m === 'za pokój') return 'PER_ROOM'
  if (m === 'za osobę') return 'PER_PERSON'
  if (m === 'dopłata 1-os') return 'SINGLE_SUPPLEMENT'
  return 'PER_PERSON_PER_NIGHT'
}

function buildPricingConfig(state: WizardState): PricingConfig {
  const nights = parseInt(state.nights) || 0

  const roomDefs = state.rooms.map((r) => ({
    id: r.id,
    name: r.name,
    cap: parseInt(r.capacity) || 1,
    perPerson: parseFloat(r.price) || 0,
    model: r.model,
    tag: r.tag,
  }))

  // Parse age brackets (sort by ltAge ascending)
  const parsedBrackets: AgeBracket[] = state.ageBrackets
    .map((b) => ({
      ltAge: parseInt(b.ltAge) || 0,
      multiplier: parseFloat(b.multiplier) ?? 0,
    }))
    .filter((b) => b.ltAge > 0)
    .sort((a, b) => a.ltAge - b.ltAge)

  // Parse discount codes
  const discountCodes: Record<string, number> = {}
  for (const row of state.discountRows) {
    const code = row.code.trim().toUpperCase()
    const frac = parseFloat(row.pct) / 100
    if (code && !isNaN(frac)) discountCodes[code] = frac
  }

  return {
    formationFee: parseFloat(state.formationFee) || DEFAULT_PRICING.formationFee,
    mealsFee: parseFloat(state.mealsFee) || DEFAULT_PRICING.mealsFee,
    nights,
    childBrackets: parsedBrackets.length > 0 ? parsedBrackets : DEFAULT_PRICING.childBrackets,
    rooms: roomDefs.length > 0 ? roomDefs : DEFAULT_PRICING.rooms,
    options: {
      transport: parseFloat(state.optionsForm.transport) || DEFAULT_PRICING.options.transport,
      bedding: parseFloat(state.optionsForm.bedding) || DEFAULT_PRICING.options.bedding,
    },
    discountCodes: Object.keys(discountCodes).length > 0 ? discountCodes : DEFAULT_PRICING.discountCodes,
  }
}

// ── Upload zdjęcia hero (alternatywa do wklejania URL) ────────────────────────

function HeroUpload({ onUploaded }: { onUploaded: (url: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handle(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(null)
    setBusy(true)
    try {
      const url = await uploadImage(file)
      onUploaded(url)
    } catch {
      setErr('Nie udało się wgrać pliku (maks. 5 MB, tylko obrazki).')
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
        …lub wgraj zdjęcie z dysku
      </label>
      <label
        className="inline-flex items-center justify-center h-[46px] px-4 text-sm font-semibold rounded-[12px] border cursor-pointer transition-colors"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--ink)', width: 'fit-content' }}
      >
        {busy ? 'Wgrywanie…' : 'Wybierz plik (maks. 5 MB)'}
        <input type="file" accept="image/*" onChange={handle} disabled={busy} className="hidden" />
      </label>
      {err && <span className="text-xs" style={{ color: 'var(--err)' }}>{err}</span>}
    </div>
  )
}

// ── Live Preview ──────────────────────────────────────────────────────────────

function LivePreview({ state }: { state: WizardState }) {
  const heroColor = COLOR_MAP[state.color]
  const heroDark = COLOR_DARK_MAP[state.color]
  const minPrice = state.rooms.length > 0 ? Math.min(...state.rooms.map((r) => parseFloat(r.price) || 0)) : 0
  const slug = state.slug || 'nowy-event'
  const langs: string[] = [
    state.langPL && 'PL',
    state.langEN && 'EN',
    state.langIT && 'IT',
  ].filter(Boolean) as string[]

  const heroStyle = state.heroImageUrl
    ? {
        height: 120,
        backgroundImage: `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.45)), url(${state.heroImageUrl})`,
        backgroundSize: 'cover' as const,
        backgroundPosition: 'center' as const,
      }
    : {
        height: 120,
        background: `linear-gradient(135deg, ${heroColor} 0%, ${heroDark} 100%)`,
      }

  const titleColorStyle = state.titleColor || '#FFFFFF'

  return (
    <div
      className="sticky top-4 rounded-[20px] border overflow-hidden"
      style={{
        boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
        borderColor: 'var(--border)',
        background: 'var(--surface)',
      }}
    >
      <div
        className="flex flex-col items-start justify-end px-5 pb-4"
        style={heroStyle}
      >
        <p className="font-bold text-base leading-tight" style={{ color: titleColorStyle }}>
          {state.name || 'Nazwa eventu'}
        </p>
        <span
          className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
          style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}
        >
          Szkic
        </span>
      </div>

      <div className="p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
          >
            {state.eventType === 'evergreen'
              ? 'Cykliczny'
              : state.eventType === 'standalone'
                ? 'Bez noclegu'
                : 'Jednorazowy'}
          </span>
          {langs.map((l) => (
            <span
              key={l}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}
            >
              {l}
            </span>
          ))}
        </div>

        {minPrice > 0 && (
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            cena od {minPrice} zł
          </p>
        )}

        <p className="text-xs" style={{ color: 'var(--faint)', fontFamily: 'monospace' }}>
          rejestracja.icpemission.pl/r/{slug}
        </p>

        {state.dateStart && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {new Date(state.dateStart).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function Step0Type({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
        Wybierz rodzaj eventu
      </p>
      <div className="grid grid-cols-3 gap-4">
        {(
          [
            { id: 'one_time', label: 'Event jednorazowy', desc: 'Konkretna data, jedna edycja' },
            { id: 'evergreen', label: 'Event cykliczny (evergreen)', desc: 'Powtarza się automatycznie wg harmonogramu' },
            { id: 'standalone', label: 'Standalone (bez noclegu)', desc: 'Bezpłatne, proste RSVP „Będę / Nie będę"' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            onClick={() => update({ eventType: opt.id })}
            className={cn(
              'flex flex-col gap-1.5 p-5 rounded-[15px] border-2 text-left transition-all duration-150',
              state.eventType === opt.id
                ? 'border-[var(--brand)] bg-[var(--brand-soft)]'
                : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand)]',
            )}
          >
            <p
              className="font-bold text-sm"
              style={{ color: state.eventType === opt.id ? 'var(--brand)' : 'var(--ink)' }}
            >
              {opt.label}
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {opt.desc}
            </p>
          </button>
        ))}
      </div>

      {state.eventType === 'evergreen' && (
        <div
          className="mt-2 p-4 rounded-[12px] border flex flex-col gap-3"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            Konfiguracja cykliczności
          </p>
          <div className="flex gap-3">
            {['Tygodniowo', 'Miesięcznie'].map((f) => (
              <button
                key={f}
                className="px-3 py-1.5 rounded-[8px] text-sm border transition-colors hover:bg-[var(--brand-soft)]"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'].map((d) => (
              <button
                key={d}
                className="px-2.5 py-1 rounded-[8px] text-xs border transition-colors hover:bg-[var(--brand-soft)] hover:border-[var(--brand)]"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Otwórz rejestrację (dni przed)" type="number" placeholder="30" />
            <Input label="Zamknij rejestrację (dni przed)" type="number" placeholder="3" />
          </div>
        </div>
      )}
    </div>
  )
}

function Step1Details({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Nazwa eventu"
        value={state.name}
        onChange={(e) => update({ name: e.target.value })}
        placeholder="np. Dzień Formacji 2026"
      />
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Opis (na stronie zapisów)</label>
        <textarea
          value={state.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={4}
          placeholder="Krótki opis wydarzenia — zaproszenie, program, miejsce…"
          className="w-full rounded-[12px] px-3 py-[11px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)', resize: 'vertical' }}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Data rozpoczęcia"
          type="date"
          value={state.dateStart}
          onChange={(e) => {
            const newStart = e.target.value
            const patch: Partial<WizardState> = { dateStart: newStart }
            // If dateEnd is empty or earlier than new start, set it to start
            if (newStart && (!state.dateEnd || state.dateEnd < newStart)) {
              patch.dateEnd = newStart
            }
            update(patch)
          }}
        />
        <Input
          label="Data zakończenia"
          type="date"
          value={state.dateEnd}
          min={state.dateStart || undefined}
          onChange={(e) => update({ dateEnd: e.target.value })}
        />
      </div>
      <Input
        label="Liczba nocy"
        type="number"
        min={0}
        value={state.nights}
        onChange={(e) => update({ nights: e.target.value })}
        placeholder="1"
      />
      <Input
        label="Miejsce"
        value={state.location}
        onChange={(e) => update({ location: e.target.value })}
        placeholder="Centrum Formacyjne, ul. ..."
      />
      <Input
        label="Pojemność (max osób)"
        type="number"
        value={state.capacity}
        onChange={(e) => update({ capacity: e.target.value })}
        placeholder="80"
      />
      <div>
        <p className="text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>
          Metody płatności
        </p>
        <div className="flex gap-3 flex-wrap">
          {(
            [
              { key: 'payOnline', label: 'Online (karta / Przelewy24)' },
              { key: 'payTransfer', label: 'Przelew bankowy' },
              { key: 'payCash', label: 'Gotówka (na miejscu)' },
            ] as const
          ).map((opt) => (
            <label
              key={opt.key}
              className="flex items-center gap-2 cursor-pointer select-none text-sm"
              style={{ color: 'var(--ink)' }}
            >
              <input
                type="checkbox"
                checked={state[opt.key]}
                onChange={(e) => update({ [opt.key]: e.target.checked })}
                className="accent-[var(--brand)] w-4 h-4"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

function Step2Rooms({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  function addRoom() {
    if (!state.newRoom.name) return
    const room: RoomRow = { ...state.newRoom, id: Date.now().toString() }
    update({ rooms: [...state.rooms, room], newRoom: { name: '', model: 'os/noc', capacity: '', price: '', quantity: '', tag: '' } })
  }

  function removeRoom(id: string) {
    update({ rooms: state.rooms.filter((r) => r.id !== id) })
  }

  const totalBeds = state.rooms.reduce((sum, r) => sum + (parseInt(r.capacity) || 0) * (parseInt(r.quantity) || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div
        className="p-4 rounded-[12px] border flex flex-col gap-3"
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          Dodaj typ pokoju
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Nazwa"
            value={state.newRoom.name}
            onChange={(e) => update({ newRoom: { ...state.newRoom, name: e.target.value } })}
            placeholder="np. Pokój 2-osobowy"
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              Model wyceny
            </label>
            <select
              value={state.newRoom.model}
              onChange={(e) => update({ newRoom: { ...state.newRoom, model: e.target.value as PricingModel } })}
              className="rounded-[12px] border px-3 py-[13px] text-sm"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}
            >
              <option value="os/noc">os / noc</option>
              <option value="za pokój">za pokój</option>
              <option value="za osobę">za osobę</option>
              <option value="dopłata 1-os">dopłata 1-os</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Pojemność"
            type="number"
            value={state.newRoom.capacity}
            onChange={(e) => update({ newRoom: { ...state.newRoom, capacity: e.target.value } })}
            placeholder="2"
          />
          <Input
            label="Cena (zł)"
            type="number"
            value={state.newRoom.price}
            onChange={(e) => update({ newRoom: { ...state.newRoom, price: e.target.value } })}
            placeholder="80"
          />
          <Input
            label="Liczba pokoi"
            type="number"
            value={state.newRoom.quantity}
            onChange={(e) => update({ newRoom: { ...state.newRoom, quantity: e.target.value } })}
            placeholder="10"
          />
        </div>
        <Input
          label="Tag (opcjonalny)"
          value={state.newRoom.tag ?? ''}
          onChange={(e) => update({ newRoom: { ...state.newRoom, tag: e.target.value } })}
          placeholder="np. Najpopularniejsze"
        />
        <Button size="sm" onClick={addRoom} className="self-start gap-1.5">
          <Plus size={14} />
          Dodaj
        </Button>
      </div>

      {state.rooms.length > 0 && (
        <div className="overflow-x-auto rounded-[12px] border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                {['Nazwa', 'Model', 'Poj.', 'Cena', 'Szt.', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--faint)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.rooms.map((r, i) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: i < state.rooms.length - 1 ? '1px solid var(--border-2)' : undefined }}
                >
                  <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{r.name}</td>
                  <td className="px-3 py-2 text-xs" style={{ color: 'var(--muted)' }}>{r.model}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{r.capacity}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{r.price} zł</td>
                  <td className="px-3 py-2" style={{ color: 'var(--ink)' }}>{r.quantity}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeRoom(r.id)} className="p-1 hover:text-[var(--err)] transition-colors">
                      <X size={14} style={{ color: 'var(--faint)' }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Łącznie miejsc noclegowych:{' '}
        <span className="font-bold" style={{ color: 'var(--ink)' }}>{totalBeds}</span>
      </p>
    </div>
  )
}

// ── Step3Pricing — edytowalny cennik ─────────────────────────────────────────

function Step3Pricing({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  function addBracket() {
    const newBracket: AgeBracketRow = {
      id: `bracket-${Date.now()}`,
      ltAge: '',
      multiplier: '1',
    }
    update({ ageBrackets: [...state.ageBrackets, newBracket] })
  }

  function removeBracket(id: string) {
    update({ ageBrackets: state.ageBrackets.filter((b) => b.id !== id) })
  }

  function updateBracket(id: string, patch: Partial<AgeBracketRow>) {
    update({
      ageBrackets: state.ageBrackets.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    })
  }

  function addDiscountRow() {
    update({
      discountRows: [...state.discountRows, { id: `dc-${Date.now()}`, code: '', pct: '10' }],
    })
  }

  function removeDiscountRow(id: string) {
    update({ discountRows: state.discountRows.filter((r) => r.id !== id) })
  }

  function updateDiscountRow(id: string, patch: { code?: string; pct?: string }) {
    update({
      discountRows: state.discountRows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Opłaty bazowe */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          Opłaty bazowe
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Opłata formacyjna (zł/os)"
            type="number"
            min={0}
            value={state.formationFee}
            onChange={(e) => update({ formationFee: e.target.value })}
            placeholder={String(DEFAULT_PRICING.formationFee)}
          />
          <Input
            label="Wyżywienie (zł/os, cały pobyt)"
            type="number"
            min={0}
            value={state.mealsFee}
            onChange={(e) => update({ mealsFee: e.target.value })}
            placeholder={String(DEFAULT_PRICING.mealsFee)}
          />
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Nocleg konfigurowany jest per typ pokoju (krok Pokoje). Cena nocna × liczba nocy × mnożnik wiekowy.
        </p>
      </div>

      {/* Progi wiekowe */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            Progi wiekowe (dzieci)
          </p>
          <Button size="sm" variant="outline" onClick={addBracket} className="gap-1.5">
            <Plus size={13} />
            Dodaj próg
          </Button>
        </div>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Mnożnik stosowany na nocleg + wyżywienie. Próg „do wieku" wyłącznie (np. 4 = 0–3 lat).
          Mnożnik 0 = gratis (też opłata formacyjna).
        </p>
        <div className="rounded-[12px] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                <th className="px-4 py-2 text-left text-xs font-semibold" style={{ color: 'var(--faint)' }}>
                  Do wieku (wyłącznie)
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold" style={{ color: 'var(--faint)' }}>
                  Mnożnik (np. 0.7 = 70%)
                </th>
                <th className="px-4 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {state.ageBrackets.map((b, i) => (
                <tr
                  key={b.id}
                  style={{ borderBottom: i < state.ageBrackets.length - 1 ? '1px solid var(--border-2)' : undefined }}
                >
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={b.ltAge}
                      onChange={(e) => updateBracket(b.id, { ltAge: e.target.value })}
                      className="w-24 rounded-[8px] border px-2 py-1 text-sm"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }}
                      placeholder="np. 4"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={b.multiplier}
                      onChange={(e) => updateBracket(b.id, { multiplier: e.target.value })}
                      className="w-24 rounded-[8px] border px-2 py-1 text-sm"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }}
                      placeholder="0.7"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => removeBracket(b.id)}
                      className="p-1 hover:text-[var(--err)] transition-colors"
                    >
                      <X size={14} style={{ color: 'var(--faint)' }} />
                    </button>
                  </td>
                </tr>
              ))}
              {state.ageBrackets.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-xs text-center" style={{ color: 'var(--muted)' }}>
                    Brak progów — wszyscy traktowani jak dorośli (mnożnik 1.0)
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Opcje dodatkowe */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          Opcje dodatkowe
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Transport (zł / zgłoszenie)"
            type="number"
            min={0}
            value={state.optionsForm.transport}
            onChange={(e) => update({ optionsForm: { ...state.optionsForm, transport: e.target.value } })}
            placeholder={String(DEFAULT_PRICING.options.transport)}
          />
          <Input
            label="Pościel (zł / osoba)"
            type="number"
            min={0}
            value={state.optionsForm.bedding}
            onChange={(e) => update({ optionsForm: { ...state.optionsForm, bedding: e.target.value } })}
            placeholder={String(DEFAULT_PRICING.options.bedding)}
          />
        </div>
      </div>

      {/* Kody rabatowe */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            Kody rabatowe
          </p>
          <Button size="sm" variant="outline" onClick={addDiscountRow} className="gap-1.5">
            <Plus size={13} />
            Dodaj kod
          </Button>
        </div>
        {state.discountRows.length > 0 ? (
          <div
            className="rounded-[12px] border overflow-hidden"
            style={{ borderColor: 'var(--border)' }}
          >
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  <th className="px-4 py-2 text-left text-xs font-semibold" style={{ color: 'var(--faint)' }}>
                    Kod
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold" style={{ color: 'var(--faint)' }}>
                    Rabat (%)
                  </th>
                  <th className="px-4 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {state.discountRows.map((row, i) => (
                  <tr
                    key={row.id}
                    style={{ borderBottom: i < state.discountRows.length - 1 ? '1px solid var(--border-2)' : undefined }}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.code}
                        onChange={(e) => updateDiscountRow(row.id, { code: e.target.value.toUpperCase() })}
                        className="w-28 rounded-[8px] border px-2 py-1 text-sm font-mono uppercase"
                        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }}
                        placeholder="ICPE10"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={row.pct}
                        onChange={(e) => updateDiscountRow(row.id, { pct: e.target.value })}
                        className="w-20 rounded-[8px] border px-2 py-1 text-sm"
                        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }}
                        placeholder="10"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => removeDiscountRow(row.id)}
                        className="p-1 hover:text-[var(--err)] transition-colors"
                      >
                        <X size={14} style={{ color: 'var(--faint)' }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Brak kodów rabatowych. Kliknij „Dodaj kod", by dodać.
          </p>
        )}
      </div>
    </div>
  )
}

function Step4Page({ state, update }: { state: WizardState; update: (p: Partial<WizardState>) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          Adres strony
        </label>
        <div className="flex items-center gap-0">
          <span
            className="flex items-center px-3 h-[46px] rounded-l-[12px] border border-r-0 text-sm"
            style={{ background: 'var(--surface-3)', color: 'var(--faint)', borderColor: 'var(--border)' }}
          >
            /r/
          </span>
          <input
            value={state.slug}
            onChange={(e) => update({ slug: e.target.value })}
            className="flex-1 h-[46px] px-3 text-sm rounded-r-[12px] border"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface)',
              color: 'var(--ink)',
              outline: 'none',
            }}
            placeholder="nowy-event"
          />
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>
          Kolor strony
        </p>
        <div className="flex gap-3">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c.id}
              onClick={() => update({ color: c.id })}
              className="flex flex-col items-center gap-1.5"
            >
              <div
                className="rounded-full border-[3px] transition-all"
                style={{
                  width: 32,
                  height: 32,
                  background: c.hex,
                  borderColor: state.color === c.id ? c.hex : 'transparent',
                  boxShadow: state.color === c.id ? `0 0 0 2px ${c.hex}40` : undefined,
                }}
              />
              <span className="text-xs" style={{ color: 'var(--faint)' }}>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          URL zdjęcia tła hero
        </label>
        <input
          type="url"
          value={state.heroImageUrl}
          onChange={(e) => update({ heroImageUrl: e.target.value })}
          className="w-full h-[46px] px-3 text-sm rounded-[12px] border"
          style={{
            borderColor: 'var(--border)',
            background: 'var(--surface)',
            color: 'var(--ink)',
            outline: 'none',
          }}
          placeholder="https://... (wklej URL zdjęcia, np. wgranego na serwer)"
        />
      </div>

      <HeroUpload onUploaded={(url) => update({ heroImageUrl: url })} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          Kolor tytułu
        </label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={state.titleColor || '#FFFFFF'}
            onChange={(e) => update({ titleColor: e.target.value })}
            className="rounded-[8px] border cursor-pointer"
            style={{
              width: 46,
              height: 46,
              padding: 4,
              borderColor: 'var(--border)',
              background: 'var(--surface)',
            }}
          />
          <span className="text-sm font-mono" style={{ color: 'var(--muted)' }}>
            {state.titleColor || '#FFFFFF'}
          </span>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>
          Pola formularza
        </p>
        <div className="flex flex-col gap-2">
          {FIELD_CHECKS.map((field) => (
            <label key={field} className="flex items-center gap-2.5 text-sm cursor-pointer" style={{ color: 'var(--ink)' }}>
              <input type="checkbox" defaultChecked className="accent-[var(--brand)] w-4 h-4" />
              {field}
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>
          Języki strony
        </p>
        <div className="flex gap-2">
          {(
            [
              { key: 'langPL', label: 'PL' },
              { key: 'langEN', label: 'EN' },
              { key: 'langIT', label: 'IT' },
            ] as const
          ).map((l) => (
            <button
              key={l.key}
              onClick={() => update({ [l.key]: !state[l.key] })}
              className="px-3 py-1.5 rounded-full text-sm border font-semibold transition-colors"
              style={{
                borderColor: state[l.key] ? 'var(--brand)' : 'var(--border)',
                background: state[l.key] ? 'var(--brand-soft)' : 'transparent',
                color: state[l.key] ? 'var(--brand)' : 'var(--muted)',
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Success screen ────────────────────────────────────────────────────────────

function SuccessScreen({ slug, onClose }: { slug: string; onClose: () => void }) {
  const publicUrl = `https://rejestracja.icpemission.pl/r/${slug}`
  return (
    <div className="flex flex-col items-center gap-5 py-8 px-4 text-center">
      <CheckCircle size={48} style={{ color: 'var(--ok)' }} />
      <div>
        <p className="font-bold text-lg" style={{ color: 'var(--ink)' }}>Event utworzony!</p>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Strona rejestracyjna jest dostępna pod adresem:
        </p>
      </div>
      <a
        href={publicUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="px-4 py-2 rounded-[12px] text-sm font-mono break-all transition-colors hover:opacity-80"
        style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
      >
        {publicUrl}
      </a>
      <Button onClick={onClose} size="sm" className="mt-2">
        Zamknij
      </Button>
    </div>
  )
}

// ── EventWizard ───────────────────────────────────────────────────────────────

interface EventWizardProps {
  onCancel: () => void
  onSuccess?: () => void
  /** Gdy ustawione → tryb edycji istniejącego eventu. */
  editTarget?: { instanceId: string; seriesId: string; slug: string }
}

export default function EventWizard({ onCancel, onSuccess, editTarget }: EventWizardProps) {
  const isEdit = !!editTarget
  const [step, setStep] = useState(0)
  const [state, setState] = useState<WizardState>({
    eventType: 'one_time',
    name: '',
    description: '',
    dateStart: '',
    dateEnd: '',
    nights: '1',
    location: '',
    capacity: '',
    payOnline: true,
    payTransfer: true,
    payCash: false,
    rooms: [],
    newRoom: { name: '', model: 'os/noc', capacity: '', price: '', quantity: '', tag: '' },
    // Cennik — pola kwotowe startują PUSTE (admin wpisuje sam, bez auto-wypełniania).
    formationFee: '',
    mealsFee: '',
    ageBrackets: defaultAgeBrackets(),
    optionsForm: {
      transport: '',
      bedding: '',
    },
    discountRows: Object.entries(DEFAULT_PRICING.discountCodes).map(([code, frac], i) => ({
      id: `dc-init-${i}`,
      code,
      pct: String(Math.round(frac * 100)),
    })),
    slug: '',
    color: 'blue',
    heroImageUrl: '',
    titleColor: '#FFFFFF',
    langPL: true,
    langEN: false,
    langIT: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdSlug, setCreatedSlug] = useState<string | null>(null)
  const [loadingEdit, setLoadingEdit] = useState(isEdit)

  useEffect(() => {
    if (!editTarget) return
    let cancelled = false
    setLoadingEdit(true)
    getEventEditConfig(editTarget.slug)
      .then((cfg) => {
        if (!cancelled) setState((prev) => mapEditConfigToState(prev, cfg, editTarget.slug))
      })
      .catch((e: unknown) => {
        if (!cancelled) setSubmitError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoadingEdit(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTarget?.slug])

  function update(partial: Partial<WizardState>) {
    setState((prev) => ({ ...prev, ...partial }))
  }

  const isLast = step === STEP_LABELS.length - 1

  async function handlePublish() {
    if (!state.name) { setSubmitError('Podaj nazwę eventu.'); return }
    if (!state.slug) { setSubmitError('Podaj slug (adres strony).'); return }
    if (!state.dateStart) { setSubmitError('Podaj datę rozpoczęcia.'); return }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const nights = parseInt(state.nights) || 0
      const paymentMethods: string[] = []
      if (state.payOnline) paymentMethods.push('ONLINE')
      if (state.payTransfer) paymentMethods.push('BANK_TRANSFER')
      if (state.payCash) paymentMethods.push('CASH')

      // Compute endsAt: if dateEnd provided use it, else dateStart + nights days
      const endsAt = state.dateEnd
        ? new Date(`${state.dateEnd}T22:00:00`).toISOString()
        : new Date(new Date(`${state.dateStart}T14:00:00`).getTime() + nights * 86400000 + 8 * 3600000).toISOString()
      const startsAt = new Date(`${state.dateStart}T14:00:00`).toISOString()

      // Build full pricing config from wizard state
      const pricingConfig = buildPricingConfig(state)

      const locales: string[] = []
      if (state.langPL) locales.push('pl')
      if (state.langEN) locales.push('en')
      if (state.langIT) locales.push('it')
      if (locales.length === 0) locales.push('pl')

      const theme: Record<string, string> = {
        primaryColor: COLOR_MAP[state.color],
      }
      if (state.heroImageUrl) theme.heroImageUrl = state.heroImageUrl
      if (state.titleColor) theme.titleColor = state.titleColor

      // Tryb edycji — aktualizujemy istniejący event i kończymy.
      if (editTarget) {
        await updateEventInstance(editTarget.instanceId, {
          title: { pl: state.name },
          startsAt,
          endsAt,
          location: state.location || null,
          nights,
          capacity: state.capacity ? parseInt(state.capacity) : null,
          paymentMethods,
          pricingConfig,
        })
        await configureSeriesPage(editTarget.seriesId, {
          slug: state.slug,
          theme,
          enabledFields: { phone: true, address: true, dietary: true, children: true },
          locales,
          isEvergreen: state.eventType === 'evergreen',
        })
        setCreatedSlug(state.slug)
        onSuccess?.()
        return
      }

      // Step 1: create series
      const series = await createEventSeries({
        type: mapEventType(state.eventType),
        title: { pl: state.name },
        description: state.description.trim() ? { pl: state.description } : undefined,
        startsAt,
        endsAt,
        location: state.location || undefined,
        nights,
        capacity: state.capacity ? parseInt(state.capacity) : undefined,
        paymentMethods,
        pricingConfig,
        registrationOpensAt: new Date().toISOString(),
        registrationClosesAt: startsAt,
      })

      const seriesId = series.id
      const instanceId = series.instances[0]?.id
      if (!instanceId) throw new Error('Backend nie zwrócił instanceId')

      // Step 2: add room types
      for (const r of state.rooms) {
        await addRoomType(instanceId, {
          name: { pl: r.name },
          capacity: parseInt(r.capacity) || 1,
          pricingModel: mapPricingModel(r.model),
          price: parseFloat(r.price) || 0,
          quantity: parseInt(r.quantity) || 1,
        })
      }

      // Step 3: configure page (locales + theme policzone wyżej)
      await configureSeriesPage(seriesId, {
        slug: state.slug,
        theme,
        enabledFields: { phone: true, address: true, dietary: true, children: true },
        locales,
        isEvergreen: state.eventType === 'evergreen',
      })

      setCreatedSlug(state.slug)
      onSuccess?.()
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingEdit) {
    return (
      <div
        className="rounded-[20px] border px-6 py-16 text-center"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <p className="text-sm" style={{ color: 'var(--faint)' }}>Wczytywanie danych eventu…</p>
      </div>
    )
  }

  if (createdSlug) {
    return (
      <div
        className="rounded-[20px] border"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}
      >
        <SuccessScreen slug={createdSlug} onClose={onCancel} />
      </div>
    )
  }

  return (
    <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 360px' }}>
      {/* Left */}
      <div
        className="rounded-[20px] border flex flex-col"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}
      >
        {/* Step bar */}
        <div
          className="flex items-center gap-0 px-6 pt-6 pb-5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex items-center">
              <button
                onClick={() => i < step && setStep(i)}
                className={cn(
                  'flex items-center gap-2 text-sm font-medium transition-colors',
                  i === step
                    ? 'text-[var(--brand)]'
                    : i < step
                    ? 'text-[var(--ok)] cursor-pointer'
                    : 'text-[var(--faint)] cursor-default',
                )}
              >
                <span
                  className="inline-flex items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    width: 22,
                    height: 22,
                    background:
                      i === step
                        ? 'var(--brand)'
                        : i < step
                        ? 'var(--ok)'
                        : 'var(--surface-3)',
                    color: i <= step ? '#fff' : 'var(--faint)',
                  }}
                >
                  {i + 1}
                </span>
                <span className="hidden sm:block">{label}</span>
              </button>
              {i < STEP_LABELS.length - 1 && (
                <span className="mx-2 text-xs" style={{ color: 'var(--border)' }}>
                  /
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {step === 0 && <Step0Type state={state} update={update} />}
          {step === 1 && <Step1Details state={state} update={update} />}
          {step === 2 && <Step2Rooms state={state} update={update} />}
          {step === 3 && <Step3Pricing state={state} update={update} />}
          {step === 4 && <Step4Page state={state} update={update} />}
        </div>

        {/* Error */}
        {submitError && (
          <div
            className="mx-6 mb-2 px-4 py-3 rounded-[12px] text-sm"
            style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}
          >
            {submitError}
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}
            disabled={submitting}
          >
            {step === 0 ? 'Anuluj' : 'Wstecz'}
          </Button>
          <Button
            variant={isLast ? 'cta' : 'default'}
            size="sm"
            onClick={() => {
              if (isLast) {
                void handlePublish()
              } else {
                setStep(step + 1)
              }
            }}
            disabled={submitting}
          >
            {isLast ? (submitting ? 'Tworzenie...' : 'Publikuj stronę') : 'Dalej'}
          </Button>
        </div>
      </div>

      {/* Right: live preview */}
      <div>
        <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--faint)' }}>
          Podgląd
        </p>
        <LivePreview state={state} />
      </div>
    </div>
  )
}
