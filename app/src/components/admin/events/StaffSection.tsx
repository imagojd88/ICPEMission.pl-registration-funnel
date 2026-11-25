import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, KeyRound, Trash2, UserPlus } from 'lucide-react'
import { DESK_ACTIVE_SCOPES, type DeskScope } from '@icpe/shared'
import { addStaff, listStaff, removeStaff, resetStaffPassword, updateStaff, type StaffGrant } from '@/lib/deskApi'

/** Etykiety zakresów w panelu (panel admina jest po polsku). */
const SCOPE_LABELS: Record<string, { label: string; hint: string }> = {
  checkin: { label: 'Obecność', hint: 'oznaczanie przyjazdu' },
  payments: { label: 'Wpłaty', hint: 'widzi kwoty, przyjmuje wpłaty' },
  keys: { label: 'Klucze', hint: 'wydanie i zwrot klucza' },
  requests: { label: 'Prośby', hint: 'prośby dodatkowe gości' },
  'participants.view': { label: 'Podgląd listy', hint: 'tylko odczyt' },
}

const inputStyle: React.CSSProperties = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' }

function ScopePicker({ value, onChange, disabled }: { value: DeskScope[]; onChange: (v: DeskScope[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {DESK_ACTIVE_SCOPES.map((s) => {
        const on = value.includes(s)
        return (
          <button
            key={s}
            type="button"
            disabled={disabled}
            title={SCOPE_LABELS[s]?.hint}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== s) : [...value, s])}
            className="rounded-full px-3 py-1.5 text-xs font-semibold border"
            style={{
              cursor: disabled ? 'default' : 'pointer',
              background: on ? 'var(--brand)' : 'var(--surface)',
              color: on ? '#fff' : 'var(--ink)',
              borderColor: on ? 'var(--brand)' : 'var(--border)',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {SCOPE_LABELS[s]?.label ?? s}
          </button>
        )
      })}
    </div>
  )
}

/** Hasło tymczasowe pokazywane RAZ — po zamknięciu nie da się go odczytać (w bazie jest tylko hash). */
function PasswordBox({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="rounded-[12px] p-4 flex flex-col gap-2" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}>
      <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Hasło tymczasowe — widoczne tylko teraz</p>
      <p className="text-sm" style={{ color: 'var(--ink)' }}>
        Przekaż je pomocnikowi osobiście lub telefonicznie. System nie wysyła żadnego maila i po zamknięciu tego okienka hasła nie da się już odczytać (można tylko wygenerować nowe).
      </p>
      <div className="text-sm" style={{ color: 'var(--ink)' }}>
        Login: <strong>{email}</strong>
        <br />
        Hasło: <strong style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 18, letterSpacing: 1 }}>{password}</strong>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          className="rounded-[10px] border px-3 py-2 text-sm font-semibold"
          style={{ ...inputStyle, cursor: 'pointer' }}
          onClick={() => {
            void navigator.clipboard?.writeText(password).then(() => setCopied(true))
          }}
        >
          {copied ? 'Skopiowano' : 'Kopiuj hasło'}
        </button>
        <button type="button" className="rounded-[10px] px-3 py-2 text-sm font-semibold" style={{ background: 'var(--brand)', color: '#fff', border: 'none', cursor: 'pointer' }} onClick={onClose}>
          Przekazane, zamknij
        </button>
      </div>
    </div>
  )
}

/**
 * „Edytuj event ▸ Pomocnicy”: konta z dostępem wyłącznie do Recepcji tego eventu.
 * Zmiany zapisują się od razu (niezależnie od przycisku „Zapisz” formularza eventu).
 */
export default function StaffSection({ instanceId }: { instanceId: string }) {
  const [rows, setRows] = useState<StaffGrant[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [scopes, setScopes] = useState<DeskScope[]>(['checkin', 'keys', 'requests'])
  const [expires, setExpires] = useState('')
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = useCallback(() => {
    listStaff(instanceId)
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [instanceId])

  useEffect(() => {
    load()
  }, [load])

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      return await fn()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd() {
    if (!email.trim()) return setError('Podaj adres e-mail pomocnika.')
    if (scopes.length === 0) return setError('Wybierz co najmniej jeden zakres dostępu.')
    const res = await run(() => addStaff(instanceId, { email: email.trim(), scopes, expiresAt: expires || null }))
    if (!res) return
    if (res.tempPassword) setSecret({ email: res.grant.email, password: res.tempPassword })
    else setInfo(`${res.grant.email} ma już konto pomocnika (z innego wydarzenia). Loguje się dotychczasowym hasłem; w razie potrzeby użyj „Nowe hasło”.`)
    setEmail('')
    setExpires('')
    load()
  }

  async function handleScopes(g: StaffGrant, next: DeskScope[]) {
    if (next.length === 0) return setError('Pomocnik musi mieć co najmniej jeden zakres. Aby zabrać dostęp, użyj „Odbierz dostęp”.')
    const res = await run(() => updateStaff(instanceId, g.id, { scopes: next }))
    if (res) setRows((list) => (list ?? []).map((x) => (x.id === g.id ? res : x)))
  }

  async function handleExpiry(g: StaffGrant, value: string) {
    const res = await run(() => updateStaff(instanceId, g.id, { expiresAt: value || null }))
    if (res) setRows((list) => (list ?? []).map((x) => (x.id === g.id ? res : x)))
  }

  async function handleRemove(g: StaffGrant) {
    if (!window.confirm(`Odebrać ${g.email} dostęp do recepcji tego wydarzenia?`)) return
    const res = await run(() => removeStaff(instanceId, g.id))
    if (res) load()
  }

  async function handleReset(g: StaffGrant) {
    if (!window.confirm(`Wygenerować nowe hasło dla ${g.email}? Dotychczasowe przestanie działać, a pomocnik zostanie wylogowany.`)) return
    const res = await run(() => resetStaffPassword(instanceId, g.id))
    if (res) setSecret({ email: res.email, password: res.tempPassword })
  }

  return (
    <div className="rounded-[15px] border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>Pomocnicy (Recepcja)</p>
        <a href={`/recepcja/${instanceId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--brand)' }}>
          <ExternalLink size={14} /> Otwórz recepcję
        </a>
      </div>
      <div className="px-5 py-4 flex flex-col gap-4">
        <p className="text-xs" style={{ color: 'var(--faint)' }}>
          Pomocnik loguje się na stronie <strong>/recepcja</strong> i widzi wyłącznie to wydarzenie, w wybranym zakresie. Nie ma wstępu do panelu administratora. Zmiany w tej sekcji zapisują się od razu.
        </p>

        {error && (
          <div className="px-3 py-2 rounded-[10px] text-sm" style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}>{error}</div>
        )}
        {info && (
          <div className="px-3 py-2 rounded-[10px] text-sm" style={{ background: 'var(--brand-soft)', color: 'var(--ink)' }}>{info}</div>
        )}
        {secret && <PasswordBox email={secret.email} password={secret.password} onClose={() => setSecret(null)} />}

        {rows === null ? (
          <p className="text-sm" style={{ color: 'var(--faint)' }}>Ładowanie…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--faint)' }}>Brak pomocników. Recepcję mogą obsługiwać administratorzy.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((g) => (
              <li key={g.id} className="rounded-[12px] border p-3 flex flex-col gap-2.5" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                    {g.email}
                    {g.expired && <span className="ml-2 text-xs font-semibold" style={{ color: 'var(--err)' }}>dostęp wygasł</span>}
                  </span>
                  <span className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => void handleReset(g)} className="inline-flex items-center gap-1 rounded-[10px] border px-2.5 py-1.5 text-xs font-semibold" style={{ ...inputStyle, cursor: 'pointer' }}>
                      <KeyRound size={13} /> Nowe hasło
                    </button>
                    <button type="button" disabled={busy} onClick={() => void handleRemove(g)} className="inline-flex items-center gap-1 rounded-[10px] border px-2.5 py-1.5 text-xs font-semibold" style={{ background: 'transparent', borderColor: 'var(--err)', color: 'var(--err)', cursor: 'pointer' }}>
                      <Trash2 size={13} /> Odbierz dostęp
                    </button>
                  </span>
                </div>
                <ScopePicker value={g.scopes} disabled={busy} onChange={(next) => void handleScopes(g, next)} />
                <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                  Dostęp do dnia (opcjonalnie):
                  <input
                    type="date"
                    disabled={busy}
                    value={g.expiresAt ? g.expiresAt.slice(0, 10) : ''}
                    onChange={(e) => void handleExpiry(g, e.target.value)}
                    className="rounded-[8px] border px-2 py-1 text-xs"
                    style={inputStyle}
                  />
                </label>
                <p className="text-xs" style={{ color: 'var(--faint)' }}>
                  Dodał(a): {g.createdBy}, {new Date(g.createdAt).toLocaleDateString('pl-PL')}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-[12px] p-3 flex flex-col gap-3" style={{ background: 'var(--bg)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Dodaj pomocnika</p>
          <input
            type="email"
            value={email}
            placeholder="adres e-mail pomocnika"
            autoComplete="off"
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleAdd()
              }
            }}
            className="rounded-[10px] border px-3 py-2 text-sm"
            style={inputStyle}
          />
          <ScopePicker value={scopes} onChange={setScopes} disabled={busy} />
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            Dostęp do dnia (opcjonalnie):
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className="rounded-[8px] border px-2 py-1 text-xs" style={inputStyle} />
          </label>
          <div>
            <button type="button" disabled={busy} onClick={() => void handleAdd()} className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold" style={{ background: 'var(--brand)', color: '#fff', border: 'none', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              <UserPlus size={15} /> Dodaj pomocnika
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
