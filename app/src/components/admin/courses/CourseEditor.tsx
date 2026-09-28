import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getCourse, type CourseDetail, type CoursesConfig } from '@/lib/courses'
import { tusUpload, type TusHandle } from '@/lib/tusUpload'
import CourseSettingsTab from './CourseSettingsTab'
import CourseContentTab from './CourseContentTab'
import CourseMembersTab from './CourseMembersTab'
import { Notice, StatusBadge, errMsg, t } from './shared'

type Tab = 'content' | 'members' | 'settings'

/** Trwające uploady filmów — trzymane tu, żeby przełączanie zakładek ich nie przerywało. */
export interface UploadState {
  itemId: string
  fileName: string
  sent: number
  total: number
  error?: string
  done?: boolean
}

export default function CourseEditor({ id, config, onBack }: { id: string; config: CoursesConfig | null; onBack: () => void }) {
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('content')
  const [uploads, setUploads] = useState<Record<string, UploadState>>({})
  const handles = useRef<Record<string, TusHandle>>({})

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

  // Filmy w kodowaniu — odświeżaj co 10 s (API dociąga stan z Bunny).
  const processing = course?.items.some(
    (i) => i.kind === 'VIDEO' && i.videoState !== 'READY' && i.videoState !== 'FAILED' && !uploads[i.id],
  )
  useEffect(() => {
    if (!processing) return
    const h = setInterval(() => void reload(), 10000)
    return () => clearInterval(h)
  }, [processing, reload])

  // Ostrzeżenie przy zamykaniu karty w trakcie wysyłania.
  const uploading = Object.values(uploads).some((u) => !u.done && !u.error)
  useEffect(() => {
    if (!uploading) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [uploading])

  useEffect(() => () => Object.values(handles.current).forEach((h) => h.abort()), [])

  const startUpload = useCallback(
    (itemId: string, file: File, upload: { endpoint: string; headers: Record<string, string> }) => {
      setUploads((u) => ({ ...u, [itemId]: { itemId, fileName: file.name, sent: 0, total: file.size } }))
      const h = tusUpload({
        endpoint: upload.endpoint,
        headers: upload.headers,
        file,
        resumeKey: itemId,
        onProgress: (sent, total) => setUploads((u) => ({ ...u, [itemId]: { ...u[itemId], sent, total } })),
      })
      handles.current[itemId] = h
      h.promise
        .then(() => {
          setUploads((u) => ({ ...u, [itemId]: { ...u[itemId], done: true } }))
          setTimeout(() => void reload(), 3000)
        })
        .catch((e: unknown) => setUploads((u) => ({ ...u, [itemId]: { ...u[itemId], error: errMsg(e) } })))
        .finally(() => {
          delete handles.current[itemId]
        })
    },
    [reload],
  )

  const cancelUpload = (itemId: string) => handles.current[itemId]?.abort()

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
          <a
            href={course.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs inline-flex items-center gap-1 mt-1"
            style={{ color: course.status === 'DRAFT' ? 'var(--faint)' : 'var(--brand)' }}
          >
            {course.url.replace(/^https?:\/\//, '')} <ExternalLink size={12} />
          </a>
          {course.status === 'DRAFT' && (
            <p className="text-xs mt-1" style={{ color: 'var(--faint)' }}>
              Szkic — strona kursu powstanie po publikacji (Ustawienia ▸ Opublikuj).
            </p>
          )}
        </div>
      </div>

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
      {tab === 'settings' && <CourseSettingsTab course={course} onSaved={setCourse} onDeleted={onBack} />}
    </div>
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
