import { useTranslation } from 'react-i18next'
import { Banknote } from 'lucide-react'
import { formatMoney } from '@icpe/shared'

/**
 * Kwota do przygotowania gotówką na rejestrację (płatność gotówką na miejscu).
 * Wyświetlana na ekranie sukcesu i na stronie zgłoszenia gościa; ta sama kwota idzie w mailu.
 */
export default function CashAmountBox({ total, currency }: { total: number; currency?: 'PLN' | 'EUR' | 'USD' }) {
  const { t, i18n } = useTranslation()
  if (!(total > 0)) return null
  return (
    <div
      className="w-full rounded-[15px] px-4 py-4 flex items-start gap-3"
      style={{ background: 'var(--warn-soft)', border: '1.5px solid var(--warn)' }}
      role="note"
    >
      <Banknote size={22} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 2 }} />
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--warn)' }}>
          {t('cash.title')}
        </span>
        <span className="font-serif" style={{ fontSize: 28, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.1 }}>
          {formatMoney(total, currency, i18n.language)}
        </span>
        <span className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
          {t('cash.desc')}
        </span>
      </div>
    </div>
  )
}
