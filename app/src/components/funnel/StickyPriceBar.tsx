import { useTranslation } from 'react-i18next'
import { computePrice, formatZl, DEFAULT_PRICING } from '@icpe/shared'
import type { StepperState } from '../../pages/PublicFunnel'

interface Props {
  state: StepperState
  onNext: () => void
  disabled?: boolean
}

export default function StickyPriceBar({ state, onNext, disabled }: Props) {
  const { t } = useTranslation()

  const priceResult = computePrice(
    {
      participants: state.participants.map((p) => ({
        type: p.type,
        age: p.age,
      })),
      roomId: state.roomId || DEFAULT_PRICING.rooms[0].id,
      options: {
        transport: state.options.transport,
        bedding: state.options.bedding,
      },
      discountCode: state.discountApplied ? state.discountCode : '',
    },
    DEFAULT_PRICING,
  )

  const isLastStep = state.step === 4
  const label = isLastStep ? t('stepper.to_payment') : t('stepper.next')

  return (
    <div
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full z-30"
      style={{
        maxWidth: 452,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        padding: '12px 16px',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Price display */}
        <div className="flex flex-col gap-0.5">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {t('stepper.total')}
          </span>
          <span
            className="font-serif font-semibold leading-none"
            style={{ fontSize: 23, color: 'var(--ink)' }}
          >
            {formatZl(priceResult.total)}
          </span>
        </div>

        {/* Next button */}
        <button
          onClick={onNext}
          disabled={disabled}
          className="text-white text-sm font-semibold rounded-[14px] transition-all duration-150 active:scale-[0.98] hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none shrink-0"
          style={{
            background: 'var(--accent)',
            padding: '12px 20px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {label}
        </button>
      </div>
    </div>
  )
}
