import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { getOnlinePaymentsStatus, type OnlinePaymentsStatus } from '@/lib/api'

/**
 * Ostrzeżenie pod „Płatność online” w edycji eventu: metoda zaznaczona, a goście jej nie zobaczą,
 * bo Tpay nie jest skonfigurowany albo waluta eventu to nie PLN. Samo zaznaczenie nie jest blokowane.
 */
export default function OnlinePaymentWarning({ enabled, currency }: { enabled: boolean; currency: string }) {
  const [status, setStatus] = useState<OnlinePaymentsStatus | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!enabled || status || failed) return
    let alive = true
    getOnlinePaymentsStatus()
      .then((s) => { if (alive) setStatus(s) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [enabled, status, failed])

  if (!enabled) return null
  const problems: string[] = []
  if (failed) problems.push('Nie udało się sprawdzić konfiguracji płatności online (API może wymagać wdrożenia nowej wersji).')
  if (status && !status.ready) {
    problems.push(
      status.mode !== 'tpay'
        ? 'Tpay nie jest włączony na serwerze (PAYMENTS_MODE ≠ tpay) — goście nie zobaczą płatności online.'
        : `Tpay nie jest w pełni skonfigurowany (brakuje: ${status.missing.join(', ')}) — goście nie zobaczą płatności online.`,
    )
  }
  if (currency !== 'PLN') problems.push(`Tpay przyjmuje tylko złotówki, a waluta eventu to ${currency} — goście nie zobaczą płatności online.`)
  if (status?.ready && currency === 'PLN') {
    return (
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        BLIK · szybki przelew (Tpay{status.env === 'sandbox' ? ', środowisko testowe' : ''}). Widoczna tylko dla zgłoszeń z Polski
        (kraj zamieszkania, a gdy go brak — polski język strony). Pozostali goście płacą przelewem.
      </p>
    )
  }
  if (problems.length === 0) return null
  return (
    <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-[10px]" role="alert" style={{ background: 'var(--warn-soft)', color: 'var(--ink)', border: '1px solid var(--warn)' }}>
      <AlertTriangle size={14} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 1 }} />
      <div className="flex flex-col gap-1">
        {problems.map((p) => <span key={p}>{p}</span>)}
        <span style={{ color: 'var(--muted)' }}>Stan konfiguracji: Ustawienia ▸ Płatności online.</span>
      </div>
    </div>
  )
}
