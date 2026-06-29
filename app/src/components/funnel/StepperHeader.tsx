import { useTranslation } from 'react-i18next'

interface Props {
  step: number
  totalSteps: number
  onBack: () => void
}

const TOTAL = 5

export default function StepperHeader({ step, totalSteps = TOTAL, onBack }: Props) {
  const { t } = useTranslation()

  return (
    <div
      className="sticky top-0 z-20"
      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onBack}
          className="text-sm font-medium transition-colors duration-150 hover:opacity-70"
          style={{ color: 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {t('nav.back')}
        </button>
        <span className="text-sm" style={{ color: 'var(--muted)' }}>
          {t('nav.step', { n: step + 1, total: totalSteps })}
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex gap-1 px-4 pb-3">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-full transition-all duration-[350ms] ease-in-out"
            style={{
              height: 5,
              background: i <= step ? 'var(--brand)' : 'var(--surface-3)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
