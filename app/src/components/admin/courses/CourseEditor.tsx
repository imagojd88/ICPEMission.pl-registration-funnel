import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, Eye, ExternalLink, Send } from 'lucide-react'
import Button from '@/components/ui/Button'
import { getCourse, getPreviewUrl, updateCourse, type CourseDetail, type CoursesConfig } from '@/lib/courses'
import { uploadStore, type UploadState } from '@/lib/uploadStore'
import CourseSettingsTab from './CourseSettingsTab'
import CourseContentTab from './CourseContentTab'
import CourseMembersTab from './CourseMembersTab'
import CourseActivityTab from './CourseActivityTab'
import { Notice, StatusBadge, errMsg, t } from './shared'

type Tab = 'content' | 'members' | 'activity' | 'settings'

export type { UploadState }

export default function CourseEditor({ id, config, onBack }: { id: string; config: CoursesConfig | null; onBack: () => void }) {
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [tab, setTab] = useState<Tab>('content')
  const allUploads = useSyncExternalStore(uploadStore.subscribe, uploadStore.getSnapshot)
  const uploads = Object.fromEntries(Object.entries(allUploads).filter(([, u]) => u.courseId === id))

  const reload = useCallback(async () => {
    try {
      setCourse(await getCourse(id))
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    }
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])

  // Po zakończeniu wysyłki odśwież stan filmu (Bunny zaczyna kodowanie).
  const doneCount = Object.values(uploads).filter((u) => u.done).length
  const prevDone = useRef(doneCount)
  useEffect(() => {
    if (doneCount > prevDone.current) {
      const h = setTimeout(() => void reload(), 3000)
      prevDone.current = doneCount
      return () => clearTimeout(h)
    }
    prevDone.current = doneCount
  }, [doneCount, reload])

  // Filmy w kodowaniu — odświeżaj co 10 s (API dociąga stan z Bunny).
  const processing = course?.items.some(
    (i) => i.kind === 'VIDEO' && i.videoState !== 'READY' && i.videoState !== 'FAILED' && !uploadStore.isActive(uploads[i.id]),
  )
  useEffect(() => {
    if (!processing) return
    const h = setInterval(() => void reload(), 10000)
    return () => clearInterval(h)
  }, [processing, reload])

  const startUpload = useCallback(
    (itemId: string, file: File, upload: { endpoint: string; headers: Record<string, string> }) =>
      uploadStore.start(id, itemId, file, upload),
    [id],
  )
  const cancelUpload = (itemId: string) => uploadStore.cancel(itemId)

  /** Podgląd kursu jako kursant — okno otwierane od razu (blokada wyskakujących okien), adres po odpowiedzi API. */
  async function preview() {
    if (!course) return
    const w = window.open('about:blank', '_blank')
    try {
      const { url } = await getPreviewUrl(course.id)
      if (w) {
        w.opener = null
        w.location.href = url
      } else window.location.href = url
    } catch (e) {
      w?.close()
      setError(errMsg(e))
    }
  }

  async function publish() {
    if (!course) return
    const n = course.pendingWelcome
    if (!window.confirm(`Opublikować kurs? Strona kursu zacznie działać${n ? `, a ${n} ${n === 1 ? 'osoba dostanie' : 'osób dostanie'} mail powitalny` : ''}.`)) return
    setPublishing(true)
    try {
      const updated = await updateCourse(course.id, { status: 'PUBLISHED' })
      setCourse(updated)
      setNotice(
        `Opublikowano. Strona działa pod ${updated.url.replace(/^https?:\/\//, '')} (pełna wersja po przebudowie strony, 1–3 min).` +
          (updated.welcome?.sent ? ` Wysłane powitania: ${updated.welcome.sent}.` : ''),
      )
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setPublishing(false)
    }
  }

  if (!course) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink onBack={onBack} />
        {error ? <Notice kind="err">{error}</Notice> : <p className="text-sm" style={{ color: 'var(--muted)' }}>Wczytuję kurs…</p>}
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'content', label: `Zawartość (${course.items.length})` },
    { id: 'members', label: `Kursanci (${course.members})` },
    { id: 'activity', label: 'Aktywność' },
    { id: 'settings', label: 'Ustawienia' },
  ]

  return (
    <div className="flex flex-col gap-5 max-w-[980px]">
      <BackLink onBack={onBack} />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>{t(course.title)}</h2>
            <StatusBadge status={course.status} />
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {/* Klik w adres = wejście na stronę kursu od razu zalogowanym (podgląd admina), bez ekranu logowania. */}
            <a
              href={course.url}
              onClick={(e) => {
                e.preventDefault()
                void preview()
              }}
              className="text-xs inline-flex items-center gap-1"
              style={{ color: 'var(--brand)' }}
              title="Otwiera stronę kursu od razu zalogowaną jako Ty"
            >
              {course.url.replace(/^https?:\/\//, '')} <ExternalLink size={12} />
            </a>
            <CopyLink url={course.url} />
          </div>
          {course.status === 'DRAFT' && (
            <p className="text-xs mt-1" style={{ color: 'var(--warn)' }}>
              Szkic — strona kursu jeszcze nie działa, a kursanci nie dostają maili. Opublikuj, gdy będziesz gotowy.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => void preview()} title="Otwiera stronę kursu zalogowaną jako Ty — działa także dla szkicu">
            <Eye size={15} /> Podgląd jako kursant
          </Button>
          {course.status === 'DRAFT' && (
            <Button onClick={() => void publish()} disabled={publishing}>
              <Send size={15} /> {publishing ? 'Publikuję…' : 'Opublikuj kurs'}
            </Button>
          )}
        </div>
      </div>
      {notice && <Notice kind="ok">{notice}</Notice>}
      {Object.values(uploads).some((u) => uploadStore.isActive(u)) && (
        <Notice kind="info">
          Trwa wysyłanie filmu — możesz przełączać zakładki i moduły panelu, ale nie zamykaj ani nie odświeżaj tej karty przeglądarki.
        </Notice>
      )}

      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--border)' }}>
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className="px-4 py-2 text-sm font-semibold -mb-px"
            style={{
              color: tab === x.id ? 'var(--brand)' : 'var(--muted)',
              borderBottom: `2px solid ${tab === x.id ? 'var(--brand)' : 'transparent'}`,
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            {x.label}
          </button>
        ))}
      </div>

      {error && <Notice kind="err">{error}</Notice>}

      {tab === 'content' && (
        <CourseContentTab
          course={course}
          config={config}
          uploads={uploads}
          onStartUpload={startUpload}
          onCancelUpload={cancelUpload}
          onChanged={reload}
        />
      )}
      {tab === 'members' && <CourseMembersTab course={course} onChanged={reload} />}
      {tab === 'activity' && <CourseActivityTab course={course} />}
      {tab === 'settings' && <CourseSettingsTab course={course} onSaved={setCourse} onDeleted={onBack} />}
    </div>
  )
}

function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(url).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 2000)
        })
      }}
      className="text-xs"
      style={{ color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
      title="Adres dla kursantów (z ekranem logowania)"
    >
      {done ? 'Skopiowano ✓' : 'Kopiuj link dla kursantów'}
    </button>
  )
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-sm font-medium self-start"
      style={{ color: 'var(--muted)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      <ArrowLeft size={16} /> Wszystkie kursy
    </button>
  )
}
