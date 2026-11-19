import { useTranslation } from 'react-i18next'
import { Users } from 'lucide-react'
import { formatMoney, leaderDepositSplit } from '@icpe/shared'

/**
 * Zaliczka u lidera wspólnoty (metoda LEADER_DEPOSIT): ile przekazać liderowi,
 * ile mieć gotówką przy rejestracji. Ekran sukcesu, strona zgłoszenia; te same kwoty idą w mailu.
 */
export default function LeaderDepositBox({
  total,
  currency,
  pct,
}: {
  total: number
  currency?: 'PLN' | 'EUR' | 'USD'
  pct?: number
}) {
  const { t, i18n } = useTranslation()
  if (!(total > 0)) return null
  const s = leaderDepositSplit(total, { leaderDepositPct: pct })
  const money = (n: number) => formatMoney(n, currency, i18n.language)
  return (
    <div
      className="w-full rounded-[15px] px-4 py-4 flex items-start gap-3"
      style={{ background: 'var(--warn-soft)', border: '1.5px solid var(--warn)' }}
      role="note"
    >
      <Users size={22} style={{ color: 'var(--warn)', flexShrink: 0, marginTop: 2 }} />
      <div className="flex flex-col gap-2 w-full">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--warn)' }}>
            {t('leader.deposit_title', { pct: s.pct })}
          </span>
          <span className="font-serif" style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.15 }}>
            {money(s.deposit)}
          </span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>{t('leader.deposit_desc')}</span>
        </div>
        <div className="flex flex-col pt-2" style={{ borderTop: '1px dashed var(--warn)' }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--warn)' }}>
            {t('leader.rest_title')}
          </span>
          <span className="font-serif" style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.15 }}>
            {money(s.rest)}
          </span>
          <span className="text-xs" style={{ color: 'var(--muted)' }}>{t('leader.rest_desc')}</span>
        </div>
      </div>
    </div>
  )
}
