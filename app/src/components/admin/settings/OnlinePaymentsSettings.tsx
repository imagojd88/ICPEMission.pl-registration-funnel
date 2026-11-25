import { useCallback, useEffect, useState } from 'react'
import { CreditCard, CheckCircle2, XCircle, AlertTriangle, Copy, Check, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/Button'
import { getOnlinePaymentsStatus, type OnlinePaymentsStatus } from '@/lib/api'

const KEY_LABELS: Array<[keyof OnlinePaymentsStatus['keys'], string]> = [
  ['clientId', 'TPAY_CLIENT_ID'],
  ['clientSecret', 'TPAY_CLIENT_SECRET'],
  ['merchantId', 'TPAY_MERCHANT_ID'],
  ['securityCode', 'TPAY_SECURITY_CODE'],
  ['apiPublicUrl', 'API_PUBLIC_URL'],
]

/**
 * Kafel „Płatności online” w Ustawieniach: tryb, środowisko, czy klucze są ustawione (tylko tak / nie —
 * API nie zwraca żadnych wartości kluczy) i adres powiadomień do wklejenia w panelu Tpay.
 * Konfiguracja siedzi w ENV na Renderze; tu jest wyłącznie podgląd.
 */
export default function OnlinePaymentsSettings() {
  const [status, setStatus] = useState<OnlinePaymentsStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStatus(await getOnlinePaymentsStatus())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function copyUrl() {
    if (!status?.notificationUrl) return
    try {
      await navigator.clipboard.writeText(status.notificationUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* schowek niedostępny — adres można zaznaczyć ręcznie */
    }
  }

  const yesNo = (ok: boolean) =>
    ok ? (
      <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--ok)' }}><CheckCircle2 size={13} /> ustawione</span>
    ) : (
      <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--err)' }}><XCircle size={13} /> brak</span>
    )

  return (
    <div className="rounded-[15px] border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="font-bold text-sm flex items-center gap-2" style={{ color: 'var(--ink)' }}><CreditCard size={16} /> Płatności online</p>
        <Button size="sm" variant="ghost" onClick={() => { void load() }} disabled={loading}>
          <RefreshCw size={13} /> Odśwież
        </Button>
      </div>
      <div className="px-5 py-4 flex flex-col gap-3 text-sm" style={{ color: 'var(--ink)' }}>
        {error && (
          <p className="text-xs" style={{ color: 'var(--err)' }}>
            Nie udało się wczytać stanu płatności online ({error}). Jeśli API nie zostało jeszcze wdrożone w nowej wersji, zrób Manual Deploy `icpe-api`.
          </p>
        )}
        {!status && !error && <p className="text-xs" style={{ color: 'var(--faint)' }}>Ładowanie…</p>}
        {status && (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>Tryb: <strong>{status.mode === 'tpay' ? 'Tpay' : 'wyłączone (mock)'}</strong></span>
              <span>Środowisko: <strong>{status.env === 'production' ? 'produkcja' : 'sandbox (testowe)'}</strong></span>
              <span>
                Stan:{' '}
                <strong style={{ color: status.ready ? 'var(--ok)' : 'var(--muted)' }}>
                  {status.ready ? 'gotowe — goście z Polski widzą płatność online' : status.mode === 'tpay' ? 'niepełna konfiguracja' : 'goście nie widzą płatności online'}
                </strong>
              </span>
            </div>

            {status.testModeOnProduction && (
              <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-[10px]" role="alert" style={{ background: 'var(--err-soft)', color: 'var(--ink)', border: '1px solid var(--err)' }}>
                <AlertTriangle size={14} style={{ color: 'var(--err)', flexShrink: 0, marginTop: 1 }} />
                <span>
                  <strong>TPAY_ALLOW_TEST_MODE jest włączone na produkcji.</strong> System przyjmuje testowe wpłaty Tpay: są księgowane
                  (ze znacznikiem TEST) i potwierdzają zgłoszenia, choć żadne pieniądze nie wpływają. Po zakończeniu testów ustaw
                  TPAY_ALLOW_TEST_MODE=false na Renderze i wyłącz tryb testowy w panelu Tpay.
                </span>
              </div>
            )}
            {status.mode === 'tpay' && status.env === 'sandbox' && (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Sandbox: wpłaty są testowe (znacznik TEST w „Płatności”), ale potwierdzają zgłoszenia jak prawdziwe. Nie włączaj płatności online na prawdziwym evencie, dopóki środowisko to sandbox.
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              {KEY_LABELS.map(([k, label]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <span className="font-mono text-xs" style={{ color: 'var(--muted)' }}>{label}</span>
                  {yesNo(status.keys[k])}
                </div>
              ))}
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs" style={{ color: 'var(--muted)' }}>TPAY_ALLOW_TEST_MODE</span>
                <span className="text-xs font-semibold" style={{ color: status.allowTestMode ? 'var(--warn)' : 'var(--muted)' }}>{status.allowTestMode ? 'true' : 'false'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Root CA Tpay</span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {status.rootCa === 'env' ? 'z TPAY_ROOT_CA_PEM' : status.rootCa === 'file' ? 'z pliku TPAY_ROOT_CA_FILE' : 'pobierany z oficjalnego adresu Tpay'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Adres powiadomień (wklej w panelu Tpay ▸ Ustawienia ▸ Powiadomienia)</span>
              {status.notificationUrl ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 min-w-0 text-xs px-2.5 py-2 rounded-[9px] break-all" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>{status.notificationUrl}</code>
                  <Button size="sm" variant="outline" onClick={() => { void copyUrl() }}>
                    {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Skopiowano' : 'Kopiuj'}
                  </Button>
                </div>
              ) : (
                <span className="text-xs" style={{ color: 'var(--err)' }}>Ustaw API_PUBLIC_URL (adres https API), żeby zobaczyć adres powiadomień.</span>
              )}
            </div>
            <p className="text-xs" style={{ color: 'var(--faint)' }}>
              Wartości kluczy ustawiasz wyłącznie na Renderze (icpe-api ▸ Environment). Panel pokazuje tylko, czy są ustawione.
              Zwroty wpłat Tpay zleca się w „Płatnościach” (przycisk „Zwróć” przy wpłacie).
            </p>
          </>
        )}
      </div>
    </div>
  )
}
