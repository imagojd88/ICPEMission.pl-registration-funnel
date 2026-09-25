import { useCallback, useEffect, useState } from 'react'
import { Mail, Send, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { getAdminEmail, getMailLog, getMailStatus, sendTestMail, type MailLogItem, type MailStatus } from '@/lib/api'

const PROVIDER_LABEL: Record<MailStatus['provider'], string> = {
  resend: 'Resend',
  smtp: 'SMTP',
  log: 'Wyłączona (tylko log)',
}

const TYPE_LABEL: Record<string, string> = {
  CONFIRMATION: 'Potwierdzenie zgłoszenia',
  INVITATION: 'Zaproszenie',
  GUEST_INVITATION: 'Zaproszenie od uczestnika',
  INVITE_CONFIRMED: 'Potwierdzenie udziału',
  PAYMENT_REMINDER: 'Przypomnienie o płatności',
  TEST: 'Test',
}

function statusChip(status: string) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    SENT: { bg: 'var(--ok-soft)', fg: 'var(--ok)', label: 'Wysłany' },
    FAILED: { bg: 'var(--err-soft)', fg: 'var(--err)', label: 'Błąd' },
    LOGGED: { bg: 'var(--surface-2)', fg: 'var(--muted)', label: 'Nie wysłany' },
    QUEUED: { bg: 'var(--surface-2)', fg: 'var(--muted)', label: 'W kolejce' },
  }
  const s = map[status] ?? map.QUEUED
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  )
}

/**
 * Sekcja „E-mail" w Ustawieniach: który dostawca wysyła maile (Resend/SMTP/wyłączone),
 * z jakiego adresu, mail testowy i dziennik ostatnich wysyłek z treścią błędów.
 * Konfiguracja (klucz API, nadawca) siedzi w ENV na Renderze — tu tylko podgląd i test.
 */
export default function MailSettings() {
  const [status, setStatus] = useState<MailStatus | null>(null)
  const [log, setLog] = useState<MailLogItem[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [testTo, setTestTo] = useState(getAdminEmail() ?? '')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const [st, lg] = await Promise.all([getMailStatus(), getMailLog(20)])
      setStatus(st)
      setLog(lg)
      setLoadError(null)
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await sendTestMail(testTo.trim())
      if (res.status === 'SENT') setTestResult({ ok: true, text: `Wysłano na ${testTo.trim()} przez ${res.provider}. Sprawdź skrzynkę (także SPAM).` })
      else if (res.status === 'LOGGED') setTestResult({ ok: false, text: 'Wysyłka jest wyłączona — ustaw RESEND_API_KEY na Renderze (instrukcja poniżej).' })
      else setTestResult({ ok: false, text: `Dostawca odrzucił wysyłkę: ${res.error ?? 'nieznany błąd'}` })
      await load()
    } catch (e: unknown) {
      setTestResult({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  const active = status && status.provider !== 'log'

  return (
    <div
      className="rounded-[15px] border overflow-hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
    >
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>E-mail</p>
        <button
          type="button"
          onClick={() => { void load() }}
          className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-[8px]"
          style={{ color: 'var(--muted)', background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer' }}
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : undefined} /> Odśwież
        </button>
      </div>
      <div className="px-5 py-4 flex flex-col gap-4">
        {loadError && (
          <p className="text-xs font-medium px-3 py-2 rounded-[8px]" style={{ background: 'var(--err-soft)', color: 'var(--err)' }}>
            Nie udało się pobrać stanu poczty: {loadError}
          </p>
        )}

        {status && (
          <div className="flex items-start gap-3">
            <div
              className="flex items-center justify-center rounded-[10px] shrink-0"
              style={{ width: 36, height: 36, background: active ? 'var(--ok-soft)' : 'var(--err-soft)', color: active ? 'var(--ok)' : 'var(--err)' }}
            >
              {active ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            </div>
            <div className="min-w-0 flex flex-col gap-0.5">
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                Dostawca: {PROVIDER_LABEL[status.provider]}
                {status.provider === 'resend' && status.resendKeyHint ? ` (klucz ${status.resendKeyHint})` : ''}
                {status.provider === 'smtp' && status.smtpHost ? ` (${status.smtpHost})` : ''}
              </p>
              <p className="text-xs break-all" style={{ color: 'var(--faint)' }}>Nadawca: {status.from}</p>
              {status.replyTo && (
                <p className="text-xs break-all" style={{ color: 'var(--faint)' }}>Odpowiedzi na: {status.replyTo}</p>
              )}
              {!active && (
                <p className="text-xs mt-1" style={{ color: 'var(--err)' }}>
                  Maile nie wychodzą — zaproszenia i potwierdzenia trafiają tylko do logów serwera.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Mail testowy</p>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="adres@przyklad.pl" />
            </div>
            <Button size="sm" onClick={() => { void handleTest() }} disabled={testing || !testTo.trim()}>
              <Send size={14} /> {testing ? 'Wysyłam…' : 'Wyślij test'}
            </Button>
          </div>
          {testResult && (
            <p
              className="text-xs font-medium px-3 py-2 rounded-[8px]"
              style={testResult.ok ? { background: 'var(--ok-soft)', color: 'var(--ok)' } : { background: 'var(--err-soft)', color: 'var(--err)' }}
            >
              {testResult.text}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Ostatnie maile</p>
          {log.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--faint)' }}>Brak wysyłek.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {log.map((m) => (
                <div key={m.id} className="flex flex-col gap-0.5 px-3 py-2 rounded-[10px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--ink)' }}>
                      <Mail size={11} className="inline mr-1" style={{ verticalAlign: '-1px' }} />
                      {TYPE_LABEL[m.type] ?? m.type} → {m.to}
                    </p>
                    {statusChip(m.status)}
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--faint)' }}>
                    {new Date(m.createdAt).toLocaleString('pl-PL')}
                    {m.provider ? ` · ${m.provider}` : ''}
                  </p>
                  {m.error && (
                    <p className="text-[11px] flex items-start gap-1" style={{ color: 'var(--err)' }}>
                      <XCircle size={11} className="shrink-0 mt-[2px]" /> {m.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <details className="text-xs" style={{ color: 'var(--muted)' }}>
          <summary className="cursor-pointer font-medium" style={{ color: 'var(--ink)' }}>Jak podłączyć Resend</summary>
          <ol className="list-decimal pl-5 mt-2 flex flex-col gap-1">
            <li>Resend ▸ Domains ▸ dodaj <strong>icpemission.pl</strong> i wpisz pokazane rekordy DNS (DKIM, SPF/MX na subdomenie „send") u rejestratora. Rekordy Brevo zostają bez zmian.</li>
            <li>Po zielonym „Verified": Resend ▸ API Keys ▸ utwórz klucz z uprawnieniem „Sending access".</li>
            <li>Render ▸ icpe-api ▸ Environment: <code>RESEND_API_KEY</code> = klucz, <code>MAIL_MODE</code> = <code>resend</code> (albo puste), <code>MAIL_FROM</code> = np. „ICPE Mission &lt;rejestracja@icpemission.pl&gt;". Opcjonalnie <code>MAIL_REPLY_TO</code>.</li>
            <li>Zapisz (Render zrestartuje API) i kliknij „Wyślij test".</li>
          </ol>
        </details>
      </div>
    </div>
  )
}
