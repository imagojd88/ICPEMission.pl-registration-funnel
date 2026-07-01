import { useTranslation } from 'react-i18next'
import { computePrice, formatMoney } from '@icpe/shared'
import type { PricingConfig } from '@icpe/shared'
import type { StepperState } from '../../pages/PublicFunnel'

interface Props {
  state: StepperState
  pricingConfig: PricingConfig
  onNext: () => void
  disabled?: boolean
}

export default function StickyPriceBar({ state, pricingConfig, onNext, disabled }: Props) {
  const { t, i18n } = useTranslation()
  const money = (n: number) => formatMoney(n, pricingConfig.currency, i18n.language)

  const priceResult = computePrice(
    {
      rooms: state.rooms.map((r) => ({
        roomId: r.roomId,
        participants: r.participantIndexes
          .filter((idx) => idx >= 0 && idx < state.participants.length)
          .map((idx) => ({
            type: state.participants[idx].type,
            age: state.participants[idx].age,
          })),
      })),
      options: {
        transport: state.options.transport,
        bedding: state.options.bedding,
      },
      discountCode: state.discountApplied ? state.discountCode : '',
    },
    pricingConfig,
  )

  const free = !!pricingConfig.free
  const isLastStep = state.step === 4
  const label = isLastStep ? (free ? t('stepper.next') : t('stepper.to_payment')) : t('stepper.next')

  // Dodatkowe info: formacja + nocleg + wyżywienie
  const hasPrice = !free && priceResult.people > 0

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
            {free ? 'Bezpłatne' : money(priceResult.total)}
          </span>
          {hasPrice && (
            <span className="text-xs leading-none mt-0.5" style={{ color: 'var(--muted)' }}>
              {money(priceResult.formation)} form. + {money(priceResult.accommodation)} nocl. + {money(priceResult.meals)} wyż.
            </span>
          )}
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
