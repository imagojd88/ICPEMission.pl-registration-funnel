import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus } from 'lucide-react'
import { formatZl } from '@icpe/shared'
import type { RegistrationStatus } from '@icpe/shared'

interface Props {
  paymentMethod: 'online' | 'transfer' | 'cash' | null
  email: string
  total: number
  regNumber?: string
  status?: RegistrationStatus
  onBack: () => void
  onCreateAccount?: () => Promise<void>
}

export default function SuccessScreen({ paymentMethod, email, total, regNumber, status, onBack, onCreateAccount }: Props) {
  const { t } = useTranslation()
  const [acct, setAcct] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  const isPaid = status ? status === 'CONFIRMED' : paymentMethod === 'online'
  const displayReg = regNumber ?? '—'

  async function handleAccount() {
    if (!onCreateAccount || acct === 'loading' || acct === 'done') return
    setAcct('loading')
    try {
      await onCreateAccount()
      setAcct('done')
    } catch {
      setAcct('error')
    }
  }

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
            {displayReg}
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

      {/* Załóż konto (powtórzone z poprzedniego kroku) */}
      {onCreateAccount && (
        <div className="w-full flex flex-col items-center gap-2 mt-1">
          {acct === 'done' ? (
            <p className="text-sm text-center font-medium" style={{ color: 'var(--ok)' }}>
              Konto założone — sprawdź e-mail, aby ustawić dostęp.
            </p>
          ) : (
            <button
              onClick={() => { void handleAccount() }}
              disabled={acct === 'loading'}
              className="w-full text-white text-sm font-semibold rounded-[12px] py-3 transition-all duration-150 active:scale-[0.98] hover:opacity-90 flex items-center justify-center gap-2"
              style={{ background: 'var(--brand)', border: 'none', cursor: 'pointer' }}
            >
              <UserPlus size={16} /> {acct === 'loading' ? 'Zakładam konto…' : 'Załóż konto'}
            </button>
          )}
          {acct === 'error' && (
            <p className="text-xs text-center" style={{ color: 'var(--err)' }}>
              Nie udało się założyć konta. Spróbuj później.
            </p>
          )}
          <p className="text-xs text-center" style={{ color: 'var(--faint)' }}>
            Konto pozwoli zarządzać zgłoszeniem i szybciej zapisać się następnym razem.
          </p>
        </div>
      )}

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
