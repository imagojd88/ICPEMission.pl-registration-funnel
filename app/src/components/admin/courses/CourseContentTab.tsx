import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, FileText, Film, Layers, Lock, Pencil, PlayCircle, Plus, Trash2, Upload, Wrench, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  createCourseModule, createVideoItem, deleteCourseItem, deleteCourseModule, diagnoseVideo, formatBytes, formatDuration, removeItemPdf,
  reorderCourseItems, reorderCourseModules, setItemPdf, setupVideoCors, updateCourseItem, updateCourseModule, uploadPdfItem,
  isoToLocalInput, localInputToIso, fmtWhen,
  type CourseDetail, type CourseItem, type CourseModule, type CoursesConfig, type LangText, type PdfLang,
} from '@/lib/courses'
import { probeVideo } from '@/lib/r2Upload'
import type { UploadState } from './CourseEditor'
import { Notice, Panel, VideoStateBadge, errMsg, t } from './shared'

interface Props {
  course: CourseDetail
  config: CoursesConfig | null
  uploads: Record<string, UploadState>
  onStartUpload: (itemId: string, file: File, init?: import('@/lib/courses').VideoUploadInit) => void
  onCancelUpload: (itemId: string) => void
  onChanged: () => Promise<void> | void
  onOpenSettings?: () => void
}

/** Grupa materiałów w widoku: moduł albo „bez modułu" (moduleId = null). */
type Group = { module: CourseModule | null; items: CourseItem[] }

function groupItems(course: CourseDetail): Group[] {
  const ids = new Set(course.modules.map((m) => m.id))
  const groups: Group[] = course.modules.map((m) => ({ module: m, items: course.items.filter((i) => i.moduleId === m.id) }))
  const loose = course.items.filter((i) => !i.moduleId || !ids.has(i.moduleId))
  // Materiały bez modułu: na górze (zawsze dostępne, poza kolejnością modułów).
  if (loose.length || !course.modules.length) groups.unshift({ module: null, items: loose })
  return groups
}

export default function CourseContentTab({ course, config, uploads, onStartUpload, onCancelUpload, onChanged, onOpenSettings }: Props) {
  const [error, setError] = useState<string | null>(null)
  const videoReady = config?.video.configured !== false
  const groups = groupItems(course)
  const hasModules = course.modules.length > 0

  /** Przesunięcie materiału w obrębie grupy; zapisujemy pełną kolejność (grupy po kolei). */
  async function moveItem(group: Group, idx: number, dir: -1 | 1) {
    const local = group.items.map((i) => i.id)
    const j = idx + dir
    if (j < 0 || j >= local.length) return
    ;[local[idx], local[j]] = [local[j], local[idx]]
    const ids = groups.flatMap((g) => (g === group ? local : g.items.map((i) => i.id)))
    try {
      await reorderCourseItems(course.id, ids)
      await onChanged()
    } catch (e) {
      setError(errMsg(e))
    }
  }

  async function moveModule(idx: number, dir: -1 | 1) {
    const ids = course.modules.map((m) => m.id)
    const j = idx + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    try {
      await reorderCourseModules(course.id, ids)
      await onChanged()
    } catch (e) {
      setError(errMsg(e))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <Notice kind="err">{error}</Notice>}

      <SequenceInfo course={course} onOpenSettings={onOpenSettings} />

      {groups.map((g) => {
        const mIdx = g.module ? course.modules.findIndex((m) => m.id === g.module!.id) : -1
        const list = (
          <>
            {g.items.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                {g.module
                  ? 'Pusty moduł — dodaj do niego film albo PDF poniżej (pole „Moduł") albo przenieś istniejący materiał.'
                  : 'Brak materiałów. Dodaj filmy i pliki PDF poniżej — kursanci zobaczą je w tej kolejności.'}
              </p>
            )}
            <div className="flex flex-col gap-2">
              {g.items.map((item, idx) => (
                <ItemRow
                  key={item.id}
                  course={course}
                  item={item}
                  first={idx === 0}
                  last={idx === g.items.length - 1}
                  upload={uploads[item.id]}
                  onMove={(d) => void moveItem(g, idx, d)}
                  onStartUpload={onStartUpload}
                  onCancelUpload={onCancelUpload}
                  onChanged={onChanged}
                  onError={setError}
                />
              ))}
            </div>
          </>
        )
        return g.module ? (
          <ModulePanel
            key={g.module.id}
            course={course}
            module={g.module}
            index={mIdx}
            count={course.modules.length}
            itemCount={g.items.length}
            onMove={(d) => void moveModule(mIdx, d)}
            onChanged={onChanged}
            onError={setError}
          >
            {list}
          </ModulePanel>
        ) : (
          <Panel
            key="loose"
            title={hasModules ? 'Materiały bez modułu' : 'Materiały kursu'}
            action={
              hasModules ? (
                <span className="text-xs" style={{ color: 'var(--faint)' }}>zawsze dostępne, poza kolejnością modułów</span>
              ) : undefined
            }
          >
            {list}
          </Panel>
        )
      })}

      <AddModule course={course} onChanged={onChanged} />

      <div className="grid md:grid-cols-2 gap-5">
        <AddVideo course={course} disabled={!videoReady} onStartUpload={onStartUpload} onChanged={onChanged} />
        <AddPdf course={course} onChanged={onChanged} />
      </div>
    </div>
  )
}

/** Informacja o trybie sekwencyjnym nad listą (włączanie: zakładka Ustawienia). */
function SequenceInfo({ course, onOpenSettings }: { course: CourseDetail; onOpenSettings?: () => void }) {
  const link = onOpenSettings ? (
    <button
      type="button"
      onClick={onOpenSettings}
      className="underline"
      style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit' }}
    >
      Ustawienia
    </button>
  ) : (
    'Ustawienia'
  )
  if (course.sequential) {
    return (
      <Notice kind={course.modules.length ? 'ok' : 'err'}>
        {course.modules.length ? (
          <>
            🔒 Tryb sekwencyjny włączony: kursant widzi kolejny moduł dopiero po ukończeniu poprzedniego (film obejrzany w 90%, PDF otwarty
            albo „Oznaczam jako ukończone”). Wyłączysz go w zakładce {link}.
          </>
        ) : (
          <>Tryb sekwencyjny jest włączony, ale kurs nie ma jeszcze modułów — dodaj moduły poniżej, inaczej wszystkie materiały są dostępne od razu.</>
        )}
      </Notice>
    )
  }
  return (
    <Notice kind="info">
      Moduły grupują materiały (np. „Konferencja 1” = film + PDF). Jeśli kolejne moduły mają się odblokowywać dopiero po ukończeniu
      poprzednich, włącz tryb sekwencyjny w zakładce {link}.
    </Notice>
  )
}

function ModulePanel({
  course, module, index, count, itemCount, onMove, onChanged, onError, children,
}: {
  course: CourseDetail
  module: CourseModule
  index: number
  count: number
  itemCount: number
  onMove: (dir: -1 | 1) => void
  onChanged: Props['onChanged']
  onError: (m: string | null) => void
  children: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [pl, setPl] = useState(module.title.pl ?? '')
  const [en, setEn] = useState(module.title.en ?? '')
  const [descPl, setDescPl] = useState(module.description?.pl ?? '')
  const [descEn, setDescEn] = useState(module.description?.en ?? '')
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    onError(null)
    try {
      await fn()
      await onChanged()
    } catch (e) {
      onError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const title = (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
        Moduł {index + 1}
      </span>
      {t(module.title)}
      {course.sequential && index > 0 && <Lock size={13} style={{ color: 'var(--faint)' }} />}
    </span>
  )

  return (
    <div
      className="rounded-[15px] border overflow-hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
    >
      <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="min-w-0">
          <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{title}</p>
          {course.sequential && index > 0 && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--faint)' }}>Odblokuje się po ukończeniu modułu {index}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" disabled={index === 0 || busy} onClick={() => onMove(-1)} className="disabled:opacity-30" style={iconBtn} title="Moduł wyżej">
            <ArrowUp size={15} />
          </button>
          <button type="button" disabled={index === count - 1 || busy} onClick={() => onMove(1)} className="disabled:opacity-30" style={iconBtn} title="Moduł niżej">
            <ArrowDown size={15} />
          </button>
          <button type="button" onClick={() => setEditing((v) => !v)} style={iconBtn} title="Zmień nazwę modułu">
            <Pencil size={15} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const msg = itemCount
                ? `Usunąć moduł „${t(module.title)}”? Jego materiały (${itemCount}) NIE znikną — trafią do „Materiały bez modułu”.`
                : `Usunąć pusty moduł „${t(module.title)}”?`
              if (window.confirm(msg)) void run(() => deleteCourseModule(course.id, module.id))
            }}
            style={{ ...iconBtn, color: 'var(--err)' }}
            title="Usuń moduł"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div className="px-5 py-4 flex flex-col gap-4">
        {editing && (
          <div className="grid md:grid-cols-2 gap-2">
            <Input label="Nazwa modułu (PL)" value={pl} onChange={(e) => setPl(e.target.value)} />
            <Input label="Nazwa modułu (EN, opcjonalnie)" value={en} onChange={(e) => setEn(e.target.value)} />
            <Input label="Krótki opis (PL, opcjonalnie)" value={descPl} onChange={(e) => setDescPl(e.target.value)} />
            <Input label="Krótki opis (EN, opcjonalnie)" value={descEn} onChange={(e) => setDescEn(e.target.value)} />
            <div className="flex gap-2 md:col-span-2">
              <Button
                size="sm"
                disabled={busy || !pl.trim()}
                onClick={() =>
                  void run(async () => {
                    await updateCourseModule(course.id, module.id, { title: langText(pl, en)!, description: langText(descPl, descEn) })
                    setEditing(false)
                  })
                }
              >
                Zapisz
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Anuluj</Button>
            </div>
          </div>
        )}
        {!editing && t(module.description) && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{t(module.description)}</p>
        )}
        {children}
      </div>
    </div>
  )
}

const langText = (pl: string, en: string): LangText | null => {
  const o: LangText = {}
  if (pl.trim()) o.pl = pl.trim()
  if (en.trim()) o.en = en.trim()
  return Object.keys(o).length ? o : null
}

function AddModule({ course, onChanged }: { course: CourseDetail; onChanged: Props['onChanged'] }) {
  const [open, setOpen] = useState(false)
  const [pl, setPl] = useState('')
  const [en, setEn] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const next = course.modules.length + 1

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await createCourseModule(course.id, { title: langText(pl, en)! })
      setPl('')
      setEn('')
      setOpen(false)
      await onChanged()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Layers size={15} /> Dodaj moduł
        </Button>
      </div>
    )
  }
  return (
    <Panel title={`Nowy moduł (${next})`}>
      <div className="grid md:grid-cols-2 gap-2">
        <Input label="Nazwa modułu (PL)" value={pl} onChange={(e) => setPl(e.target.value)} placeholder={`np. Konferencja ${next}`} />
        <Input label="Nazwa modułu (EN, opcjonalnie)" value={en} onChange={(e) => setEn(e.target.value)} placeholder={`e.g. Conference ${next}`} />
      </div>
      {error && <Notice kind="err">{error}</Notice>}
      <div className="flex gap-2">
        <Button onClick={() => void submit()} disabled={busy || !pl.trim()}>
          <Plus size={15} /> {busy ? 'Dodaję…' : 'Dodaj moduł'}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Anuluj</Button>
      </div>
      <p className="text-xs" style={{ color: 'var(--faint)' }}>
        Moduł pojawi się na końcu listy. Materiały przypiszesz polem „Moduł” przy dodawaniu albo w wierszu istniejącego materiału.
      </p>
    </Panel>
  )
}

/** Wybór modułu (lista rozwijana). */
function ModuleSelect({ course, value, onChange, disabled, compact }: {
  course: CourseDetail
  value: string | null
  onChange: (v: string | null) => void
  disabled?: boolean
  compact?: boolean
}) {
  if (!course.modules.length) return null
  return (
    <label className={`flex ${compact ? 'items-center gap-1.5 text-xs' : 'flex-col gap-1.5 text-sm font-medium'}`} style={{ color: compact ? 'var(--faint)' : 'var(--ink)' }}>
      Moduł{compact ? ':' : ''}
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className={compact ? 'rounded-[8px] border px-1.5 py-0.5 text-xs' : 'rounded-[10px] border px-3 py-2 text-sm'}
        style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--ink)', fontWeight: 400 }}
      >
        <option value="">— bez modułu —</option>
        {course.modules.map((m, i) => (
          <option key={m.id} value={m.id}>
            {i + 1}. {t(m.title)}
          </option>
        ))}
      </select>
    </label>
  )
}

function ItemRow({
  course, item, first, last, upload, onMove, onStartUpload, onCancelUpload, onChanged, onError,
}: {
  course: CourseDetail
  item: CourseItem
  first: boolean
  last: boolean
  upload?: UploadState
  onMove: (dir: -1 | 1) => void
  onStartUpload: Props['onStartUpload']
  onCancelUpload: Props['onCancelUpload']
  onChanged: Props['onChanged']
  onError: (m: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [diag, setDiag] = useState<{ ok: boolean; verdict: string; details?: Record<string, unknown> } | 'loading' | null>(null)
  const [pl, setPl] = useState(item.title.pl ?? '')
  const [en, setEn] = useState(item.title.en ?? '')
  const [descPl, setDescPl] = useState(item.description?.pl ?? '')
  const [descEn, setDescEn] = useState(item.description?.en ?? '')
  const [pubAt, setPubAt] = useState(isoToLocalInput(item.publishAt))
  const [busy, setBusy] = useState(false)
  const [cors, setCors] = useState<{ ok: boolean; message: string } | 'loading' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const isVideo = item.kind === 'VIDEO'
  const activeUpload = upload && !upload.done && !upload.error
  const ready = isVideo && item.hasFile && item.videoState === 'READY'

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    onError(null)
    try {
      await fn()
      await onChanged()
    } catch (e) {
      onError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    await run(() =>
      updateCourseItem(course.id, item.id, {
        title: langText(pl, en) ?? { pl: pl.trim() },
        description: langText(descPl, descEn),
        publishAt: localInputToIso(pubAt),
      }),
    )
    setEditing(false)
  }

  async function pickFile(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    if (ready && !window.confirm(`Podmienić plik filmu „${t(item.title)}”? Kursanci będą oglądać obecną wersję do końca wysyłki nowej.`)) return
    const p = await probeVideo(file, 8000)
    if (!p.playable && !window.confirm(NOT_PLAYABLE)) return
    onError(null)
    onStartUpload(item.id, file)
  }

  const pct = upload?.total ? Math.round((upload.sent / upload.total) * 100) : 0

  return (
    <div className="rounded-[12px] border px-3 py-3 flex flex-col gap-2" style={{ borderColor: 'var(--border)', opacity: item.published ? 1 : 0.65 }}>
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <button type="button" disabled={first || busy} onClick={() => onMove(-1)} className="p-0.5 disabled:opacity-30" style={iconBtn} title="W górę">
            <ArrowUp size={14} />
          </button>
          <button type="button" disabled={last || busy} onClick={() => onMove(1)} className="p-0.5 disabled:opacity-30" style={iconBtn} title="W dół">
            <ArrowDown size={14} />
          </button>
        </div>
        {isVideo && item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            className="rounded-[8px] object-cover shrink-0"
            style={{ width: 72, height: 40, background: 'var(--brand-soft)' }}
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden'
            }}
          />
        ) : (
          <div className="flex items-center justify-center rounded-[8px] shrink-0" style={{ width: 72, height: 40, background: 'var(--brand-soft)', color: 'var(--brand)' }}>
            {isVideo ? <Film size={18} /> : <FileText size={18} />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
            {t(item.title)}
            {item.title.en && item.title.pl ? (
              <span className="font-normal" style={{ color: 'var(--faint)' }}> · EN: {item.title.en}</span>
            ) : !item.title.en ? (
              <span className="font-normal text-xs" style={{ color: 'var(--faint)' }}> · brak tytułu EN</span>
            ) : null}
          </p>
          <div className="flex items-center gap-2 flex-wrap text-xs mt-0.5" style={{ color: 'var(--faint)' }}>
            {isVideo ? (
              <>
                <VideoStateBadge state={ready ? 'READY' : null} uploading={!!activeUpload} finishing={upload?.phase === 'finishing'} />
                {item.durationSec ? <span>{formatDuration(item.durationSec)}</span> : null}
                {item.videoSizeMb ? <span>{item.videoSizeMb >= 1024 ? `${(item.videoSizeMb / 1024).toFixed(1)} GB` : `${item.videoSizeMb} MB`}</span> : null}
              </>
            ) : (
              <span>PDF · {[item.fileId ? 'PL' : null, item.fileIdEn ? 'EN' : null].filter(Boolean).join(' + ') || 'brak pliku'}</span>
            )}
            {!item.published && <span>· ukryty</span>}
            <ScheduleBadge item={item} courseStatus={course.status} />
            <ModuleSelect
              compact
              course={course}
              value={item.moduleId}
              disabled={busy}
              onChange={(v) => void run(() => updateCourseItem(course.id, item.id, { moduleId: v }))}
            />
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isVideo && !activeUpload && (
            <>
              <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{ ...iconBtn, color: ready ? 'var(--muted)' : 'var(--brand)' }}
                title={ready ? 'Podmień plik filmu' : 'Wgraj / wznów plik filmu'}
                disabled={busy}
              >
                <Upload size={15} />
              </button>
            </>
          )}
          {ready && (
            <button
              type="button"
              title="Sprawdź odtwarzanie"
              style={iconBtn}
              onClick={() => {
                setDiag('loading')
                diagnoseVideo(course.id, item.id)
                  .then((r) => setDiag(r))
                  .catch((e) => setDiag({ ok: false, verdict: errMsg(e) }))
              }}
            >
              <PlayCircle size={15} />
            </button>
          )}
          <button type="button" onClick={() => setEditing((v) => !v)} style={iconBtn} title="Edytuj tytuł">
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => void run(() => updateCourseItem(course.id, item.id, { published: !item.published }))}
            style={iconBtn}
            title={item.published ? 'Ukryj przed kursantami' : 'Pokaż kursantom'}
            disabled={busy}
          >
            {item.published ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Usunąć „${t(item.title)}”? ${isVideo ? 'Plik filmu zostanie usunięty także z hostingu.' : ''}`)) {
                if (activeUpload) onCancelUpload(item.id)
                void run(() => deleteCourseItem(course.id, item.id))
              }
            }}
            style={{ ...iconBtn, color: 'var(--err)' }}
            title="Usuń"
            disabled={busy}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {upload && !upload.done && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
              <div className="h-full transition-all" style={{ width: `${pct}%`, background: upload.error ? 'var(--err)' : 'var(--brand)' }} />
            </div>
            <span className="text-xs shrink-0" style={{ color: upload.error ? 'var(--err)' : 'var(--muted)' }}>
              {upload.error
                ? 'Przerwano'
                : upload.phase === 'preparing'
                  ? 'Przygotowuję…'
                  : upload.phase === 'finishing'
                    ? 'Kończę (składanie pliku, miniatura)…'
                    : `${pct}% · ${formatBytes(upload.sent)} / ${formatBytes(upload.total)}`}
            </span>
            {!upload.error && upload.phase !== 'finishing' && (
              <button type="button" onClick={() => onCancelUpload(item.id)} style={iconBtn} title="Przerwij (da się wznowić)">
                <X size={14} />
              </button>
            )}
          </div>
          {upload.error && (
            <div className="flex items-start gap-2 flex-wrap">
              <p className="text-xs flex-1" style={{ color: 'var(--err)' }}>
                {upload.error === 'Przerwano' ? 'Wysyłka przerwana.' : upload.error} Kliknij ikonę wysyłania i wybierz ten sam plik — wyślą się tylko brakujące części.
              </p>
              {/CORS/.test(upload.error) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cors === 'loading'}
                  onClick={() => {
                    setCors('loading')
                    setupVideoCors()
                      .then(setCors)
                      .catch((e) => setCors({ ok: false, message: errMsg(e) }))
                  }}
                >
                  <Wrench size={14} /> Napraw ustawienia wysyłki
                </Button>
              )}
            </div>
          )}
          {cors && cors !== 'loading' && <Notice kind={cors.ok ? 'ok' : 'err'}>{cors.message}</Notice>}
        </div>
      )}
      {isVideo && !activeUpload && !upload?.error && !ready && (
        <p className="text-xs" style={{ color: 'var(--warn)' }}>
          {item.legacyVideo
            ? 'Film był na starym hostingu (Bunny), który usunął pliki — kliknij ikonę wysyłania i wgraj plik ponownie. Do tego czasu kursanci widzą „Film będzie wkrótce dostępny”.'
            : item.uploading
              ? 'Wysyłka pliku została przerwana — kliknij ikonę wysyłania i wybierz ten sam plik, aby wznowić.'
              : 'Brak pliku filmu — kliknij ikonę wysyłania i wybierz plik.'}
        </p>
      )}

      {diag && (
        <div className="flex items-start gap-2">
          <div className="flex-1">
            {diag === 'loading' ? (
              <Notice kind="info">Sprawdzam plik i link do odtwarzania…</Notice>
            ) : (
              <>
                <Notice kind={diag.ok ? 'ok' : 'err'}>{diag.verdict}</Notice>
                {diag.details && (
                  <details className="mt-1">
                    <summary className="text-xs cursor-pointer" style={{ color: 'var(--faint)' }}>Szczegóły techniczne</summary>
                    <pre className="text-[11px] mt-1 p-2 rounded-[8px] overflow-x-auto" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
                      {JSON.stringify(diag.details, null, 2)}
                    </pre>
                  </details>
                )}
              </>
            )}
          </div>
          {diag !== 'loading' && (
            <button type="button" onClick={() => setDiag(null)} style={iconBtn} title="Zamknij">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {!isVideo && (
        <div className="flex flex-col gap-1.5 pl-[108px]">
          <PdfLangRow course={course} item={item} lang="pl" busy={busy} run={run} />
          <PdfLangRow course={course} item={item} lang="en" busy={busy} run={run} />
        </div>
      )}

      {editing && (
        <div className="grid md:grid-cols-2 gap-2 pt-1">
          <Input label="Tytuł (PL)" value={pl} onChange={(e) => setPl(e.target.value)} />
          <Input label="Tytuł (EN)" value={en} onChange={(e) => setEn(e.target.value)} placeholder="np. Conference 1 — God's Love" />
          <Input label="Krótki opis (PL, opcjonalnie)" value={descPl} onChange={(e) => setDescPl(e.target.value)} />
          <Input label="Krótki opis (EN, opcjonalnie)" value={descEn} onChange={(e) => setDescEn(e.target.value)} />
          <div className="md:col-span-2">
            <PublishAtField value={pubAt} onChange={setPubAt} />
          </div>
          <div className="flex gap-2 md:col-span-2">
            <Button size="sm" onClick={() => void save()} disabled={busy || !pl.trim()}>Zapisz</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Anuluj</Button>
          </div>
        </div>
      )}
    </div>
  )
}

const NOT_PLAYABLE =
  'Przeglądarka nie potrafi odtworzyć tego pliku (najczęściej kodek HEVC/H.265 z iPhone’a albo nietypowy format). Kursanci też go nie obejrzą.\n\nZalecane: wyeksportuj film jako MP4 (H.264 + AAC), 720p lub 1080p — np. w QuickTime: Plik ▸ Eksportuj jako ▸ 1080p, albo w HandBrake (preset „Fast 1080p30”).\n\nWysłać mimo to?'

/** Wiersz wersji językowej PDF: nazwa pliku + Zamień / Dodaj / Usuń. */
function PdfLangRow({ course, item, lang, busy, run }: {
  course: CourseDetail
  item: CourseItem
  lang: PdfLang
  busy: boolean
  run: (fn: () => Promise<unknown>) => Promise<void>
}) {
  const ref = useRef<HTMLInputElement>(null)
  const meta = lang === 'en' ? item.fileEn : item.file
  const other = lang === 'en' ? item.file : item.fileEn
  const label = lang === 'en' ? 'EN' : 'PL'
  function pick(f: File | undefined) {
    if (!f) return
    if (f.size > 25 * 1024 * 1024) {
      window.alert('Plik jest za duży (limit 25 MB).')
      return
    }
    void run(() => setItemPdf(course.id, item.id, f, lang))
    if (ref.current) ref.current.value = ''
  }
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
      <span className="font-semibold w-6" style={{ color: meta ? 'var(--ink)' : 'var(--faint)' }}>{label}</span>
      <span className="flex-1 truncate">
        {meta ? `${meta.originalName ?? 'plik.pdf'} · ${formatBytes(meta.size)}` : lang === 'en' ? 'brak wersji angielskiej — kursanci EN dostaną wersję PL' : 'brak wersji polskiej — kursanci PL dostaną wersję EN'}
      </span>
      <input ref={ref} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" disabled={busy} onClick={() => ref.current?.click()} style={{ ...iconBtn, color: 'var(--brand)', padding: '2px 6px' }}>
        {meta ? 'Zamień' : `Dodaj ${label}`}
      </button>
      {meta && other && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Usunąć wersję ${label} tego materiału?`)) void run(() => removeItemPdf(course.id, item.id, lang))
          }}
          style={{ ...iconBtn, color: 'var(--err)', padding: '2px 6px' }}
        >
          Usuń
        </button>
      )}
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--muted)',
  padding: 6,
  borderRadius: 8,
}

/** Domyślny moduł nowego materiału: ostatni moduł (dodaje się zwykle „na końcu kursu"). */
const defaultModule = (course: CourseDetail) => (course.modules.length ? course.modules[course.modules.length - 1].id : null)

function AddVideo({ course, disabled, onStartUpload, onChanged }: {
  course: CourseDetail
  disabled: boolean
  onStartUpload: Props['onStartUpload']
  onChanged: Props['onChanged']
}) {
  const [title, setTitle] = useState('')
  const [titleEn, setTitleEn] = useState('')
  const [pubAt, setPubAt] = useState('')
  const [moduleId, setModuleId] = useState<string | null>(defaultModule(course))
  const [file, setFile] = useState<File | null>(null)
  const [probe, setProbe] = useState<{ duration: number | null; playable: boolean } | 'checking' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  // Nowy moduł dodany w międzyczasie → domyślnie ostatni.
  const modulesKey = course.modules.map((m) => m.id).join(',')
  useEffect(() => {
    setModuleId(defaultModule(course))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulesKey])

  async function choose(f: File | null) {
    setFile(f)
    setProbe(null)
    if (!f) return
    setProbe('checking')
    const p = await probeVideo(f, 10000)
    setProbe({ duration: p.duration, playable: p.playable })
  }

  async function submit() {
    if (!file) return
    if (probe && probe !== 'checking' && !probe.playable && !window.confirm(NOT_PLAYABLE)) return
    setBusy(true)
    setError(null)
    try {
      const tt: LangText = { pl: title.trim() || file.name.replace(/\.[^.]+$/, '') }
      if (titleEn.trim()) tt.en = titleEn.trim()
      const r = await createVideoItem(course.id, {
        title: tt,
        publishAt: localInputToIso(pubAt),
        moduleId,
        size: file.size,
        contentType: file.type || 'video/mp4',
        fileName: file.name,
      })
      onStartUpload(r.item.id, file, r.upload)
      setPubAt('')
      setTitle('')
      setTitleEn('')
      setFile(null)
      setProbe(null)
      if (ref.current) ref.current.value = ''
      await onChanged()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Dodaj film">
      {disabled ? (
        <Notice kind="info">Hosting wideo (Cloudflare R2) nie jest skonfigurowany — patrz komunikat na liście kursów.</Notice>
      ) : (
        <>
          <Input label="Tytuł filmu (PL)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. Konferencja 1 — Miłość Boga" />
          <Input label="Tytuł filmu (EN, opcjonalnie)" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder="e.g. Conference 1 — God's Love" />
          <ModuleSelect course={course} value={moduleId} onChange={setModuleId} />
          <PublishAtField value={pubAt} onChange={setPubAt} />
          <input
            ref={ref}
            type="file"
            accept="video/mp4,video/*"
            onChange={(e) => void choose(e.target.files?.[0] ?? null)}
            className="text-sm"
            style={{ color: 'var(--muted)' }}
          />
          {file && (
            <p className="text-xs" style={{ color: 'var(--faint)' }}>
              {file.name} · {formatBytes(file.size)}
              {probe === 'checking' && ' · sprawdzam plik…'}
              {probe && probe !== 'checking' && probe.duration ? ` · ${formatDuration(probe.duration)}` : ''}
            </p>
          )}
          {probe && probe !== 'checking' && !probe.playable && (
            <Notice kind="err">
              Przeglądarka nie odtwarza tego pliku (np. HEVC/H.265 z iPhone’a) — kursanci też go nie obejrzą. Wyeksportuj go jako MP4 (H.264),
              720p lub 1080p, i wybierz ponownie.
            </Notice>
          )}
          {file && file.size > 3 * 1024 * 1024 * 1024 && (
            <Notice kind="info">
              Duży plik ({formatBytes(file.size)}). Dla kursu wystarczy 720p–1080p (zwykle 0,5–1,5 GB na godzinę) — mniejszy plik szybciej się
              wyśle, szybciej wczyta kursantom na słabym łączu i zajmie mniej z darmowych 10 GB.
            </Notice>
          )}
          {error && <Notice kind="err">{error}</Notice>}
          <Button onClick={() => void submit()} disabled={busy || !file || probe === 'checking'}>
            <Upload size={15} /> {busy ? 'Przygotowuję…' : 'Wyślij film'}
          </Button>
          <p className="text-xs" style={{ color: 'var(--faint)' }}>
            Najlepiej MP4 (H.264), 720p lub 1080p. Plik idzie prosto do Cloudflare R2, w częściach. Po przerwie wybierz ten sam plik, a wyślą się
            tylko brakujące części. Film jest gotowy od razu po wysłaniu (bez kodowania).
          </p>
        </>
      )}
    </Panel>
  )
}

function AddPdf({ course, onChanged }: { course: CourseDetail; onChanged: Props['onChanged'] }) {
  const [title, setTitle] = useState('')
  const [titleEn, setTitleEn] = useState('')
  const [pubAt, setPubAt] = useState('')
  const [moduleId, setModuleId] = useState<string | null>(defaultModule(course))
  const [filePl, setFilePl] = useState<File | null>(null)
  const [fileEn, setFileEn] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refPl = useRef<HTMLInputElement>(null)
  const refEn = useRef<HTMLInputElement>(null)

  const modulesKey = course.modules.map((m) => m.id).join(',')
  useEffect(() => {
    setModuleId(defaultModule(course))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulesKey])

  async function submit() {
    const first = filePl ?? fileEn
    if (!first) return
    if ([filePl, fileEn].some((f) => f && f.size > 25 * 1024 * 1024)) {
      setError('Plik jest za duży (limit 25 MB).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const tt: LangText = {}
      if (title.trim()) tt.pl = title.trim()
      if (titleEn.trim()) tt.en = titleEn.trim()
      if (!tt.pl && !tt.en) tt.pl = first.name.replace(/\.pdf$/i, '')
      const { item } = await uploadPdfItem(course.id, first, tt, filePl ? 'pl' : 'en', localInputToIso(pubAt), moduleId)
      if (filePl && fileEn) await setItemPdf(course.id, item.id, fileEn, 'en')
      setTitle('')
      setTitleEn('')
      setPubAt('')
      setFilePl(null)
      setFileEn(null)
      if (refPl.current) refPl.current.value = ''
      if (refEn.current) refEn.current.value = ''
      await onChanged()
    } catch (e) {
      setError(errMsg(e))
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  const fileInput = (label: string, ref: React.RefObject<HTMLInputElement>, file: File | null, set: (f: File | null) => void) => (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{label}</span>
      <input ref={ref} type="file" accept="application/pdf,.pdf" onChange={(e) => set(e.target.files?.[0] ?? null)} className="text-sm" style={{ color: 'var(--muted)' }} />
      {file && <span className="text-xs" style={{ color: 'var(--faint)' }}>{file.name} · {formatBytes(file.size)}</span>}
    </div>
  )

  return (
    <Panel title="Dodaj PDF">
      <Input label="Tytuł materiału (PL)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. Notatki do konferencji 1" />
      <Input label="Tytuł materiału (EN, opcjonalnie)" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder="e.g. Notes for conference 1" />
      <ModuleSelect course={course} value={moduleId} onChange={setModuleId} />
      <PublishAtField value={pubAt} onChange={setPubAt} />
      {fileInput('Plik PDF — wersja polska', refPl, filePl, setFilePl)}
      {fileInput('Plik PDF — wersja angielska (opcjonalnie)', refEn, fileEn, setFileEn)}
      {error && <Notice kind="err">{error}</Notice>}
      <Button onClick={() => void submit()} disabled={busy || (!filePl && !fileEn)}>
        <Upload size={15} /> {busy ? 'Wysyłam…' : 'Wyślij PDF'}
      </Button>
      <p className="text-xs" style={{ color: 'var(--faint)' }}>
        Do 25 MB na plik. Kursant widzi wersję w swoim języku strony (PL/EN); gdy jej brak — tę drugą. Wersję EN możesz dodać też później przy materiale.
      </p>
    </Panel>
  )
}

/** Pole „Data publikacji": puste = od razu; przyszła data = materiał pojawi się sam + mail do kursantów. */
function PublishAtField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const future = value && new Date(value).getTime() > Date.now()
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Publikacja</span>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-[10px] border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs"
            style={{ color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            publikuj od razu
          </button>
        ) : (
          <span className="text-xs" style={{ color: 'var(--faint)' }}>puste = widoczny od razu</span>
        )}
      </div>
      {future && (
        <span className="text-xs" style={{ color: 'var(--brand)' }}>
          Kursanci zobaczą materiał {fmtWhen(new Date(value).toISOString())} i dostaną wtedy maila „Nowe materiały czekają na Ciebie".
        </span>
      )}
    </div>
  )
}

/** Status publikacji zaplanowanej na liście materiałów. */
function ScheduleBadge({ item, courseStatus }: { item: CourseItem; courseStatus: string }) {
  if (!item.publishAt) return null
  const future = new Date(item.publishAt).getTime() > Date.now()
  if (future) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
        ⏱ Zaplanowany: {fmtWhen(item.publishAt)}
        {courseStatus !== 'PUBLISHED' ? ' (kurs to szkic — maile tylko po publikacji kursu)' : ' · z mailem'}
      </span>
    )
  }
  return (
    <span>
      · opublikowany {fmtWhen(item.publishAt)}
      {typeof item.releaseMails === 'number' ? ` · mail wysłany do ${item.releaseMails} ${item.releaseMails === 1 ? 'osoby' : 'osób'}` : ''}
    </span>
  )
}
