import { useState } from 'react'
import { X, Plus, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { createEventSeries, configureSeriesPage, addRoomType } from '@/lib/api'
import { DEFAULT_PRICING } from '@icpe/shared'
import type { PricingConfig } from '@icpe/shared'

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
}

interface WizardState {
  eventType: EventType
  // step 1
  name: string
  dateStart: string
  dateEnd: string
  nights: string
  location: string
  capacity: string
  payOnline: boolean
  payTransfer: boolean
  // step 2
  rooms: RoomRow[]
  newRoom: Omit<RoomRow, 'id'>
  // step 4
  slug: string
  color: ColorSwatch
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

const AGE_BRACKETS = [
  { range: '< 3 lata', pct: '0%' },
  { range: '3–11 lat', pct: '70%' },
  { range: '12–17 lat', pct: '90%' },
  { range: '18+ lat', pct: '100%' },
]

const STEP_LABELS = ['Typ', 'Szczegóły', 'Pokoje', 'Cennik', 'Strona']
const FIELD_CHECKS = ['Telefon', 'Adres', 'Dieta', 'Dzieci', 'Parafia', 'Transport']

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapEventType(t: EventType): 'ONE_TIME' | 'EVERGREEN' | 'STANDALONE' {
  if (t === 'evergreen') return 'EVERGREEN'
  if (t === 'standalone') return 'STANDALONE'
  return 'ONE_TIME'
}

function mapPricingModel(m: PricingModel): 'PER_PERSON_PER_NIGHT' | 'PER_ROOM' | 'PER_PERSON' | 'SINGLE_SUPPLEMENT' {
  if (m === 'za pokój') return 'PER_ROOM'
  if (m === 'za osobę') return 'PER_PERSON'
  if (m === 'dopłata 1-os') return 'SINGLE_SUPPLEMENT'
  return 'PER_PERSON_PER_NIGHT'
}

function buildPricingConfig(rooms: RoomRow[], nights: number): PricingConfig {
  const roomDefs = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    cap: parseInt(r.capacity) || 1,
    perPerson: parseFloat(r.price) || 0,
    model: r.model,
  }))
  return {
    ...DEFAULT_PRICING,
    nights,
    rooms: roomDefs.length > 0 ? roomDefs : DEFAULT_PRICING.rooms,
  }
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
        style={{
          height: 120,
          background: `linear-gradient(135deg, ${heroColor} 0%, ${heroDark} 100%)`,
        }}
      >
        <p className="font-bold text-white text-base leading-tight">
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
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Data rozpoczęcia"
          type="date"
          value={state.dateStart}
          onChange={(e) => update({ dateStart: e.target.value })}
        />
        <Input
          label="Data zakończenia"
          type="date"
          value={state.dateEnd}
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
        <div className="flex gap-3">
          {(
            [
              { key: 'payOnline', label: 'Online (karta / Przelewy24)' },
              { key: 'payTransfer', label: 'Przelew bankowy' },
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
    update({ rooms: [...state.rooms, room], newRoom: { name: '', model: 'os/noc', capacity: '', price: '', quantity: '' } })
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

function Step3Pricing() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>
          Progi wiekowe
        </p>
        <div className="rounded-[12px] border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                <th className="px-4 py-2 text-left text-xs font-semibold" style={{ color: 'var(--faint)' }}>Wiek</th>
                <th className="px-4 py-2 text-left text-xs font-semibold" style={{ color: 'var(--faint)' }}>% ceny</th>
              </tr>
            </thead>
            <tbody>
              {AGE_BRACKETS.map((b, i) => (
                <tr
                  key={b.range}
                  style={{ borderBottom: i < AGE_BRACKETS.length - 1 ? '1px solid var(--border-2)' : undefined }}
                >
                  <td className="px-4 py-2.5" style={{ color: 'var(--ink)' }}>{b.range}</td>
                  <td className="px-4 py-2.5">
                    <input
                      defaultValue={b.pct}
                      className="w-20 rounded-[8px] border px-2 py-1 text-sm"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>
          Opcje dodatkowe
        </p>
        <div className="flex gap-2 flex-wrap">
          {['Transport', 'Pościel'].map((opt) => (
            <button
              key={opt}
              className="px-3 py-1.5 rounded-full text-sm border font-medium transition-colors"
              style={{ borderColor: 'var(--brand)', color: 'var(--brand)', background: 'var(--brand-soft)' }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>
          Kody rabatowe
        </p>
        <div
          className="rounded-[12px] border p-3 flex flex-col gap-2"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="font-mono" style={{ color: 'var(--ink)' }}>ICPE10</span>
            <span style={{ color: 'var(--muted)' }}>–10%</span>
          </div>
          <Button size="sm" variant="outline" className="self-start gap-1.5 mt-1">
            <Plus size={13} />
            Dodaj kod
          </Button>
        </div>
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
}

export default function EventWizard({ onCancel, onSuccess }: EventWizardProps) {
  const [step, setStep] = useState(0)
  const [state, setState] = useState<WizardState>({
    eventType: 'one_time',
    name: '',
    dateStart: '',
    dateEnd: '',
    nights: '1',
    location: '',
    capacity: '',
    payOnline: true,
    payTransfer: true,
    rooms: [],
    newRoom: { name: '', model: 'os/noc', capacity: '', price: '', quantity: '' },
    slug: '',
    color: 'blue',
    langPL: true,
    langEN: false,
    langIT: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdSlug, setCreatedSlug] = useState<string | null>(null)

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

      // Compute endsAt: if dateEnd provided use it, else dateStart + nights days
      let endsAt = state.dateEnd
        ? new Date(`${state.dateEnd}T22:00:00`).toISOString()
        : new Date(new Date(`${state.dateStart}T14:00:00`).getTime() + nights * 86400000 + 8 * 3600000).toISOString()
      const startsAt = new Date(`${state.dateStart}T14:00:00`).toISOString()

      // Step 1: create series
      const series = await createEventSeries({
        type: mapEventType(state.eventType),
        title: { pl: state.name },
        startsAt,
        endsAt,
        location: state.location || undefined,
        nights,
        capacity: state.capacity ? parseInt(state.capacity) : undefined,
        paymentMethods,
        pricingConfig: buildPricingConfig(state.rooms, nights),
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

      // Step 3: configure page
      const locales: string[] = []
      if (state.langPL) locales.push('pl')
      if (state.langEN) locales.push('en')
      if (state.langIT) locales.push('it')
      if (locales.length === 0) locales.push('pl')

      await configureSeriesPage(seriesId, {
        slug: state.slug,
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
        <div className="flex-1 p-6">
          {step === 0 && <Step0Type state={state} update={update} />}
          {step === 1 && <Step1Details state={state} update={update} />}
          {step === 2 && <Step2Rooms state={state} update={update} />}
          {step === 3 && <Step3Pricing />}
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
            ← {step === 0 ? 'Anuluj' : 'Wstecz'}
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
            {isLast ? (submitting ? 'Tworzenie...' : 'Publikuj stronę ✓') : 'Dalej →'}
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
