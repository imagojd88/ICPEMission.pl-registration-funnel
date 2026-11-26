import { Plus, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { ADDON_TEMPLATES, type AddonDef } from '@icpe/shared'

/**
 * „Edytuj event” ▸ Cennik ▸ „Dodatki z limitem”: lista dodatków eventu (`pricingConfig.addons`),
 * np. dostawka albo łóżeczko turystyczne — limit sztuk w evencie, maksimum na zgłoszenie, cena,
 * warunek „tylko gdy w zgłoszeniu jest dziecko poniżej N lat”. Dwa gotowe szablony jednym kliknięciem.
 * Gość zaznacza dodatek w kroku „Opcje”; po wyczerpaniu limitu opcja jest nieaktywna.
 */
export interface AddonRow {
  /** klucz wiersza w formularzu */
  key: string
  /** stałe id dodatku (zapisane w zgłoszeniach) — nie zmienia się po utworzeniu */
  id: string
  name: Record<string, string>
  desc: Record<string, string>
  limit: string
  max: string
  price: string
  childUnderAge: string
}

const toMap = (v: unknown): Record<string, string> =>
  typeof v === 'string' ? (v ? { pl: v } : {}) : v && typeof v === 'object' ? { ...(v as Record<string, string>) } : {}
const clean = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v))
const int = (v: string) => Math.max(0, parseInt(v.replace(/\D/g, '')) || 0)

export function addonsToRows(addons: AddonDef[] | undefined | null): AddonRow[] {
  return (Array.isArray(addons) ? addons : []).filter((a) => a && typeof a.id === 'string').map((a, i) => ({
    key: `ad-${i}-${a.id}`,
    id: a.id,
    name: toMap(a.name),
    desc: toMap(a.desc),
    limit: a.limit ? String(a.limit) : '',
    max: String(a.maxPerRegistration || 1),
    price: a.price ? String(a.price) : '',
    childUnderAge: a.childUnderAge ? String(a.childUnderAge) : '',
  }))
}

export function rowsToAddons(rows: AddonRow[]): AddonDef[] {
  return rows
    .filter((r) => Object.keys(clean(r.name)).length > 0)
    .map((r) => {
      const desc = clean(r.desc)
      const price = parseFloat(r.price.replace(',', '.')) || 0
      return {
        id: r.id,
        name: clean(r.name),
        ...(Object.keys(desc).length ? { desc } : {}),
        ...(int(r.limit) > 0 ? { limit: int(r.limit) } : {}),
        maxPerRegistration: Math.max(1, int(r.max) || 1),
        price: price > 0 ? Math.round(price * 100) / 100 : 0,
        ...(int(r.childUnderAge) > 0 ? { childUnderAge: int(r.childUnderAge) } : {}),
      }
    })
}

/** Błąd konfiguracji dodatków (null = OK). */
export function addonsError(rows: AddonRow[]): string | null {
  for (const r of rows) {
    const named = Object.keys(clean(r.name)).length > 0
    if (!named) return 'Dodatki z limitem: każdy dodatek musi mieć nazwę (co najmniej po polsku). Usuń pusty wiersz albo wpisz nazwę.'
    if (!clean(r.name).pl) return `Dodatki z limitem: dodatek „${Object.values(clean(r.name))[0]}” nie ma polskiej nazwy.`
    if (int(r.limit) > 0 && int(r.max) > int(r.limit)) return `Dodatki z limitem: „${clean(r.name).pl}” — maksimum na zgłoszenie nie może być większe niż limit w evencie.`
  }
  return null
}

function newId(rows: AddonRow[], wanted?: string): string {
  const used = new Set(rows.map((r) => r.id))
  if (wanted && !used.has(wanted)) return wanted
  let n = 1
  while (used.has(`a${n}`)) n++
  return `a${n}`
}

export default function AddonsEditor({
  rows,
  onChange,
  editLang,
  langLabel,
  usage,
  currencyLabel,
  free,
  inputCls,
  inputStyle,
}: {
  rows: AddonRow[]
  onChange: (rows: AddonRow[]) => void
  /** język, w którym edytowane są nazwy i opisy (przełącznik języka formularza) */
  editLang: string
  langLabel: string
  /** ile sztuk zajmują aktywne zgłoszenia (z API) */
  usage: Record<string, number>
  currencyLabel: string
  free: boolean
  inputCls: string
  inputStyle: React.CSSProperties
}) {
  const set = (key: string, patch: Partial<AddonRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const addTemplate = (i: number) => {
    const t = ADDON_TEMPLATES[i]
    onChange([...rows, {
      key: `ad-new-${Date.now()}`,
      id: newId(rows, t.id),
      name: toMap(t.name),
      desc: toMap(t.desc),
      limit: t.limit ? String(t.limit) : '',
      max: String(t.maxPerRegistration ?? 1),
      price: '',
      childUnderAge: t.childUnderAge ? String(t.childUnderAge) : '',
    }])
  }
  const addEmpty = () =>
    onChange([...rows, { key: `ad-new-${Date.now()}`, id: newId(rows), name: {}, desc: {}, limit: '', max: '1', price: '', childUnderAge: '' }])

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Dodatki z limitem</span>
      <p className="text-xs -mt-1" style={{ color: 'var(--muted)' }}>
        Rzeczy, których w ośrodku jest ograniczona liczba (np. dostawka, łóżeczko turystyczne). Gość zaznacza je w kroku „Opcje” i widzi, ile zostało;
        po wyczerpaniu limitu opcja jest nieaktywna („Brak dostępnych”) — realizowane są tylko pierwsze zamówienia, bez listy rezerwowej.
        Anulowanie zgłoszenia zwalnia sztuki. Zamówienia i kolejność: Zgłoszenia ▸ „Diety i dodatki”.
      </p>

      {rows.map((r) => {
        const used = usage[r.id] ?? 0
        const limit = int(r.limit)
        return (
          <div key={r.key} className="flex flex-col gap-2 rounded-[12px] p-3" style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <div className="flex items-center gap-2">
              <input
                value={r.name[editLang] ?? ''}
                onChange={(e) => set(r.key, { name: { ...r.name, [editLang]: e.target.value } })}
                placeholder={editLang !== 'pl' && r.name.pl ? `PL: ${r.name.pl}` : `Nazwa dodatku (${langLabel})`}
                aria-label={`Nazwa dodatku (${langLabel})`}
                className={inputCls}
                style={inputStyle}
              />
              <button type="button" onClick={() => onChange(rows.filter((x) => x.key !== r.key))} className="p-2 rounded-[8px]" style={{ color: 'var(--err)' }} aria-label="Usuń dodatek">
                <Trash2 size={15} />
              </button>
            </div>
            <textarea
              value={r.desc[editLang] ?? ''}
              onChange={(e) => set(r.key, { desc: { ...r.desc, [editLang]: e.target.value } })}
              placeholder={editLang !== 'pl' && r.desc.pl ? `PL: ${r.desc.pl}` : `Opis pod nazwą (${langLabel}, opcjonalnie)`}
              aria-label={`Opis dodatku (${langLabel})`}
              rows={2}
              className={inputCls}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <div className="flex items-end gap-3 flex-wrap text-xs" style={{ color: 'var(--muted)' }}>
              <label className="flex flex-col gap-1">
                Limit sztuk w evencie
                <input value={r.limit} onChange={(e) => set(r.key, { limit: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="bez limitu" className={inputCls} style={{ ...inputStyle, width: 120 }} />
              </label>
              <label className="flex flex-col gap-1">
                Maks. na zgłoszenie
                <input value={r.max} onChange={(e) => set(r.key, { max: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="1" className={inputCls} style={{ ...inputStyle, width: 120 }} />
              </label>
              {!free && (
                <label className="flex flex-col gap-1">
                  Cena za sztukę ({currencyLabel})
                  <input value={r.price} onChange={(e) => set(r.key, { price: e.target.value.replace(/[^\d.,]/g, '') })} inputMode="decimal" placeholder="0 = bezpłatnie" className={inputCls} style={{ ...inputStyle, width: 140 }} />
                </label>
              )}
              <label className="flex flex-col gap-1">
                Tylko gdy jest dziecko poniżej (lat)
                <input value={r.childUnderAge} onChange={(e) => set(r.key, { childUnderAge: e.target.value.replace(/\D/g, '') })} inputMode="numeric" placeholder="zawsze widoczny" className={inputCls} style={{ ...inputStyle, width: 150 }} />
              </label>
            </div>
            <span className="text-xs" style={{ color: limit > 0 && used > limit ? 'var(--err)' : 'var(--faint)' }}>
              Zamówiono: {used}{limit > 0 ? ` z ${limit}` : ' (bez limitu)'}
              {limit > 0 && used > limit ? ' — więcej niż limit; nowych zamówień gość nie złoży, istniejące zostają' : ''}
              {' · '}id: {r.id}
            </span>
          </div>
        )
      })}

      <div className="flex items-center gap-2 flex-wrap">
        {ADDON_TEMPLATES.map((t, i) => {
          const present = rows.some((r) => r.id === t.id)
          return (
            <Button key={t.id} size="sm" variant="outline" onClick={() => addTemplate(i)} disabled={present} title={present ? 'Ten dodatek jest już na liście' : undefined}>
              <Plus size={14} /> {t.templateLabel}
            </Button>
          )
        })}
        <Button size="sm" variant="outline" onClick={addEmpty}>
          <Plus size={14} /> Własny dodatek
        </Button>
      </div>
      <p className="text-xs" style={{ color: 'var(--faint)' }}>
        Szablony wstawiają nazwę i opis od razu w PL / EN / IT / KO / ZH (dostawka: limit 8, 1 na zgłoszenie; łóżeczko: limit 5, do 2 na zgłoszenie, widoczne przy dziecku poniżej 3 lat).
        Zmiany wchodzą po „Zapisz zmiany” na dole formularza.
      </p>
    </div>
  )
}
