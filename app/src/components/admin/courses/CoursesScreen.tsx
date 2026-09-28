import { useCallback, useEffect, useState } from 'react'
import { GraduationCap, Plus, ExternalLink, Users, Film, AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  checkCourseSlug, createCourse, getCoursesConfig, listCourses, slugify,
  type CourseListItem, type CoursesConfig,
} from '@/lib/courses'
import CourseEditor from './CourseEditor'
import { Notice, Panel, StatusBadge, errMsg, t } from './shared'

/** „Formacja online" — lista kursów + tworzenie; po wyborze kursu edytor. */
export default function CoursesScreen() {
  const [courses, setCourses] = useState<CourseListItem[] | null>(null)
  const [config, setConfig] = useState<CoursesConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const [list, cfg] = await Promise.all([listCourses(), getCoursesConfig()])
      setCourses(list)
      setConfig(cfg)
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (selected) {
    return (
      <CourseEditor
        id={selected}
        config={config}
        onBack={() => {
          setSelected(null)
          void load()
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6 max-w-[980px]">
      {error && <Notice kind="err">Nie udało się pobrać kursów: {error}</Notice>}
      {config && !config.video.configured && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-[12px]" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p className="text-sm">
            Hosting wideo (Bunny Stream) nie jest jeszcze skonfigurowany — PDF-y i kursantów możesz dodawać już teraz, filmy po
            ustawieniu <code>BUNNY_STREAM_LIBRARY_ID</code> i <code>BUNNY_STREAM_API_KEY</code> na Renderze (instrukcja:
            docs/13-handoff-formacja-online.md).
          </p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Każdy kurs ma własny adres: <strong>{(config?.siteCourseBase ?? 'https://icpemission.pl/formacja').replace(/^https?:\/\//, '')}/nazwa-kursu</strong>
        </p>
        {!creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> Nowy kurs
          </Button>
        )}
      </div>

      {creating && (
        <CreateCourseForm
          base={config?.siteCourseBase ?? 'https://icpemission.pl/formacja'}
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            setSelected(id)
          }}
        />
      )}

      {courses && courses.length === 0 && !creating && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="flex items-center justify-center rounded-[18px]" style={{ width: 64, height: 64, background: 'var(--brand-soft)' }}>
            <GraduationCap size={28} style={{ color: 'var(--brand)' }} />
          </div>
          <div>
            <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Nie ma jeszcze kursów</p>
            <p className="mt-1 text-sm max-w-[380px]" style={{ color: 'var(--muted)' }}>
              Utwórz kurs, wgraj filmy i materiały PDF, a potem połącz go z eventem albo dodaj kursantów ręcznie.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {courses?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelected(c.id)}
            className="text-left rounded-[15px] border px-5 py-4 flex items-center gap-4 transition-all hover:shadow-md"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', cursor: 'pointer' }}
          >
            <div className="flex items-center justify-center rounded-[12px] shrink-0" style={{ width: 44, height: 44, background: 'var(--brand-soft)' }}>
              <GraduationCap size={20} style={{ color: 'var(--brand)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold" style={{ color: 'var(--ink)' }}>{t(c.title)}</p>
                <StatusBadge status={c.status} />
              </div>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--faint)' }}>{c.url.replace(/^https?:\/\//, '')}</p>
            </div>
            <div className="flex items-center gap-4 text-xs shrink-0" style={{ color: 'var(--muted)' }}>
              <span className="flex items-center gap-1"><Film size={14} /> {c.items}</span>
              <span className="flex items-center gap-1"><Users size={14} /> {c.members}</span>
              {c.status !== 'DRAFT' && (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1"
                  style={{ color: 'var(--brand)' }}
                >
                  <ExternalLink size={14} /> Otwórz
                </a>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function CreateCourseForm({ base, onCancel, onCreated }: { base: string; onCancel: () => void; onCreated: (id: string) => void }) {
  const [pl, setPl] = useState('')
  const [en, setEn] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugInfo, setSlugInfo] = useState<{ ok: boolean; reason?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveSlug = slugTouched ? slug : slugify(pl)

  useEffect(() => {
    if (!effectiveSlug) {
      setSlugInfo(null)
      return
    }
    const h = setTimeout(() => {
      checkCourseSlug(effectiveSlug)
        .then((r) => setSlugInfo(r))
        .catch(() => setSlugInfo(null))
    }, 400)
    return () => clearTimeout(h)
  }, [effectiveSlug])

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const title: Record<string, string> = { pl: pl.trim() }
      if (en.trim()) title.en = en.trim()
      const c = await createCourse({ title, slug: slugInfo?.ok ? effectiveSlug : undefined })
      onCreated(c.id)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Nowy kurs">
      <div className="grid md:grid-cols-2 gap-3">
        <Input label="Nazwa kursu (PL)" value={pl} onChange={(e) => setPl(e.target.value)} placeholder="np. Szkoła Nowej Ewangelizacji" autoFocus />
        <Input label="Nazwa (EN, opcjonalnie)" value={en} onChange={(e) => setEn(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Input
          label="Adres kursu"
          value={effectiveSlug}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(e.target.value.toLowerCase())
          }}
        />
        <p className="text-xs" style={{ color: slugInfo && !slugInfo.ok ? 'var(--err)' : 'var(--faint)' }}>
          {base.replace(/^https?:\/\//, '')}/<strong>{effectiveSlug || '…'}</strong>
          {slugInfo && !slugInfo.ok ? ` — ${slugInfo.reason}` : ''}
          {!slugInfo || slugInfo.ok ? ' · generowany z nazwy, możesz go zmienić' : ''}
        </p>
      </div>
      {error && <Notice kind="err">{error}</Notice>}
      <div className="flex gap-2">
        <Button onClick={() => { void submit() }} disabled={busy || !pl.trim() || (slugInfo !== null && !slugInfo.ok)}>
          {busy ? 'Tworzę…' : 'Utwórz kurs'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Anuluj</Button>
      </div>
      <p className="text-xs" style={{ color: 'var(--faint)' }}>
        Kurs powstaje jako <strong>szkic</strong> — kursanci nie dostaną maili, dopóki go nie opublikujesz.
      </p>
    </Panel>
  )
}
