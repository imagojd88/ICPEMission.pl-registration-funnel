import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, UserPlus, Mail, Ban, RotateCcw, Upload, KeyRound, Copy } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Badge from '@/components/ui/Badge'
import {
  addEnrollment, generatePassword, importEnrollments, listEnrollments, resendWelcome, sendResetLink, setEnrollmentRevoked,
  setMemberPassword, syncCourseAccess,
  type CourseDetail, type Enrollment,
} from '@/lib/courses'
import { Notice, Panel, errMsg, fmtDate } from './shared'

const MAIL_STATUS: Record<string, string> = {
  SENT: 'wysłany',
  LOGGED: 'NIE wysłany — poczta wyłączona (Ustawienia ▸ E-mail)',
  FAILED: 'błąd wysyłki (Ustawienia ▸ E-mail)',
  SKIPPED: 'pominięty',
}

export default function CourseMembersTab({ course, onChanged }: { course: CourseDetail; onChanged: () => Promise<void> | void }) {
  const [rows, setRows] = useState<Enrollment[] | null>(null)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [pwFor, setPwFor] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRows(await listEnrollments(course.id))
    } catch (e) {
      setMsg({ kind: 'err', text: errMsg(e) })
    }
  }, [course.id])

  useEffect(() => {
    void load()
  }, [load])

  async function act(fn: () => Promise<string | void>) {
    setBusy(true)
    setMsg(null)
    try {
      const text = await fn()
      if (text) setMsg({ kind: 'ok', text })
      await load()
      await onChanged()
    } catch (e) {
      setMsg({ kind: 'err', text: errMsg(e) })
    } finally {
      setBusy(false)
    }
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (rows ?? []).filter((r) => !q || `${r.email} ${r.firstName} ${r.lastName}`.toLowerCase().includes(q))
  }, [rows, filter])

  const active = rows?.filter((r) => r.active).length ?? 0

  return (
    <div className="flex flex-col gap-5">
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {course.status === 'DRAFT' && (
        <Notice kind="info">Kurs jest szkicem — dodane osoby dostaną mail powitalny dopiero po publikacji kursu.</Notice>
      )}

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" onClick={() => { setShowAdd((v) => !v); setShowImport(false) }}>
          <UserPlus size={15} /> Dodaj osobę
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setShowImport((v) => !v); setShowAdd(false) }}>
          <Upload size={15} /> Importuj listę
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || course.sourceInstanceIds.length === 0}
          title={course.sourceInstanceIds.length === 0 ? 'Najpierw zaznacz eventy w Ustawieniach' : ''}
          onClick={() =>
            void act(async () => {
              const r = await syncCourseAccess(course.id)
              return `Sprawdzono ${r.processed} zgłoszeń z powiązanych eventów. Aktywnych kursantów: ${r.active}.`
            })
          }
        >
          <RefreshCw size={15} /> Synchronizuj z eventami
        </Button>
      </div>

      {showAdd && <AddForm busy={busy} onSubmit={(b) => act(async () => {
        const r = await addEnrollment(course.id, b)
        setShowAdd(false)
        if (!r.created && !r.restored) return 'Ta osoba już ma dostęp.'
        if (r.courseStatus !== 'PUBLISHED') return 'Dodano. Powitanie wyjdzie po publikacji kursu.'
        return `Dodano. Mail powitalny: ${MAIL_STATUS[r.mail ?? ''] ?? (b.sendWelcome === false ? 'nie wysyłano' : '—')}.`
      })} />}

      {showImport && <ImportForm busy={busy} onSubmit={(text, sendWelcome) => act(async () => {
        const r = await importEnrollments(course.id, text, sendWelcome)
        setShowImport(false)
        return `Dodano: ${r.added}, już miało dostęp: ${r.existing}${r.invalid.length ? `, pominięte (błędny e-mail): ${r.invalid.length} — ${r.invalid.slice(0, 3).join(' | ')}` : ''}.`
      })} />}

      <Panel
        title={`Kursanci — aktywni: ${active}${rows && rows.length !== active ? ` / wszyscy: ${rows.length}` : ''}`}
        action={<div className="w-[220px]"><Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Szukaj…" className="py-1.5" /></div>}
      >
        {rows === null && <p className="text-sm" style={{ color: 'var(--faint)' }}>Wczytuję…</p>}
        {rows && rows.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Nikt jeszcze nie ma dostępu. Dodaj osoby ręcznie albo powiąż kurs z eventem w Ustawieniach.
          </p>
        )}
        {visible.length > 0 && (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider" style={{ color: 'var(--faint)' }}>
                  <th className="px-5 py-2 font-semibold">Osoba</th>
                  <th className="px-2 py-2 font-semibold">Źródło</th>
                  <th className="px-2 py-2 font-semibold">Konto</th>
                  <th className="px-2 py-2 font-semibold">Ostatnio</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <Fragment key={r.id}>
                  <tr style={{ borderTop: '1px solid var(--border)', opacity: r.active ? 1 : 0.55 }}>
                    <td className="px-5 py-2">
                      <p className="font-medium" style={{ color: 'var(--ink)' }}>{`${r.firstName} ${r.lastName}`.trim() || '—'}</p>
                      <p className="text-xs" style={{ color: 'var(--faint)' }}>{r.email}</p>
                    </td>
                    <td className="px-2 py-2">
                      <Badge variant={r.source === 'AUTO' ? 'brand' : 'muted'}>{r.source === 'AUTO' ? 'Z eventu' : 'Ręcznie'}</Badge>
                      {!r.active && <p className="text-xs mt-1" style={{ color: 'var(--err)' }}>{r.revokedReason === 'AUTO' ? 'Zgłoszenie anulowane' : 'Dostęp odebrany'}</p>}
                    </td>
                    <td className="px-2 py-2 text-xs" style={{ color: 'var(--muted)' }}>
                      {r.passwordSet ? 'Hasło ustawione' : r.welcomeSentAt ? `Zaproszony ${fmtDate(r.welcomeSentAt)}` : 'Powitanie niewysłane'}
                    </td>
                    <td className="px-2 py-2 text-xs" style={{ color: 'var(--muted)' }}>{fmtDate(r.lastSeenAt ?? r.lastLoginAt)}</td>
                    <td className="px-5 py-2">
                      <div className="flex gap-1 justify-end">
                        {r.active && (
                          <button
                            type="button"
                            title="Hasło: wyślij link do zmiany albo ustaw ręcznie"
                            onClick={() => setPwFor(pwFor === r.id ? null : r.id)}
                            style={{ ...iconBtn, color: pwFor === r.id ? 'var(--brand)' : 'var(--muted)' }}
                          >
                            <KeyRound size={15} />
                          </button>
                        )}
                        {r.active && !r.passwordSet && (
                          <button
                            type="button"
                            title="Wyślij ponownie mail z linkiem do ustawienia hasła"
                            disabled={busy}
                            onClick={() => void act(async () => {
                              const x = await resendWelcome(course.id, r.id)
                              return `Mail do ${r.email}: ${MAIL_STATUS[x.status] ?? x.status}.`
                            })}
                            style={iconBtn}
                          >
                            <Mail size={15} />
                          </button>
                        )}
                        {r.active ? (
                          <button
                            type="button"
                            title="Odbierz dostęp"
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm(`Odebrać dostęp: ${r.email}?`)) void act(async () => { await setEnrollmentRevoked(course.id, r.id, true); return 'Dostęp odebrany.' })
                            }}
                            style={{ ...iconBtn, color: 'var(--err)' }}
                          >
                            <Ban size={15} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            title="Przywróć dostęp"
                            disabled={busy}
                            onClick={() => void act(async () => { await setEnrollmentRevoked(course.id, r.id, false); return 'Dostęp przywrócony.' })}
                            style={iconBtn}
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {pwFor === r.id && (
                    <tr>
                      <td colSpan={5} className="px-5 pb-4" style={{ background: 'var(--surface-2)' }}>
                        <PasswordPanel
                          person={r}
                          courseStatus={course.status}
                          onClose={() => setPwFor(null)}
                          onSendLink={() => act(async () => {
                            const x = await sendResetLink(course.id, r.id)
                            setPwFor(null)
                            const what = x.kind === 'WELCOME' ? 'Mail powitalny z linkiem „Ustaw hasło"' : 'Link do zmiany hasła (ważny 48 h)'
                            return `${what} → ${r.email}: ${MAIL_STATUS[x.status] ?? x.status}.`
                          })}
                          onSetPassword={async (pw) => {
                            await setMemberPassword(course.id, r.id, pw)
                            await load()
                          }}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 6, borderRadius: 8 }

function PasswordPanel({ person, courseStatus, onClose, onSendLink, onSetPassword }: {
  person: Enrollment
  courseStatus: string
  onClose: () => void
  onSendLink: () => void
  onSetPassword: (pw: string) => Promise<void>
}) {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function save() {
    if (pw.length < 8) return setErr('Hasło musi mieć co najmniej 8 znaków.')
    setBusy(true)
    setErr(null)
    try {
      await onSetPassword(pw)
      setSaved(pw)
    } catch (e) {
      setErr(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  if (saved) {
    const msg = `Twoje dane do kursu:\nE-mail: ${person.email}\nHasło: ${saved}`
    return (
      <div className="flex flex-col gap-2 pt-3">
        <Notice kind="ok">
          Hasło ustawione. Przekaż je kursantowi — działa we wszystkich jego kursach. Wcześniejsze logowania na innych urządzeniach zostały wylogowane.
        </Notice>
        <div className="flex items-center gap-3 flex-wrap">
          <code className="text-sm px-3 py-1.5 rounded-[8px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
            {person.email} · {saved}
          </code>
          <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(msg).then(() => setCopied(true)) }}>
            <Copy size={14} /> {copied ? 'Skopiowano' : 'Kopiuj dane logowania'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Zamknij</Button>
        </div>
        <p className="text-xs" style={{ color: 'var(--faint)' }}>Hasło nie jest nigdzie zapisywane jawnie — po zamknięciu nie da się go już podejrzeć.</p>
      </div>
    )
  }

  return (
    <div className="grid md:grid-cols-2 gap-4 pt-3">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Wyślij link mailem</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {person.passwordSet
            ? `Kursant dostanie na ${person.email} link do ustawienia nowego hasła (ważny 48 h). Obecne hasło działa, dopóki nie ustawi nowego.`
            : `Kursant nie ma jeszcze hasła — dostanie mail powitalny z linkiem „Ustaw hasło".`}
        </p>
        <div>
          <Button size="sm" onClick={onSendLink} disabled={courseStatus !== 'PUBLISHED'}>
            <Mail size={14} /> Wyślij link
          </Button>
          {courseStatus !== 'PUBLISHED' && <p className="text-xs mt-1" style={{ color: 'var(--warn)' }}>Najpierw opublikuj kurs.</p>}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Ustaw hasło ręcznie</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>Np. gdy kursant nie odbiera maili — ustaw hasło i przekaż je telefonicznie lub SMS-em.</p>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="min. 8 znaków" className="py-2" autoComplete="new-password" />
          </div>
          <Button size="sm" variant="outline" onClick={() => setPw(generatePassword())} type="button">Generuj</Button>
          <Button size="sm" onClick={() => void save()} disabled={busy || pw.length < 8}>{busy ? 'Zapisuję…' : 'Ustaw'}</Button>
        </div>
        {err && <p className="text-xs" style={{ color: 'var(--err)' }}>{err}</p>}
      </div>
    </div>
  )
}

function AddForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: { email: string; firstName: string; lastName: string; locale: string; sendWelcome: boolean }) => void }) {
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [locale, setLocale] = useState('pl')
  const [sendWelcome, setSendWelcome] = useState(true)
  return (
    <Panel title="Dodaj osobę">
      <div className="grid md:grid-cols-3 gap-3">
        <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Imię" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <Input label="Nazwisko" value={lastName} onChange={(e) => setLastName(e.target.value)} />
      </div>
      <div className="flex items-center gap-4 flex-wrap text-sm" style={{ color: 'var(--ink)' }}>
        <label className="flex items-center gap-2">
          Język maili:
          <select value={locale} onChange={(e) => setLocale(e.target.value)} className="rounded-[8px] border px-2 py-1" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <option value="pl">polski</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} /> Wyślij mail powitalny
        </label>
      </div>
      <div>
        <Button size="sm" disabled={busy || !email.includes('@')} onClick={() => onSubmit({ email, firstName, lastName, locale, sendWelcome })}>
          Dodaj
        </Button>
      </div>
    </Panel>
  )
}

function ImportForm({ busy, onSubmit }: { busy: boolean; onSubmit: (text: string, sendWelcome: boolean) => void }) {
  const [text, setText] = useState('')
  const [sendWelcome, setSendWelcome] = useState(true)
  const count = text.split(/\r?\n/).filter((l) => l.includes('@')).length
  return (
    <Panel title="Importuj listę">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'jan.kowalski@example.com; Jan; Kowalski\nanna@example.com; Anna; Nowak'}
        rows={6}
      />
      <p className="text-xs" style={{ color: 'var(--faint)' }}>
        Jedna osoba w linii: e-mail; imię; nazwisko (średnik, przecinek albo tabulator — można wkleić kolumny z Excela). Maks. 500 osób.
      </p>
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
        <input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} /> Wyślij maile powitalne
      </label>
      <div>
        <Button size="sm" disabled={busy || count === 0} onClick={() => onSubmit(text, sendWelcome)}>
          Importuj {count ? `(${count})` : ''}
        </Button>
      </div>
    </Panel>
  )
}
