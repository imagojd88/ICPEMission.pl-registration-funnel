import { useTranslation } from 'react-i18next'
import { formatZl } from '@icpe/shared'

interface Props {
  paymentMethod: 'online' | 'transfer' | null
  email: string
  total: number
  onBack: () => void
}

export default function SuccessScreen({ paymentMethod, email, total, onBack }: Props) {
  const { t } = useTranslation()

  const isPaid = paymentMethod === 'online'
  const regNumber = 'REG-2026-0148'

  return (
    <div
      className="flex flex-col items-center px-[22px] py-10 gap-6 min-h-screen"
      style={{ background: 'var(--bg)' }}
    >
      {/* Check circle */}
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 72,
          height: 72,
          background: 'var(--ok-soft)',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path
            d="M6 16L13 23L26 10"
            stroke="var(--ok)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Title */}
      <h2
        className="font-serif text-center"
        style={{ fontSize: 28, fontWeight: 600, color: 'var(--ink)' }}
      >
        {isPaid ? t('success.paid_title') : t('success.transfer_title')}
      </h2>

      {/* Message */}
      <p className="text-sm text-center leading-relaxed" style={{ color: 'var(--muted)' }}>
        {isPaid ? t('success.paid_msg') : t('success.transfer_msg')}
      </p>

      {/* Registration card */}
      <div
        className="w-full rounded-[15px] p-5 flex flex-col gap-4"
        style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        {/* Reg number */}
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {t('success.reg_number')}
          </span>
          <span
            className="text-sm font-semibold font-mono"
            style={{ color: 'var(--ink)' }}
          >
            {regNumber}
          </span>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {t('success.status')}
          </span>
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={
              isPaid
                ? { background: 'var(--ok-soft)', color: 'var(--ok)' }
                : { background: 'var(--warn-soft)', color: 'var(--warn)' }
            }
          >
            {isPaid ? t('success.status_paid') : t('success.status_pending')}
          </span>
        </div>

        {/* Amount */}
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {t('success.amount')}
          </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {formatZl(total)}
          </span>
        </div>
      </div>

      {/* Email note */}
      <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
        {t('success.email_sent', { email })}
      </p>

      {/* Back button */}
      <button
        onClick={onBack}
        className="text-sm font-semibold px-6 py-3 rounded-[12px] transition-all duration-150 active:scale-[0.98] hover:opacity-80 mt-2"
        style={{
          border: '1.5px solid var(--border)',
          color: 'var(--ink)',
          background: 'var(--surface)',
          cursor: 'pointer',
        }}
      >
        {t('success.back')}
      </button>
    </div>
  )
}
