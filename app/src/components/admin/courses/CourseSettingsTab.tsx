import { useEffect, useMemo, useState } from 'react'
import { Save, Trash2, Send, Archive, Undo2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import { getAdminInstances, pickLang } from '@/lib/api'
import { checkCourseSlug, deleteCourse, updateCourse, type CourseDetail, type CourseStatus } from '@/lib/courses'
import { Notice, Panel, errMsg } from './shared'

type Instance = { id: string; title: unknown; startsAt: string; status: string }

export default function CourseSettingsTab({
  course, onSaved, onDeleted,
}: {
  course: CourseDetail
  onSaved: (c: CourseDetail) => void
  onDeleted: () => void
}) {
  const [titlePl, setTitlePl] = useState(course.title.pl ?? '')
  const [titleEn, setTitleEn] = useState(course.title.en ?? '')
  const [descPl, setDescPl] = useState(course.description?.pl ?? '')
  const [descEn, setDescEn] = useState(course.description?.en ?? '')
  const [slug, setSlug] = useState(course.slug)
  const [slugInfo, setSlugInfo] = useState<{ ok: boolean; reason?: string } | null>(null)
  const [sources, setSources] = useState<string[]>(course.sourceInstanceIds)
  const [grantOn, setGrantOn] = useState(course.grantOn)
  const [accessUntil, setAccessUntil] = useState(course.accessUntil ? course.accessUntil.slice(0, 10) : '')
  const [instances, setInstances] = useState<Instance[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    getAdminInstances()
      .then((list) => setInstances(list as unknown as Instance[]))
      .catch(() => setInstances([]))
  }, [])

  useEffect(() => {
    if (slug === course.slug) {
      setSlugInfo(null)
      return
    }
    const h = setTimeout(() => {
      checkCourseSlug(slug, course.id).then(setSlugInfo).catch(() => setSlugInfo(null))
    }, 400)
    return () => clearTimeout(h)
  }, [slug, course.slug, course.id])

  const sortedInstances = useMemo(
    () => [...(instances ?? [])].sort((a, b) => (b.startsAt ?? '').localeCompare(a.startsAt ?? '')),
    [instances],
  )

  async function save(extra?: { status?: CourseStatus }) {
    setBusy(true)
    setMsg(null)
    try {
      const title: Record<string, string> = { pl: titlePl.trim() }
      if (titleEn.trim()) title.en = titleEn.trim()
      const description: Record<string, string> = {}
      if (descPl.trim()) description.pl = descPl.trim()
      if (descEn.trim()) description.en = descEn.trim()
      const updated = await updateCourse(course.id, {
        title,
        description: Object.keys(description).length ? description : null,
        ...(slug !== course.slug ? { slug } : {}),
        sourceInstanceIds: sources,
        grantOn,
        accessUntil: accessUntil ? new Date(`${accessUntil}T23:59:59`).toISOString() : null,
        ...extra,
      })
      onSaved(updated)
      let text = 'Zapisano.'
      if (extra?.status === 'PUBLISHED') {
        text = 'Kurs opublikowany. Strona kursu będzie dostępna za ok. 1–3 minuty (przebudowa strony).'
        if (updated.welcome) text += ` Wysłane powitania: ${updated.welcome.sent}${updated.welcome.failed ? `, niewysłane: ${updated.welcome.failed} (sprawdź Ustawienia ▸ E-mail)` : ''}.`
      }
      if (slug !== course.slug && course.status !== 'DRAFT') text += ' Stary adres będzie przekierowywał na nowy.'
      setMsg({ kind: 'ok', text })
    } catch (e) {
      setMsg({ kind: 'err', text: errMsg(e) })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const typed = window.prompt(
      `Usunięcie kursu jest nieodwracalne: znikną materiały (także filmy z hostingu) i dostęp ${course.members} kursantów.\n\nWpisz adres kursu „${course.slug}", aby potwierdzić:`,
    )
    if (typed !== course.slug) return
    setBusy(true)
    try {
      await deleteCourse(course.id)
      onDeleted()
    } catch (e) {
      setMsg({ kind: 'err', text: errMsg(e) })
      setBusy(false)
    }
  }

  const toggle = (id: string) => setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <div className="flex flex-col gap-5">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}

      <Panel
        title="Publikacja"
        action={
          <span className="text-xs" style={{ color: 'var(--faint)' }}>
            {course.pendingWelcome > 0 && course.status === 'DRAFT' ? `${course.pendingWelcome} powitań czeka na publikację` : ''}
          </span>
        }
      >
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {course.status === 'DRAFT' && 'Szkic: strona kursu nie istnieje, maile do kursantów nie wychodzą. Po publikacji kursanci dostaną powitanie z linkiem do ustawienia hasła.'}
          {course.status === 'PUBLISHED' && 'Opublikowany: kursanci mogą się logować i oglądać materiały.'}
          {course.status === 'ARCHIVED' && 'Zarchiwizowany: strona kursu pokazuje informację o zakończeniu, logowanie jest zablokowane.'}
        </p>
        <div className="flex gap-2 flex-wrap">
          {course.status !== 'PUBLISHED' && (
            <Button onClick={() => void save({ status: 'PUBLISHED' })} disabled={busy}>
              <Send size={15} /> {course.status === 'ARCHIVED' ? 'Opublikuj ponownie' : 'Opublikuj kurs'}
            </Button>
          )}
          {course.status === 'PUBLISHED' && (
            <Button variant="outline" onClick={() => void save({ status: 'ARCHIVED' })} disabled={busy}>
              <Archive size={15} /> Zakończ (archiwizuj)
            </Button>
          )}
          {course.status !== 'DRAFT' && (
            <Button variant="ghost" onClick={() => void save({ status: 'DRAFT' })} disabled={busy}>
              <Undo2 size={15} /> Cofnij do szkicu
            </Button>
          )}
        </div>
      </Panel>

      <Panel title="Nazwa, opis i adres">
        <div className="grid md:grid-cols-2 gap-3">
          <Input label="Nazwa (PL)" value={titlePl} onChange={(e) => setTitlePl(e.target.value)} />
          <Input label="Nazwa (EN, opcjonalnie)" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          <Textarea label="Opis na stronie kursu (PL)" value={descPl} onChange={(e) => setDescPl(e.target.value)} />
          <Textarea label="Opis (EN, opcjonalnie)" value={descEn} onChange={(e) => setDescEn(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Input label="Adres kursu" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().trim())} />
          <p className="text-xs" style={{ color: slugInfo && !slugInfo.ok ? 'var(--err)' : 'var(--faint)' }}>
            icpemission.pl/formacja/<strong>{slug || '…'}</strong>
            {slugInfo && !slugInfo.ok ? ` — ${slugInfo.reason}` : ''}
            {slug !== course.slug && course.status !== 'DRAFT' && (!slugInfo || slugInfo.ok)
              ? ' — po zmianie stary adres będzie przekierowywał na nowy'
              : ''}
          </p>
        </div>
      </Panel>

      <Panel title="Kto ma dostęp automatycznie">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Zaznacz eventy, których uczestnicy mają dostać dostęp do kursu. Osoby dodane ręcznie (zakładka Kursanci) mają dostęp niezależnie od tego.
        </p>
        {instances === null && <p className="text-sm" style={{ color: 'var(--faint)' }}>Wczytuję eventy…</p>}
        {instances && instances.length === 0 && <p className="text-sm" style={{ color: 'var(--faint)' }}>Brak eventów.</p>}
        <div className="flex flex-col gap-1 max-h-[280px] overflow-y-auto">
          {sortedInstances.map((i) => (
            <label key={i.id} className="flex items-center gap-2 text-sm py-1 cursor-pointer" style={{ color: 'var(--ink)' }}>
              <input type="checkbox" checked={sources.includes(i.id)} onChange={() => toggle(i.id)} />
              <span className="flex-1">{pickLang(i.title as never, 'pl')}</span>
              <span className="text-xs" style={{ color: 'var(--faint)' }}>
                {i.startsAt ? new Date(i.startsAt).toLocaleDateString('pl-PL') : ''}
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Dostęp od:</p>
          <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--ink)' }}>
            <input type="radio" checked={grantOn === 'CONFIRMED'} onChange={() => setGrantOn('CONFIRMED')} className="mt-1" />
            <span>
              potwierdzenia zgłoszenia <span style={{ color: 'var(--faint)' }}>(opłacone / zatwierdzone przez admina — status „Potwierdzone")</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--ink)' }}>
            <input type="radio" checked={grantOn === 'ANY_ACTIVE'} onChange={() => setGrantOn('ANY_ACTIVE')} className="mt-1" />
            <span>
              samego zapisu <span style={{ color: 'var(--faint)' }}>(także „czeka na płatność/przelew" — dobre dla kursu bezpłatnego)</span>
            </span>
          </label>
        </div>
        <div className="max-w-[260px]">
          <Input label="Dostęp wygasa (opcjonalnie)" type="date" value={accessUntil} onChange={(e) => setAccessUntil(e.target.value)} />
        </div>
      </Panel>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button onClick={() => void save()} disabled={busy || !titlePl.trim() || (slugInfo !== null && !slugInfo.ok)}>
          <Save size={15} /> {busy ? 'Zapisuję…' : 'Zapisz ustawienia'}
        </Button>
        <Button variant="ghost" onClick={() => void remove()} disabled={busy} style={{ color: 'var(--err)' }}>
          <Trash2 size={15} /> Usuń kurs
        </Button>
      </div>
    </div>
  )
}
