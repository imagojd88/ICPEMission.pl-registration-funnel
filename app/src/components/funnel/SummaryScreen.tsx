import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { computePrice, formatZl, DEFAULT_PRICING, buildIcs, googleCalendarUrl } from '@icpe/shared'
import type { EventInstanceDto } from '@icpe/shared'
import type { StepperState } from '../../pages/PublicFunnel'

interface Props {
  state: StepperState
  event: EventInstanceDto
  onSubmit: () => void
  onEdit: (step: number) => void
  onBack: () => void
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      onClick={copy}
      className="text-xs font-medium px-2.5 py-1 rounded-[8px] transition-all duration-150"
      style={{
        background: copied ? 'var(--ok-soft)' : 'var(--surface-2)',
        color: copied ? 'var(--ok)' : 'var(--muted)',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {copied ? t('summary.copied') : t('summary.copy')}
    </button>
  )
}

export default function SummaryScreen({ state, event, onSubmit, onEdit, onBack }: Props) {
  const { t } = useTranslation()

  const price = computePrice(
    {
      participants: state.participants.map((p) => ({ type: p.type, age: p.age })),
      roomId: state.roomId || DEFAULT_PRICING.rooms[0].id,
      options: { transport: state.options.transport, bedding: state.options.bedding },
      discountCode: state.discountApplied ? state.discountCode : '',
    },
    DEFAULT_PRICING,
  )

  const selectedRoom = DEFAULT_PRICING.rooms.find((r) => r.id === state.roomId) ?? DEFAULT_PRICING.rooms[0]

  const isOnline = state.paymentMethod === 'online'

  // Calendar helpers
  const calInput = {
    uid: `dzien-formacji-2026@icpe.pl`,
    title: typeof event.title === 'string' ? event.title : 'Dzień Formacji 2026',
    startsAt: new Date(event.startsAt),
    endsAt: new Date(event.endsAt),
    location: event.location,
    details: typeof event.description === 'string' ? event.description : undefined,
  }

  const handleIcsDownload = () => {
    const ics = buildIcs(calInput)
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'dzien-formacji-2026.ics'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div
        className="flex items-center px-4 py-3 sticky top-0 z-20"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
      >
        <button
          onClick={onBack}
          className="text-sm font-medium transition-colors hover:opacity-70"
          style={{ color: 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {t('nav.back')}
        </button>
      </div>

      <div className="flex flex-col gap-5 px-[22px] py-6 pb-10">
        {/* Supertitle + title */}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
            {t('summary.supertitle')}
          </p>
          <h2 className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>
            {t('summary.title')}
          </h2>
        </div>

        {/* Event chip */}
        <div
          className="inline-flex items-center gap-2 px-3 py-2 rounded-[10px] self-start"
          style={{ background: 'var(--brand-soft)', border: '1px solid var(--brand)' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--brand)' }}>
            📅 {typeof event.title === 'string' ? event.title : 'Dzień Formacji 2026'}
          </span>
        </div>

        {/* Participants */}
        <div
          className="rounded-[15px] overflow-hidden"
          style={{ border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--surface-2)' }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              Uczestnicy
            </span>
            <button
              onClick={() => onEdit(1)}
              className="text-xs font-semibold"
              style={{ color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {t('summary.edit')}
            </button>
          </div>
          {state.participants.map((p, i) => {
            const line = price.lines[i]
            return (
              <div
                key={p.id}
                className="flex items-center justify-between px-4 py-3"
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    {p.name || (p.type === 'adult' ? 'Dorosły' : 'Dziecko')}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {p.type === 'adult' ? 'Dorosły' : `Dziecko · ${p.age} lat`}
                  </span>
                </div>
                <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {formatZl(line?.total ?? 0)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Room */}
        <div
          className="flex items-center justify-between rounded-[12px] px-4 py-3"
          style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              {t('room.title')}
            </span>
            <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              {selectedRoom.name}
            </span>
          </div>
          <button
            onClick={() => onEdit(3)}
            className="text-xs font-semibold"
            style={{ color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {t('summary.change')}
          </button>
        </div>

        {/* Price breakdown */}
        <div
          className="rounded-[15px] overflow-hidden"
          style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
        >
          <div className="flex flex-col divide-y" style={{ borderColor: 'var(--border)' }}>
            {/* Participants fee */}
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                {t('summary.participants_fee')}
              </span>
              <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {formatZl(price.participants)}
              </span>
            </div>

            {/* Accommodation */}
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                {t('summary.accommodation')}
              </span>
              <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {formatZl(price.accommodation)}
              </span>
            </div>

            {/* Options */}
            {price.options > 0 && (
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>
                  {t('summary.extras')}
                </span>
                <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {formatZl(price.options)}
                </span>
              </div>
            )}

            {/* Discount */}
            {price.discount > 0 && (
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm" style={{ color: 'var(--ok)' }}>
                  {t('summary.discount')}
                </span>
                <span className="text-sm font-semibold" style={{ color: 'var(--ok)' }}>
                  −{formatZl(price.discount)}
                </span>
              </div>
            )}

            {/* Dashed separator */}
            <div className="px-4 py-2">
              <div style={{ borderTop: '1.5px dashed var(--border-2)' }} />
            </div>

            {/* Total */}
            <div className="flex justify-between items-center px-4 py-4">
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {t('summary.total')}
              </span>
              <span
                className="font-serif font-bold"
                style={{ fontSize: 29, color: 'var(--brand)' }}
              >
                {formatZl(price.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment block */}
        {isOnline ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={onSubmit}
              className="w-full text-white text-sm font-semibold rounded-[16px] py-4 transition-all duration-150 active:scale-[0.98] hover:opacity-90"
              style={{
                background: 'var(--accent)',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(197,106,58,0.30)',
              }}
            >
              {t('summary.pay_now', { amount: formatZl(price.total) })}
            </button>
            <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
              {t('summary.payment_secure')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Transfer card */}
            <div
              className="rounded-[15px] p-4 flex flex-col gap-3"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {t('summary.transfer_title')}
              </h3>

              {/* Recipient */}
              <div className="flex flex-col gap-0.5">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {t('summary.recipient')}
                </span>
                <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  ICPE Mission Polska
                </span>
              </div>

              {/* Account number */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {t('summary.account')}
                  </span>
                  <span
                    className="text-sm font-medium font-mono truncate"
                    style={{ color: 'var(--ink)' }}
                  >
                    PL 12 1234 5678 9012 3456 7890 1234
                  </span>
                </div>
                <CopyButton text="PL12123456789012345678901234" />
              </div>

              {/* Reference */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {t('summary.ref_title')}
                  </span>
                  <span
                    className="text-sm font-semibold font-mono"
                    style={{ color: 'var(--accent-2, var(--accent))' }}
                  >
                    REG-2026-0148
                  </span>
                </div>
                <CopyButton text="REG-2026-0148" />
              </div>

              {/* Amount */}
              <div className="flex flex-col gap-0.5">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {t('summary.amount_label')}
                </span>
                <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {formatZl(price.total)}
                </span>
              </div>

              {/* Deadline */}
              <div className="flex flex-col gap-0.5">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {t('summary.deadline')}
                </span>
                <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  do 12 sierpnia 2026
                </span>
              </div>
            </div>

            {/* Submit transfer button */}
            <button
              onClick={onSubmit}
              className="w-full text-white text-sm font-semibold rounded-[16px] py-4 transition-all duration-150 active:scale-[0.98] hover:opacity-90"
              style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
            >
              {t('summary.submit_transfer')}
            </button>
          </div>
        )}

        {/* Calendar buttons */}
        <div className="flex gap-2">
          <a
            href={googleCalendarUrl(calInput)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-sm font-semibold text-center rounded-[12px] py-3 transition-all duration-150 active:scale-[0.97] hover:opacity-80"
            style={{
              border: '1.5px solid var(--border)',
              color: 'var(--ink)',
              background: 'var(--surface)',
              textDecoration: 'none',
            }}
          >
            📆 {t('summary.add_google')}
          </a>
          <button
            onClick={handleIcsDownload}
            className="flex-1 text-sm font-semibold rounded-[12px] py-3 transition-all duration-150 active:scale-[0.97] hover:opacity-80"
            style={{
              border: '1.5px solid var(--border)',
              color: 'var(--ink)',
              background: 'var(--surface)',
              cursor: 'pointer',
            }}
          >
            ⬇ {t('summary.download_ics')}
          </button>
        </div>

        {/* Manage registration */}
        <div
          className="rounded-[15px] p-4 flex flex-col gap-2"
          style={{ border: '1.5px dashed var(--border-2)', background: 'var(--surface)' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {t('summary.manage_title')}
          </p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            {t('summary.manage_desc')}
          </p>
          <button
            className="self-start mt-1 text-sm font-semibold px-4 py-2 rounded-[10px] transition-all duration-150 active:scale-[0.97]"
            style={{ background: 'var(--brand)', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            {t('summary.manage_cta')}
          </button>
        </div>
      </div>
    </div>
  )
}
