import { useTranslation } from 'react-i18next'
import { computePrice, formatMoney } from '@icpe/shared'
import type { PricingConfig } from '@icpe/shared'
import type { StepperState } from '../../pages/PublicFunnel'
import { funnelPriceInput } from '../../lib/funnelPrice'

interface Props {
  state: StepperState
  pricingConfig: PricingConfig
  onNext: () => void
  disabled?: boolean
  /** Napis przycisku w ostatnim kroku (ustala PublicFunnel). */
  lastStepLabel?: string
}

export default function StickyPriceBar({ state, pricingConfig, onNext, disabled, lastStepLabel }: Props) {
  const { t, i18n } = useTranslation()
  const money = (n: number) => formatMoney(n, pricingConfig.currency, i18n.language)

  const { input } = funnelPriceInput(
    state.participants,
    state.rooms,
    pricingConfig,
    { transport: state.options.transport, bedding: state.options.bedding },
    state.discountApplied ? state.discountCode : '',
  )
  const priceResult = computePrice(input, pricingConfig)

  const free = !!pricingConfig.free
  const isLastStep = state.step === 4
  const label = isLastStep ? lastStepLabel ?? (free ? t('stepper.to_summary') : t('stepper.to_payment')) : t('stepper.next')

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
            {free ? t('summary.free_short') : money(priceResult.total)}
          </span>
          {hasPrice && (
            <span className="text-xs leading-none mt-0.5" style={{ color: 'var(--muted)' }}>
              {money(priceResult.formation)} {t('summary.abbr_formation')}
              {priceResult.accommodation > 0 || !pricingConfig.accommodationOptional
                ? ` + ${money(priceResult.accommodation)} ${t('summary.abbr_accommodation')}`
                : ''}{' '}
              + {money(priceResult.meals)} {t('summary.abbr_meals')}
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
