import { useEffect, useState, type ChangeEvent } from 'react'
import { BookUser, Check, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import {
  listSavedGuests,
  saveSavedGuest,
  deleteSavedGuest,
  listPlaces,
  createPlace,
  renamePlace,
  deletePlace,
  uploadImage,
  type SavedGuest,
  type Place,
} from '@/lib/api'

type Tab = 'guests' | 'places'
type Lang = 'pl' | 'en' | 'it'
const LANGS: Lang[] = ['pl', 'en', 'it']
const LANG_LABEL: Record<Lang, string> = { pl: 'PL', en: 'EN', it: 'IT' }

const inputCls = 'w-full rounded-[10px] px-3 py-2 text-sm'
const inputStyle = { border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' } as const
const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

/**
 * Biblioteka: goście specjalni i miejsca — zarządzanie poza tworzeniem eventu.
 * To te same listy, z których korzystają kreator i „Edytuj event” („Wybierz z biblioteki”,
 * „wybierz zapisane miejsce”).
 */
export default function LibraryScreen() {
  const [tab, setTab] = useState<Tab>('guests')
  const [guestCount, setGuestCount] = useState<number | null>(null)
  const [placeCount, setPlaceCount] = useState<number | null>(null)

  // Liczniki obu zakładek od razu (zakładka wczytuje potem własną listę).
  useEffect(() => {
    listSavedGuests().then((g) => setGuestCount(g.length)).catch(() => {})
    listPlaces().then((p) => setPlaceCount(p.length)).catch(() => {})
  }, [])

  const tabs: { id: Tab; label: string; icon: React.ElementType; count: number | null }[] = [
    { id: 'guests', label: 'Goście specjalni', icon: BookUser, count: guestCount },
    { id: 'places', label: 'Miejsca', icon: MapPin, count: placeCount },
  ]

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 860 }}>
      <div className="flex items-center gap-1 p-1 rounded-[12px] self-start" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-[9px] text-sm font-medium transition-all duration-150"
            style={tab === t.id ? { background: 'var(--surface)', color: 'var(--brand)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : { color: 'var(--muted)' }}
          >
            <t.icon size={15} />
            {t.label}
            {t.count != null && <span className="text-xs" style={{ color: 'var(--faint)' }}>{t.count}</span>}
          </button>
        ))}
      </div>
      {tab === 'guests' ? <GuestsLibrary onCount={setGuestCount} /> : <PlacesLibrary onCount={setPlaceCount} />}
    </div>
  )
}

// ── Goście specjalni ──────────────────────────────────────────────────────────

function GuestsLibrary({ onCount }: { onCount: (n: number) => void }) {
  const [guests, setGuests] = useState<SavedGuest[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // null = brak formularza; 'new' = nowy gość; id = edycja
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  useEffect(() => {
    listSavedGuests()
      .then((g) => { setGuests(g); onCount(g.length) })
      .catch((e: unknown) => { setGuests([]); setError(errMsg(e, 'Nie udało się wczytać biblioteki.')) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = (next: SavedGuest[]) => { setGuests(next); onCount(next.length) }

  async function remove(id: string) {
    try {
      await deleteSavedGuest(id)
      update((guests ?? []).filter((g) => g.id !== id))
    } catch (e: unknown) {
      setError(errMsg(e, 'Nie udało się usunąć gościa.'))
    } finally {
      setConfirmDel(null)
    }
  }

  return (
    <Panel
      title="Goście specjalni"
      desc="Zapisani goście (portret, imiona, opis w PL/EN/IT) do wyboru w kreatorze i w „Edytuj event” — przycisk „Wybierz z biblioteki”. Event dostaje kopię, więc zmiany tutaj nie zmieniają już opublikowanych eventów."
      action={editing !== 'new' && (
        <Button size="sm" onClick={() => { setError(null); setEditing('new') }}><Plus size={14} /> Dodaj gościa</Button>
      )}
    >
      {error && <ErrorBox msg={error} onClose={() => setError(null)} />}

      {editing === 'new' && (
        <GuestForm
          onCancel={() => { setError(null); setEditing(null) }}
          onSaved={(g) => { update([g, ...(guests ?? []).filter((x) => x.id !== g.id)]); setEditing(null) }}
          onError={setError}
        />
      )}

      {guests === null ? (
        <p className="text-sm" style={{ color: 'var(--faint)' }}>Wczytywanie…</p>
      ) : guests.length === 0 && editing !== 'new' ? (
        <p className="text-sm" style={{ color: 'var(--faint)' }}>Biblioteka jest pusta. Dodaj pierwszego gościa.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {guests.map((g) =>
            editing === g.id ? (
              <GuestForm
                key={g.id}
                initial={g}
                onCancel={() => { setError(null); setEditing(null) }}
                onSaved={(s) => { update([s, ...guests.filter((x) => x.id !== s.id)]); setEditing(null) }}
                onError={setError}
              />
            ) : (
              <div key={g.id} className="flex items-start gap-3 rounded-[12px] p-3" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
                {g.photoUrl ? (
                  <img src={g.photoUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: 48, height: 48 }} />
                ) : (
                  <div className="rounded-full shrink-0" style={{ width: 48, height: 48, background: 'var(--surface-2)', border: '1px solid var(--border)' }} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {g.name.pl ?? Object.values(g.name)[0]}
                    {g.plural && <span className="text-xs font-normal" style={{ color: 'var(--faint)' }}> · para</span>}
                  </p>
                  {(g.bio?.pl ?? '') && <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>{g.bio?.pl}</p>}
                  <div className="flex gap-1 mt-1.5">
                    {LANGS.map((l) => {
                      const has = !!(g.name[l]?.trim() || g.bio?.[l]?.trim())
                      return (
                        <span key={l} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: has ? 'var(--brand-soft)' : 'var(--surface-2)', color: has ? 'var(--brand)' : 'var(--faint)' }}>
                          {LANG_LABEL[l]}
                        </span>
                      )
                    })}
                  </div>
                </div>
                {confirmDel === g.id ? (
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    <span style={{ color: 'var(--err)' }}>Usunąć z biblioteki?</span>
                    <button onClick={() => { void remove(g.id) }} className="font-semibold" style={{ color: 'var(--err)', cursor: 'pointer' }}>Tak</button>
                    <button onClick={() => setConfirmDel(null)} style={{ color: 'var(--muted)', cursor: 'pointer' }}>Nie</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { setError(null); setEditing(g.id) }} title="Edytuj" className="p-1.5 rounded-[8px]" style={{ color: 'var(--muted)', cursor: 'pointer' }}><Pencil size={15} /></button>
                    <button onClick={() => setConfirmDel(g.id)} title="Usuń z biblioteki" className="p-1.5 rounded-[8px]" style={{ color: 'var(--err)', cursor: 'pointer' }}><Trash2 size={15} /></button>
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </Panel>
  )
}

function GuestForm({
  initial,
  onSaved,
  onCancel,
  onError,
}: {
  initial?: SavedGuest
  onSaved: (g: SavedGuest) => void
  onCancel: () => void
  onError: (msg: string) => void
}) {
  const [lang, setLang] = useState<Lang>('pl')
  const [name, setName] = useState<Record<string, string>>({ ...(initial?.name ?? {}) })
  const [bio, setBio] = useState<Record<string, string>>({ ...(initial?.bio ?? {}) })
  const [photoUrl, setPhotoUrl] = useState(initial?.photoUrl ?? '')
  const [plural, setPlural] = useState(!!initial?.plural)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const isPl = lang === 'pl'
  const ph = (pl: string | undefined, fallback: string) => (!isPl && pl?.trim() ? `PL: ${pl.trim()}` : fallback)

  async function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setUploading(true)
    try { setPhotoUrl(await uploadImage(f)) } catch (err: unknown) { onError(errMsg(err, 'Nie udało się wgrać zdjęcia (maks. 5 MB, tylko obrazki).')) } finally { setUploading(false) }
  }

  async function save() {
    if (!name.pl?.trim()) { setLang('pl'); onError('Wpisz imiona gościa po polsku.'); return }
    setSaving(true)
    try {
      onSaved(await saveSavedGuest({ id: initial?.id, name, bio, photoUrl, plural }))
    } catch (err: unknown) {
      onError(errMsg(err, 'Nie udało się zapisać gościa.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[12px] p-4" style={{ border: '1.5px solid var(--brand)', background: 'var(--surface)' }}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider mr-1" style={{ color: 'var(--faint)' }}>
          {initial ? 'Edycja gościa' : 'Nowy gość'} · język
        </span>
        {LANGS.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            className="text-xs font-semibold rounded-full px-3 py-1"
            style={{ background: lang === l ? 'var(--brand)' : 'transparent', color: lang === l ? '#fff' : 'var(--muted)', border: `1px solid ${lang === l ? 'var(--brand)' : 'var(--border)'}`, cursor: 'pointer' }}
          >
            {LANG_LABEL[l]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: 56, height: 56 }} />
        ) : (
          <div className="rounded-full shrink-0" style={{ width: 56, height: 56, background: 'var(--surface-2)', border: '1px solid var(--border)' }} />
        )}
        <input
          value={name[lang] ?? ''}
          onChange={(e) => setName((m) => ({ ...m, [lang]: e.target.value }))}
          placeholder={ph(name.pl, plural ? 'np. Anna i Mario Cappello' : 'Imię i nazwisko')}
          aria-label={`Imiona (${LANG_LABEL[lang]})`}
          className={inputCls}
          style={{ ...inputStyle, flex: 1 }}
          autoFocus
        />
        <label className="flex items-center gap-1 px-3 py-2 rounded-[10px] text-sm cursor-pointer shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
          {uploading ? 'Wgrywanie…' : photoUrl ? 'Zmień portret' : 'Wgraj portret'}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { void handlePhoto(e) }} />
        </label>
        {photoUrl && (
          <button type="button" onClick={() => setPhotoUrl('')} title="Usuń portret" className="p-1.5" style={{ color: 'var(--faint)', cursor: 'pointer' }}><X size={14} /></button>
        )}
      </div>
      <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>
        <input type="checkbox" checked={plural} onChange={(e) => setPlural(e.target.checked)} className="accent-[var(--brand)] w-3.5 h-3.5" />
        Para / kilka osób w jednym wpisie (np. małżeństwo — wspólne zdjęcie i opis)
      </label>
      <textarea
        value={bio[lang] ?? ''}
        onChange={(e) => setBio((m) => ({ ...m, [lang]: e.target.value }))}
        rows={3}
        placeholder={ph(bio.pl, 'Kim jest / kim są — 1–2 zdania')}
        aria-label={`Opis (${LANG_LABEL[lang]})`}
        className={inputCls}
        style={{ ...inputStyle, resize: 'vertical' }}
      />
      {!isPl && <p className="text-xs" style={{ color: 'var(--faint)' }}>Puste pola w tym języku = na stronie pokaże się wersja PL. Portret i „para” są wspólne.</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { void save() }} disabled={saving || uploading}>
          <Check size={14} /> {saving ? 'Zapisywanie…' : 'Zapisz w bibliotece'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Anuluj</Button>
      </div>
    </div>
  )
}

// ── Miejsca ───────────────────────────────────────────────────────────────────

function PlacesLibrary({ onCount }: { onCount: (n: number) => void }) {
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newLabel, setNewLabel] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sorted = (l: Place[]) => [...l].sort((a, b) => a.label.localeCompare(b.label, 'pl'))
  const update = (next: Place[]) => { setPlaces(sorted(next)); onCount(next.length) }

  useEffect(() => {
    listPlaces()
      .then(update)
      .catch((e: unknown) => { setPlaces([]); setError(errMsg(e, 'Nie udało się wczytać miejsc.')) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function add() {
    const v = newLabel.trim()
    if (!v) return
    setBusy(true)
    try {
      const p = await createPlace(v)
      update([...(places ?? []).filter((x) => x.id !== p.id), p])
      setNewLabel('')
    } catch (e: unknown) { setError(errMsg(e, 'Nie udało się dodać miejsca.')) } finally { setBusy(false) }
  }

  async function saveRename(id: string) {
    const v = editLabel.trim()
    if (!v) return
    setBusy(true)
    try {
      const p = await renamePlace(id, v)
      update((places ?? []).map((x) => (x.id === id ? p : x)))
      setEditId(null)
    } catch (e: unknown) { setError(errMsg(e, 'Nie udało się zmienić nazwy.')) } finally { setBusy(false) }
  }

  async function remove(id: string) {
    try {
      await deletePlace(id)
      update((places ?? []).filter((x) => x.id !== id))
    } catch (e: unknown) { setError(errMsg(e, 'Nie udało się usunąć miejsca.')) } finally { setConfirmDel(null) }
  }

  return (
    <Panel
      title="Miejsca"
      desc="Zapisane lokalizacje do wyboru w kreatorze i w „Edytuj event” („wybierz zapisane miejsce”). Event dostaje kopię adresu — zmiana nazwy tutaj nie zmienia istniejących eventów. Tłumaczenia adresu (EN/IT) wpisuje się w evencie."
    >
      {error && <ErrorBox msg={error} onClose={() => setError(null)} />}

      <div className="flex gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void add() }}
          placeholder="np. Centrum Formacyjne, ul. Kilińskiego 20, Ożarów Mazowiecki"
          aria-label="Nowe miejsce"
          className={inputCls}
          style={inputStyle}
        />
        <Button size="sm" onClick={() => { void add() }} disabled={busy || !newLabel.trim()} className="shrink-0">
          <Plus size={14} /> Dodaj miejsce
        </Button>
      </div>

      {places === null ? (
        <p className="text-sm" style={{ color: 'var(--faint)' }}>Wczytywanie…</p>
      ) : places.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--faint)' }}>Brak zapisanych miejsc.</p>
      ) : (
        <div className="flex flex-col rounded-[12px] overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          {places.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: i ? '1px solid var(--border)' : undefined }}>
              <MapPin size={15} className="shrink-0" style={{ color: 'var(--brand)' }} />
              {editId === p.id ? (
                <>
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void saveRename(p.id); if (e.key === 'Escape') setEditId(null) }}
                    aria-label="Nazwa miejsca"
                    className={inputCls}
                    style={inputStyle}
                    autoFocus
                  />
                  <Button size="sm" onClick={() => { void saveRename(p.id) }} disabled={busy || !editLabel.trim()} className="shrink-0">Zapisz</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)} className="shrink-0">Anuluj</Button>
                </>
              ) : (
                <>
                  <span className="text-sm flex-1 min-w-0" style={{ color: 'var(--ink)' }}>{p.label}</span>
                  {confirmDel === p.id ? (
                    <div className="flex items-center gap-2 text-xs shrink-0">
                      <span style={{ color: 'var(--err)' }}>Usunąć?</span>
                      <button onClick={() => { void remove(p.id) }} className="font-semibold" style={{ color: 'var(--err)', cursor: 'pointer' }}>Tak</button>
                      <button onClick={() => setConfirmDel(null)} style={{ color: 'var(--muted)', cursor: 'pointer' }}>Nie</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => { setEditId(p.id); setEditLabel(p.label) }} title="Zmień nazwę" className="p-1.5 rounded-[8px]" style={{ color: 'var(--muted)', cursor: 'pointer' }}><Pencil size={14} /></button>
                      <button onClick={() => setConfirmDel(p.id)} title="Usuń miejsce" className="p-1.5 rounded-[8px]" style={{ color: 'var(--err)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ── Wspólne ───────────────────────────────────────────────────────────────────

function Panel({ title, desc, action, children }: { title: string; desc: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-[15px] border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{title}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)', maxWidth: 620 }}>{desc}</p>
        </div>
        {action}
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">{children}</div>
    </div>
  )
}

function ErrorBox({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-[10px] text-sm" style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}>
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} style={{ cursor: 'pointer' }}><X size={14} /></button>
    </div>
  )
}
