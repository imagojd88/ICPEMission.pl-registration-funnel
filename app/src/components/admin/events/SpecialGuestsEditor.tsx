import { useState, type ChangeEvent } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { uploadImage, eventGuests, type EventContent, type LangText, type SpecialGuest } from '@/lib/api'

type Lang = 'pl' | 'en' | 'it'
const LANG_LABEL: Record<Lang, string> = { pl: 'PL', en: 'EN', it: 'IT' }

/** Wiersz edytora: imiona i opis jako mapy językowe {pl, en, it}. */
export interface GuestRow {
  id: string
  name: Record<string, string>
  bio: Record<string, string>
  photoUrl: string
  /** Para / kilka osób w jednym wpisie (np. małżeństwo) — jedno zdjęcie, wspólny opis. */
  plural: boolean
}

const asMap = (v: LangText | undefined): Record<string, string> =>
  typeof v === 'string' ? (v ? { pl: v } : {}) : { ...(v ?? {}) }

const clean = (m: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v))

let seq = 0
export const newGuestRow = (): GuestRow => ({ id: `g-${Date.now()}-${++seq}`, name: {}, bio: {}, photoUrl: '', plural: false })

/** Goście z ustawień eventu (nowy `specialGuests` albo stary `specialGuest`) → wiersze edytora. */
export function guestRowsFrom(content: EventContent | null | undefined): GuestRow[] {
  return eventGuests(content).map((g) => ({
    ...newGuestRow(),
    name: asMap(g.name),
    bio: asMap(g.bio),
    photoUrl: g.photoUrl ?? '',
    plural: !!g.plural,
  }))
}

/** Wiersze → `customFields.specialGuests` (puste wpisy pomijamy). */
export function guestsToSave(rows: GuestRow[]): SpecialGuest[] {
  return rows
    .map((r) => ({ name: clean(r.name), bio: clean(r.bio), photoUrl: r.photoUrl, plural: r.plural }))
    .filter((g) => Object.keys(g.name).length || g.photoUrl)
}

/** Ilu gościom brakuje tłumaczenia opisu na `lang` (do licznika braków w zakładkach języków). */
export function guestsMissingBio(rows: GuestRow[], lang: string): number {
  return rows.filter((r) => r.bio.pl?.trim() && !r.bio[lang]?.trim()).length
}

export function guestsHaveContentIn(rows: GuestRow[], lang: string): boolean {
  return rows.some((r) => r.name[lang]?.trim() || r.bio[lang]?.trim())
}

/**
 * Lista gości specjalnych: dowolnie wielu, każdy z portretem, imionami i krótkim opisem.
 * Imiona i opis edytuje się w bieżącym języku treści (`lang`); portret i „para” są wspólne.
 */
export default function SpecialGuestsEditor({
  rows,
  onChange,
  lang,
  onError,
}: {
  rows: GuestRow[]
  onChange: (rows: GuestRow[]) => void
  lang: Lang
  onError?: (msg: string) => void
}) {
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const isPl = lang === 'pl'

  const patch = (id: string, p: Partial<GuestRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const setText = (id: string, key: 'name' | 'bio', v: string) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, [key]: { ...r[key], [lang]: v } } : r)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= rows.length) return
    const next = [...rows]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const ph = (pl: string | undefined, fallback: string) => (!isPl && pl?.trim() ? `PL: ${pl.trim()}` : fallback)

  async function handlePhoto(id: string, e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setUploadingId(id)
    try {
      patch(id, { photoUrl: await uploadImage(f) })
    } catch (err: unknown) {
      onError?.(err instanceof Error ? err.message : 'Nie udało się wgrać zdjęcia (maks. 5 MB, tylko obrazki).')
    } finally {
      setUploadingId(null)
    }
  }

  const inputCls = 'w-full rounded-[10px] px-3 py-2 text-sm'
  const inputStyle = { border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' } as const

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--faint)' }}>
          Brak gości specjalnych. Dodaj jednego lub kilku — na stronie pokażą się w tej kolejności.
        </p>
      )}

      {rows.map((r, i) => (
        <div
          key={r.id}
          className="flex flex-col gap-2 rounded-[12px] p-3"
          style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
        >
          <div className="flex items-center gap-3">
            {r.photoUrl ? (
              <img src={r.photoUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: 44, height: 44 }} />
            ) : (
              <div className="rounded-full shrink-0" style={{ width: 44, height: 44, background: 'var(--surface-2)', border: '1px solid var(--border)' }} />
            )}
            <input
              value={r.name[lang] ?? ''}
              onChange={(e) => setText(r.id, 'name', e.target.value)}
              placeholder={ph(r.name.pl, r.plural ? 'np. Anna i Mario Cappello' : 'Imię i nazwisko')}
              aria-label={`Gość ${i + 1} — imiona (${LANG_LABEL[lang]})`}
              className={inputCls}
              style={{ ...inputStyle, flex: 1 }}
            />
            <label
              className="flex items-center gap-1 px-3 py-2 rounded-[10px] text-sm cursor-pointer shrink-0"
              style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              {uploadingId === r.id ? '…' : r.photoUrl ? 'Zmień portret' : 'Portret'}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { void handlePhoto(r.id, e) }} />
            </label>
            <div className="flex items-center shrink-0">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} title="W górę" className="p-1.5 rounded-[8px]" style={{ color: i === 0 ? 'var(--border)' : 'var(--muted)', cursor: i === 0 ? 'default' : 'pointer' }}>
                <ArrowUp size={14} />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="W dół" className="p-1.5 rounded-[8px]" style={{ color: i === rows.length - 1 ? 'var(--border)' : 'var(--muted)', cursor: i === rows.length - 1 ? 'default' : 'pointer' }}>
                <ArrowDown size={14} />
              </button>
              <button type="button" onClick={() => onChange(rows.filter((x) => x.id !== r.id))} title="Usuń gościa" className="p-1.5 rounded-[8px]" style={{ color: 'var(--err)', cursor: 'pointer' }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>
            <input
              type="checkbox"
              checked={r.plural}
              onChange={(e) => patch(r.id, { plural: e.target.checked })}
              className="accent-[var(--brand)] w-3.5 h-3.5"
            />
            Para / kilka osób w jednym wpisie (np. małżeństwo — wspólne zdjęcie i opis)
          </label>
          <textarea
            value={r.bio[lang] ?? ''}
            onChange={(e) => setText(r.id, 'bio', e.target.value)}
            rows={2}
            placeholder={ph(r.bio.pl, 'Kim jest / kim są — 1–2 zdania')}
            aria-label={`Gość ${i + 1} — opis (${LANG_LABEL[lang]})`}
            className={inputCls}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
      ))}

      <Button size="sm" variant="outline" onClick={() => onChange([...rows, newGuestRow()])} className="self-start">
        <Plus size={14} /> {rows.length ? 'Dodaj kolejnego gościa' : 'Dodaj gościa specjalnego'}
      </Button>
      {!isPl && rows.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--faint)' }}>
          Imiona: puste = jak po polsku. Portret i „para” są wspólne dla wszystkich języków.
        </p>
      )}
    </div>
  )
}
