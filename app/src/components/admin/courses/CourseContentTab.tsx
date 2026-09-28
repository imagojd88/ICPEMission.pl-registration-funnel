import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, FileText, Film, Pencil, RefreshCw, Trash2, Upload, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  createVideoItem, deleteCourseItem, formatBytes, formatDuration, refreshCourseItem, renewVideoUpload,
  reorderCourseItems, updateCourseItem, uploadPdfItem,
  type CourseDetail, type CourseItem, type CoursesConfig,
} from '@/lib/courses'
import type { UploadState } from './CourseEditor'
import { Notice, Panel, VideoStateBadge, errMsg, t } from './shared'


interface Props {
  course: CourseDetail
  config: CoursesConfig | null
  uploads: Record<string, UploadState>
  onStartUpload: (itemId: string, file: File, upload: { endpoint: string; headers: Record<string, string> }) => void
  onCancelUpload: (itemId: string) => void
  onChanged: () => Promise<void> | void
}

export default function CourseContentTab({ course, config, uploads, onStartUpload, onCancelUpload, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null)
  const videoReady = config?.video.configured !== false

  async function move(idx: number, dir: -1 | 1) {
    const ids = course.items.map((i) => i.id)
    const j = idx + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    try {
      await reorderCourseItems(course.id, ids)
      await onChanged()
    } catch (e) {
      setError(errMsg(e))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <Notice kind="err">{error}</Notice>}

      <Panel title="Materiały kursu">
        {course.items.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Brak materiałów. Dodaj filmy i pliki PDF poniżej — kursanci zobaczą je w tej kolejności.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {course.items.map((item, idx) => (
            <ItemRow
              key={item.id}
              course={course}
              item={item}
              first={idx === 0}
              last={idx === course.items.length - 1}
              upload={uploads[item.id]}
              onMove={(d) => void move(idx, d)}
              onStartUpload={onStartUpload}
              onCancelUpload={onCancelUpload}
              onChanged={onChanged}
              onError={setError}
            />
          ))}
        </div>
      </Panel>

      <div className="grid md:grid-cols-2 gap-5">
        <AddVideo course={course} disabled={!videoReady} onStartUpload={onStartUpload} onChanged={onChanged} />
        <AddPdf course={course} onChanged={onChanged} />
      </div>
    </div>
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
  const [pl, setPl] = useState(item.title.pl ?? '')
  const [en, setEn] = useState(item.title.en ?? '')
  const [descPl, setDescPl] = useState(item.description?.pl ?? '')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const isVideo = item.kind === 'VIDEO'
  const activeUpload = upload && !upload.done && !upload.error

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
    const title: Record<string, string> = { pl: pl.trim() }
    if (en.trim()) title.en = en.trim()
    await run(() => updateCourseItem(course.id, item.id, { title, description: descPl.trim() ? { pl: descPl.trim() } : null }))
    setEditing(false)
  }

  async function pickFile(file: File | undefined) {
    if (!file) return
    await run(async () => {
      const r = await renewVideoUpload(course.id, item.id)
      onStartUpload(item.id, file, r.upload)
    })
  }

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
          <img src={item.thumbnailUrl} alt="" className="rounded-[8px] object-cover shrink-0" style={{ width: 72, height: 40 }} />
        ) : (
          <div className="flex items-center justify-center rounded-[8px] shrink-0" style={{ width: 72, height: 40, background: 'var(--brand-soft)', color: 'var(--brand)' }}>
            {isVideo ? <Film size={18} /> : <FileText size={18} />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{t(item.title)}</p>
          <div className="flex items-center gap-2 flex-wrap text-xs mt-0.5" style={{ color: 'var(--faint)' }}>
            {isVideo ? (
              <>
                <VideoStateBadge state={activeUpload ? 'UPLOADING' : item.videoState} />
                {item.durationSec ? <span>{formatDuration(item.durationSec)}</span> : null}
              </>
            ) : (
              <span>PDF · {item.file ? formatBytes(item.file.size) : '—'}{item.file?.originalName ? ` · ${item.file.originalName}` : ''}</span>
            )}
            {!item.published && <span>· ukryty</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isVideo && item.videoState !== 'READY' && !activeUpload && (
            <>
              <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} style={iconBtn} title="Wgraj / wznów plik filmu" disabled={busy}>
                <Upload size={15} />
              </button>
              <button type="button" onClick={() => void run(() => refreshCourseItem(course.id, item.id))} style={iconBtn} title="Sprawdź stan" disabled={busy}>
                <RefreshCw size={15} />
              </button>
            </>
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
              if (window.confirm(`Usunąć „${t(item.title)}"? ${isVideo ? 'Film zostanie usunięty także z hostingu wideo.' : ''}`)) {
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
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div
              className="h-full transition-all"
              style={{ width: `${upload.total ? Math.round((upload.sent / upload.total) * 100) : 0}%`, background: upload.error ? 'var(--err)' : 'var(--brand)' }}
            />
          </div>
          <span className="text-xs shrink-0" style={{ color: upload.error ? 'var(--err)' : 'var(--muted)' }}>
            {upload.error
              ? `Przerwano: ${upload.error} — kliknij „Wgraj", aby wznowić`
              : `${upload.total ? Math.round((upload.sent / upload.total) * 100) : 0}% · ${formatBytes(upload.sent)} / ${formatBytes(upload.total)}`}
          </span>
          {!upload.error && (
            <button type="button" onClick={() => onCancelUpload(item.id)} style={iconBtn} title="Przerwij">
              <X size={14} />
            </button>
          )}
        </div>
      )}
      {upload?.done && item.videoState !== 'READY' && (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Plik wysłany — trwa kodowanie (zwykle kilka–kilkanaście minut). Możesz zamknąć tę stronę.</p>
      )}
      {isVideo && item.videoState === 'UPLOADING' && !upload && (
        <p className="text-xs" style={{ color: 'var(--warn)' }}>Plik filmu nie został (w całości) wysłany — kliknij ikonę wysyłania i wybierz ten sam plik, aby wznowić.</p>
      )}

      {editing && (
        <div className="grid md:grid-cols-2 gap-2 pt-1">
          <Input label="Tytuł (PL)" value={pl} onChange={(e) => setPl(e.target.value)} />
          <Input label="Tytuł (EN, opcjonalnie)" value={en} onChange={(e) => setEn(e.target.value)} />
          <div className="md:col-span-2">
            <Input label="Krótki opis (opcjonalnie)" value={descPl} onChange={(e) => setDescPl(e.target.value)} />
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

const iconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--muted)',
  padding: 6,
  borderRadius: 8,
}

function AddVideo({ course, disabled, onStartUpload, onChanged }: {
  course: CourseDetail
  disabled: boolean
  onStartUpload: Props['onStartUpload']
  onChanged: Props['onChanged']
}) {
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  async function submit() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const r = await createVideoItem(course.id, { pl: title.trim() || file.name.replace(/\.[^.]+$/, '') })
      onStartUpload(r.item.id, file, r.upload)
      setTitle('')
      setFile(null)
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
        <Notice kind="info">Hosting wideo nie jest skonfigurowany (Bunny Stream) — patrz komunikat na liście kursów.</Notice>
      ) : (
        <>
          <Input label="Tytuł filmu" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. Konferencja 1 — Miłość Boga" />
          <input
            ref={ref}
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
            style={{ color: 'var(--muted)' }}
          />
          {file && <p className="text-xs" style={{ color: 'var(--faint)' }}>{file.name} · {formatBytes(file.size)}</p>}
          {error && <Notice kind="err">{error}</Notice>}
          <Button onClick={() => void submit()} disabled={busy || !file}>
            <Upload size={15} /> {busy ? 'Przygotowuję…' : 'Wyślij film'}
          </Button>
          <p className="text-xs" style={{ color: 'var(--faint)' }}>
            Plik idzie prosto do hostingu wideo (bez limitu rozmiaru, z wznawianiem). Nie zamykaj karty do końca wysyłania — potem film
            koduje się sam.
          </p>
        </>
      )}
    </Panel>
  )
}

function AddPdf({ course, onChanged }: { course: CourseDetail; onChanged: Props['onChanged'] }) {
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  async function submit() {
    if (!file) return
    if (file.size > 25 * 1024 * 1024) {
      setError('Plik jest za duży (limit 25 MB).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await uploadPdfItem(course.id, file, { pl: title.trim() || file.name.replace(/\.pdf$/i, '') })
      setTitle('')
      setFile(null)
      if (ref.current) ref.current.value = ''
      await onChanged()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Dodaj PDF">
      <Input label="Tytuł materiału" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. Notatki do konferencji 1" />
      <input
        ref={ref}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="text-sm"
        style={{ color: 'var(--muted)' }}
      />
      {file && <p className="text-xs" style={{ color: 'var(--faint)' }}>{file.name} · {formatBytes(file.size)}</p>}
      {error && <Notice kind="err">{error}</Notice>}
      <Button onClick={() => void submit()} disabled={busy || !file}>
        <Upload size={15} /> {busy ? 'Wysyłam…' : 'Wyślij PDF'}
      </Button>
      <p className="text-xs" style={{ color: 'var(--faint)' }}>Do 25 MB. Kursanci otwierają plik przez link ważny 10 minut.</p>
    </Panel>
  )
}
