import { Plus, Trash2 } from 'lucide-react'
import Input from '@/components/ui/Input'
import {
  hasSpouse,
  householdCounts,
  newChild,
  type ChildDraft,
  type HouseholdDraft,
  type HouseholdMode,
} from '@/lib/households'

const MODES: Array<{ id: HouseholdMode; label: string; hint: string }> = [
  { id: 'single', label: 'Osoba', hint: 'jedna osoba' },
  { id: 'couple', label: 'Małżeństwo', hint: 'osoba + małżonek' },
  { id: 'family', label: 'Rodzina', hint: 'z dziećmi' },
]

/**
 * Skład gospodarstwa domowego (jeden rekord zaproszenia): wzorzec Osoba / Małżeństwo / Rodzina,
 * małżonek, dzieci z wiekiem, diety per osoba i notatka wewnętrzna. Kontakt (imię, nazwisko,
 * e-mail osoby głównej) jest poza edytorem — w formularzu dodawania albo w samym rekordzie.
 */
export default function HouseholdEditor({
  value,
  onChange,
  mainLastName,
  mainFirstName,
}: {
  value: HouseholdDraft
  onChange: (next: HouseholdDraft) => void
  /** Nazwisko osoby głównej — podpowiedź dla małżonka i dzieci. */
  mainLastName?: string
  mainFirstName?: string
}) {
  const set = (patch: Partial<HouseholdDraft>) => onChange({ ...value, ...patch })
  const setChild = (key: string, patch: Partial<ChildDraft>) =>
    set({ children: value.children.map((c) => (c.key === key ? { ...c, ...patch } : c)) })
  const spouse = hasSpouse(value)
  const { adults, kids } = householdCounts(value)

  function pickMode(mode: HouseholdMode) {
    // Przejście na „Rodzina" bez dzieci → od razu pusty wiersz do wpisania wieku.
    const children = mode === 'family' && value.children.length === 0 ? [newChild()] : value.children
    set({ mode, children })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex rounded-[10px] overflow-hidden p-0.5" style={{ background: 'var(--surface)' }} role="radiogroup" aria-label="Skład">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={value.mode === m.id}
              onClick={() => pickMode(m.id)}
              title={m.hint}
              className="px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-all duration-150"
              style={{
                background: value.mode === m.id ? 'var(--brand-soft)' : 'transparent',
                color: value.mode === m.id ? 'var(--brand)' : 'var(--muted)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-medium" style={{ color: 'var(--muted)' }}>
          {adults} {adults === 1 ? 'dorosły' : 'dorosłych'}
          {kids > 0 ? ` + ${kids} ${kids === 1 ? 'dziecko' : 'dzieci'}` : ''} = {adults + kids}{' '}
          {adults + kids === 1 ? 'posiłek' : adults + kids < 5 ? 'posiłki' : 'posiłków'}
        </span>
      </div>

      <Input
        placeholder={`Dieta / alergie${mainFirstName ? ` — ${mainFirstName}` : ''} (opcjonalnie)`}
        value={value.dietary}
        onChange={(e) => set({ dietary: e.target.value })}
      />

      {value.mode === 'family' && (
        <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink)' }}>
          <input
            type="checkbox"
            checked={value.familyWithSpouse}
            onChange={(e) => set({ familyWithSpouse: e.target.checked })}
          />
          z małżonkiem
        </label>
      )}

      {spouse && (
        <div className="flex flex-col gap-2 rounded-[10px] p-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Małżonek</p>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Imię" value={value.spouseFirstName} onChange={(e) => set({ spouseFirstName: e.target.value })} />
            <Input
              placeholder={mainLastName ? `Nazwisko (domyślnie ${mainLastName})` : 'Nazwisko (jeśli inne)'}
              value={value.spouseLastName}
              onChange={(e) => set({ spouseLastName: e.target.value })}
            />
          </div>
          <Input placeholder="Dieta / alergie małżonka (opcjonalnie)" value={value.spouseDietary} onChange={(e) => set({ spouseDietary: e.target.value })} />
        </div>
      )}

      {value.mode === 'family' && (
        <div className="flex flex-col gap-2 rounded-[10px] p-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Dzieci</p>
          {value.children.map((c) => (
            <div key={c.key} className="grid gap-2 items-center" style={{ gridTemplateColumns: '70px 1fr 1fr auto' }}>
              <Input
                inputMode="numeric"
                placeholder="Wiek"
                value={c.age}
                onChange={(e) => setChild(c.key, { age: e.target.value.replace(/[^0-9]/g, '').slice(0, 2) })}
              />
              <Input placeholder="Imię (opcjonalnie)" value={c.firstName} onChange={(e) => setChild(c.key, { firstName: e.target.value })} />
              <Input placeholder="Dieta (opcjonalnie)" value={c.dietary} onChange={(e) => setChild(c.key, { dietary: e.target.value })} />
              <button
                type="button"
                onClick={() => set({ children: value.children.filter((x) => x.key !== c.key) })}
                aria-label="Usuń dziecko"
                className="p-2 rounded-[8px]"
                style={{ color: 'var(--muted)', border: 'none', background: 'none', cursor: 'pointer' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => set({ children: [...value.children, newChild()] })}
            disabled={value.children.length >= 12}
            className="self-start flex items-center gap-1 text-xs font-semibold"
            style={{ color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <Plus size={13} /> Dodaj dziecko
          </button>
        </div>
      )}

      <Input
        placeholder="Notatka wewnętrzna, np. „potwierdził telefonicznie 3.10” (gość jej nie widzi)"
        value={value.adminNote}
        onChange={(e) => set({ adminNote: e.target.value })}
      />
    </div>
  )
}
