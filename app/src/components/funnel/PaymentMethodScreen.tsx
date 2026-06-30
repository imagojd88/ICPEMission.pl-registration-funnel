import { CreditCard, Landmark, Banknote } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PaymentMethod } from '@icpe/shared'

interface Props {
  selected: 'online' | 'transfer' | 'cash' | null
  onSelect: (method: 'online' | 'transfer' | 'cash') => void
  onContinue: () => void
  onBack: () => void
  availableMethods?: PaymentMethod[]
}

interface CardProps {
  id: 'online' | 'transfer' | 'cash'
  icon: typeof CreditCard
  title: string
  tags: string
  selected: boolean
  onSelect: () => void
}

function PaymentCard({ icon: Icon, title, tags, selected, onSelect }: CardProps) {
  return (
    <button
      onClick={onSelect}
      className="flex flex-col gap-3 rounded-[15px] p-5 text-left w-full transition-all duration-150 active:scale-[0.99]"
      style={{
        border: selected ? '2px solid var(--brand)' : '1.5px solid var(--border)',
        background: selected ? 'var(--brand-soft)' : 'var(--surface)',
        cursor: 'pointer',
      }}
    >
      {/* Icon */}
      <div
        className="flex items-center justify-center rounded-[12px]"
        style={{
          width: 44,
          height: 44,
          background: selected ? 'var(--brand)' : 'var(--surface-2)',
        }}
      >
        <Icon size={22} style={{ color: selected ? 'white' : 'var(--muted)' }} />
      </div>

      {/* Title */}
      <p
        className="text-sm font-semibold"
        style={{ color: selected ? 'var(--brand)' : 'var(--ink)' }}
      >
        {title}
      </p>

      {/* Tags */}
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        {tags}
      </p>

      {/* Selected indicator */}
      {selected && (
        <div className="flex items-center gap-1.5">
          <div
            className="rounded-full flex items-center justify-center"
            style={{ width: 16, height: 16, background: 'var(--brand)' }}
          >
            <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
              <path
                d="M1 3.5L3.5 6L8 1"
                stroke="white"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-xs font-medium" style={{ color: 'var(--brand)' }}>
            Wybrano
          </span>
        </div>
      )}
    </button>
  )
}

export default function PaymentMethodScreen({ selected, onSelect, onContinue, onBack, availableMethods }: Props) {
  const { t } = useTranslation()

  // Default: show all methods if not specified
  const enabled = availableMethods && availableMethods.length > 0
    ? availableMethods
    : (['ONLINE', 'BANK_TRANSFER'] as PaymentMethod[])

  const showOnline = enabled.includes('ONLINE')
  const showTransfer = enabled.includes('BANK_TRANSFER')
  const showCash = enabled.includes('CASH')

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 sticky top-0 z-20"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        <button
          onClick={onBack}
          className="text-sm font-medium transition-colors duration-150 hover:opacity-70"
          style={{ color: 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {t('nav.back')}
        </button>
      </div>

      {/* Content */}
      <div className="flex flex-col gap-5 px-[22px] py-6">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--ink)' }}>
          {t('payment_method.title')}
        </h2>

        {/* Payment cards — stacked on mobile, can go side-by-side on wider */}
        <div className="flex flex-col gap-3">
          {showOnline && (
            <PaymentCard
              id="online"
              icon={CreditCard}
              title={t('payment_method.online')}
              tags={t('payment_method.online_tags')}
              selected={selected === 'online'}
              onSelect={() => onSelect('online')}
            />
          )}
          {showTransfer && (
            <PaymentCard
              id="transfer"
              icon={Landmark}
              title={t('payment_method.transfer')}
              tags={t('payment_method.transfer_tags')}
              selected={selected === 'transfer'}
              onSelect={() => onSelect('transfer')}
            />
          )}
          {showCash && (
            <PaymentCard
              id="cash"
              icon={Banknote}
              title={t('payment_method.cash', 'Gotówka na miejscu')}
              tags={t('payment_method.cash_tags', 'Zapłać gotówką w dniu przyjazdu')}
              selected={selected === 'cash'}
              onSelect={() => onSelect('cash')}
            />
          )}
        </div>

        {/* CTA */}
        <button
          onClick={onContinue}
          disabled={!selected}
          className="w-full text-white text-sm font-semibold rounded-[16px] py-4 transition-all duration-150 active:scale-[0.98] hover:opacity-90 disabled:opacity-40 disabled:pointer-events-none"
          style={{
            background: 'var(--accent)',
            border: 'none',
            cursor: selected ? 'pointer' : 'default',
            marginTop: 4,
          }}
        >
          {t('payment_method.cta')}
        </button>
      </div>
    </div>
  )
}
