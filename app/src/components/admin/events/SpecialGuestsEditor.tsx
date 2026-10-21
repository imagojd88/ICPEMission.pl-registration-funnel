import { useEffect, useState, type ChangeEvent } from 'react'
import { ArrowDown, ArrowUp, BookUser, Check, Plus, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import {
  uploadImage,
  eventGuests,
  listSavedGuests,
  saveSavedGuest,
  deleteSavedGuest,
  type EventContent,
  type LangText,
  type SpecialGuest,
  type SavedGuest,
} from '@/lib/api'

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
  /** Powiązanie z biblioteką gości (tylko w panelu — nie zapisuje się w evencie). */
  libraryId?: string
  /** Stan z chwili zapisu w bibliotece — różnica = „Zaktualizuj w bibliotece”. */
  librarySig?: string
}

/** Podpis treści gościa (do wykrywania zmian względem wersji w bibliotece). */
const sigOf = (g: { name?: Record<string, string> | null; bio?: Record<string, string> | null; photoUrl?: string | null; plural?: boolean }) =>
  JSON.stringify([clean(g.name ?? {}), clean(g.bio ?? {}), g.photoUrl ?? '', !!g.plural])

const plName = (m: Record<string, string> | null | undefined) =>
  ((m?.pl ?? Object.values(m ?? {})[0] ?? '') as string).trim().toLowerCase()

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

  // ── Biblioteka gości ──
  const [library, setLibrary] = useState<SavedGuest[] | null>(null)
  const [showLibrary, setShowLibrary] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  useEffect(() => {
    listSavedGuests().then(setLibrary).catch(() => setLibrary([]))
  }, [])

  // Goście wczytani z eventu, którzy są już w bibliotece (to samo imię PL) → oznacz powiązanie.
  useEffect(() => {
    if (!library?.length) return
    let changed = false
    const next = rows.map((r) => {
      if (r.libraryId) return r
      const hit = library.find((g) => plName(g.name) && plName(g.name) === plName(r.name))
      if (!hit) return r
      changed = true
      return { ...r, libraryId: hit.id, librarySig: sigOf(hit) }
    })
    if (changed) onChange(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, rows.length])

  async function saveToLibrary(r: GuestRow) {
    if (!plName(r.name)) { onError?.('Wpisz imiona gościa (po polsku), zanim zapiszesz go w bibliotece.'); return }
    setSavingId(r.id)
    try {
      const saved = await saveSavedGuest({ id: r.libraryId, name: clean(r.name), bio: clean(r.bio), photoUrl: r.photoUrl, plural: r.plural })
      setLibrary((lib) => [saved, ...(lib ?? []).filter((g) => g.id !== saved.id)])
      patch(r.id, { libraryId: saved.id, librarySig: sigOf(saved) })
    } catch (err: unknown) {
      onError?.(err instanceof Error ? err.message : 'Nie udało się zapisać gościa w bibliotece.')
    } finally {
      setSavingId(null)
    }
  }

  function addFromLibrary(g: SavedGuest) {
    onChange([
      ...rows,
      {
        ...newGuestRow(),
        name: { ...g.name },
        bio: { ...(g.bio ?? {}) },
        photoUrl: g.photoUrl ?? '',
        plural: !!g.plural,
        libraryId: g.id,
        librarySig: sigOf(g),
      },
    ])
  }

  async function removeFromLibrary(id: string) {
    try {
      await deleteSavedGuest(id)
      setLibrary((lib) => (lib ?? []).filter((g) => g.id !== id))
      // Karty w evencie zostają — tracą tylko powiązanie z biblioteką.
      if (rows.some((r) => r.libraryId === id)) {
        onChange(rows.map((r) => (r.libraryId === id ? { ...r, libraryId: undefined, librarySig: undefined } : r)))
      }
    } catch (err: unknown) {
      onError?.(err instanceof Error ? err.message : 'Nie udało się usunąć gościa z biblioteki.')
    } finally {
      setConfirmDel(null)
    }
  }

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
      {/* Biblioteka zapisanych gości */}
      {library && library.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowLibrary((v) => !v)}
            className="self-start flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-[10px]"
            style={{ border: '1px solid var(--brand)', color: 'var(--brand)', background: showLibrary ? 'var(--brand-soft)' : 'transparent', cursor: 'pointer' }}
          >
            <BookUser size={14} /> Wybierz z biblioteki ({library.length})
          </button>
          {showLibrary && (
            <div className="flex flex-col rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
              {library.map((g, i) => {
                const added = rows.some((r) => r.libraryId === g.id)
                const bioPl = (g.bio?.pl ?? Object.values(g.bio ?? {})[0] ?? '') as string
                return (
                  <div
                    key={g.id}
                    className="flex items-center gap-3 px-3 py-2"
                    style={{ borderTop: i ? '1px solid var(--border-2, var(--border))' : undefined }}
                  >
                    {g.photoUrl ? (
                      <img src={g.photoUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: 36, height: 36 }} />
                    ) : (
                      <div className="rounded-full shrink-0" style={{ width: 36, height: 36, background: 'var(--surface-2)', border: '1px solid var(--border)' }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                        {g.name.pl ?? Object.values(g.name)[0]}
                        {g.plural && <span className="text-xs font-normal" style={{ color: 'var(--faint)' }}> · para</span>}
                      </p>
                      {bioPl && <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>{bioPl}</p>}
                    </div>
                    {confirmDel === g.id ? (
                      <div className="flex items-center gap-2 shrink-0 text-xs">
                        <span style={{ color: 'var(--err)' }}>Usunąć z biblioteki?</span>
                        <button type="button" onClick={() => { void removeFromLibrary(g.id) }} className="font-semibold" style={{ color: 'var(--err)', cursor: 'pointer' }}>Tak</button>
                        <button type="button" onClick={() => setConfirmDel(null)} style={{ color: 'var(--muted)', cursor: 'pointer' }}>Nie</button>
                      </div>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => addFromLibrary(g)} disabled={added}>
                          {added ? '✓ Dodany' : 'Dodaj'}
                        </Button>
                        <button type="button" onClick={() => setConfirmDel(g.id)} title="Usuń z biblioteki" className="p-1.5 rounded-[8px] shrink-0" style={{ color: 'var(--faint)', cursor: 'pointer' }}>
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

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
          <div className="flex items-center gap-2 -mt-1">
            {r.libraryId && r.librarySig === sigOf(r) ? (
              <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--ok)' }}>
                <Check size={12} /> W bibliotece
              </span>
            ) : (
              <button
                type="button"
                onClick={() => { void saveToLibrary(r) }}
                disabled={savingId === r.id || (!plName(r.name) && !r.photoUrl)}
                className="flex items-center gap-1 text-xs font-medium"
                style={{ color: 'var(--brand)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', opacity: !plName(r.name) && !r.photoUrl ? 0.4 : 1 }}
              >
                <BookUser size={12} />
                {savingId === r.id ? 'Zapisuję…' : r.libraryId ? 'Zaktualizuj w bibliotece' : 'Zapisz w bibliotece'}
              </button>
            )}
          </div>
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
