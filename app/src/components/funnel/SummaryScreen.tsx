import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { computePrice, formatMoney, roomLabel, buildIcs, googleCalendarUrl } from '@icpe/shared'
import type { EventInstanceDto, PricingConfig, PriceLine } from '@icpe/shared'
import type { StepperState } from '../../pages/PublicFunnel'
import { bcp47 } from '../../lib/utils'

interface Props {
  state: StepperState
  event: EventInstanceDto
  pricingConfig: PricingConfig
  onSubmit: () => void | Promise<void>
  onEdit: (step: number) => void
  onBack: () => void
  submitting?: boolean
  submitError?: string | null
  bankInfo?: { recipient?: string; account?: string }
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

export default function SummaryScreen({ state, event, pricingConfig, onSubmit, onEdit, onBack, submitting, submitError, bankInfo }: Props) {
  const { t, i18n } = useTranslation()
  const money = (n: number) => formatMoney(n, pricingConfig.currency, i18n.language)
  const free = !!pricingConfig.free
  const transferDeadline = (() => {
    try {
      return new Date(event.startsAt).toLocaleDateString(bcp47(i18n.language), { day: 'numeric', month: 'long', year: 'numeric' })
    } catch {
      return ''
    }
  })()

  const priceInput = {
    rooms: state.rooms.map((r) => ({
      roomId: r.roomId,
      participants: r.participantIndexes
        .filter((idx) => idx >= 0 && idx < state.participants.length)
        .map((idx) => ({
          type: state.participants[idx].type,
          age: state.participants[idx].age,
        })),
    })),
    options: { transport: state.options.transport, bedding: state.options.bedding },
    discountCode: state.discountApplied ? state.discountCode : '',
  }

  const price = computePrice(priceInput, pricingConfig)

  /**
   * Budujemy mapę: participantIndex → PriceLine
   * Linie są generowane w kolejności pokoi × osób w pokoju (taką samą jak priceInput).
   */
  const participantLineMap = new Map<number, PriceLine>()
  let lineIdx = 0
  for (const room of state.rooms) {
    for (const pIdx of room.participantIndexes) {
      if (pIdx >= 0 && pIdx < state.participants.length) {
        const line = price.lines[lineIdx]
        if (line) participantLineMap.set(pIdx, line)
        lineIdx++
      }
    }
  }

  const isOnline = state.paymentMethod === 'online'
  const isCash = state.paymentMethod === 'cash'

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
            {typeof event.title === 'string' ? event.title : 'Dzień Formacji 2026'}
          </span>
        </div>

        {/* Uczestnicy */}
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
            const line = participantLineMap.get(i)
            return (
              <div
                key={p.id}
                className="flex flex-col px-4 py-3"
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                      {p.name || (p.type === 'adult' ? 'Dorosły' : 'Dziecko')}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {p.type === 'adult' ? 'Dorosły' : `Dziecko · ${p.age} lat`}
                    </span>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {money(line?.total ?? 0)}
                  </span>
                </div>
                {/* Rozbicie ceny per osoba wg PriceLine */}
                {line && line.total > 0 && (
                  <div className="flex gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      Formacja: {money(line.formation)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      Nocleg: {money(line.accommodation)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      Wyżywienie: {money(line.meals)}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Pokoje */}
        {state.rooms.length > 0 && (
          <div
            className="rounded-[15px] overflow-hidden"
            style={{ border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--surface-2)' }}>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                {t('room.title')}
              </span>
              <button
                onClick={() => onEdit(3)}
                className="text-xs font-semibold"
                style={{ color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {t('summary.change')}
              </button>
            </div>
            {state.rooms.map((room, ri) => {
              const roomType = pricingConfig.rooms.find((rt) => rt.id === room.roomId)
              const assignedNames = room.participantIndexes
                .filter((idx) => idx >= 0 && idx < state.participants.length)
                .map((idx) => {
                  const p = state.participants[idx]
                  return p.name.trim() || (p.type === 'adult' ? 'Dorosły' : 'Dziecko')
                })
              return (
                <div
                  key={room.uid}
                  className="flex flex-col gap-0.5 px-4 py-3"
                  style={{ borderTop: ri === 0 ? 'none' : '1px solid var(--border)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                      Pokój {ri + 1}: {roomType ? roomLabel(roomType.name, i18n.language) : room.roomId}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>
                      {roomType ? `${money(roomType.perPerson)}/os/noc` : ''}
                    </span>
                  </div>
                  {assignedNames.length > 0 && (
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {assignedNames.join(', ')}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Price breakdown — ukryte dla wydarzeń bezpłatnych */}
        {!free && (
        <div
          className="rounded-[15px] overflow-hidden"
          style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
        >
          <div className="flex flex-col divide-y" style={{ borderColor: 'var(--border)' }}>
            {/* Formation */}
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                Opłata formacyjna
              </span>
              <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {money(price.formation)}
              </span>
            </div>

            {/* Accommodation */}
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                {t('summary.accommodation')}
              </span>
              <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {money(price.accommodation)}
              </span>
            </div>

            {/* Meals */}
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                Wyżywienie
              </span>
              <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {money(price.meals)}
              </span>
            </div>

            {/* Options */}
            {price.options > 0 && (
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>
                  {t('summary.extras')}
                </span>
                <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {money(price.options)}
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
                  -{money(price.discount)}
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
                {money(price.total)}
              </span>
            </div>
          </div>
        </div>
        )}

        {/* Bezpłatne — bez kosztów */}
        {free && (
          <div
            className="rounded-[15px] px-4 py-4 text-center"
            style={{ border: '1px solid var(--ok)', background: 'var(--ok-soft)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--ok)' }}>Wydarzenie bezpłatne</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Nie pobieramy żadnych opłat.</p>
          </div>
        )}

        {/* Błąd zapisu */}
        {submitError && (
          <div
            className="px-4 py-3 rounded-[12px] text-sm"
            style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}
          >
            Nie udało się zapisać zgłoszenia: {submitError}. Spróbuj ponownie.
          </div>
        )}

        {/* Payment block */}
        {free ? (
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="w-full text-white text-sm font-semibold rounded-[16px] py-4 transition-all duration-150 active:scale-[0.98] hover:opacity-90"
            style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
          >
            {submitting ? 'Wysyłanie…' : 'Wyślij zgłoszenie →'}
          </button>
        ) : isOnline ? (
          <div className="flex flex-col gap-3">
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="w-full text-white text-sm font-semibold rounded-[16px] py-4 transition-all duration-150 active:scale-[0.98] hover:opacity-90"
              style={{
                background: 'var(--accent)',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(197,106,58,0.30)',
              }}
            >
              {t('summary.pay_now', { amount: money(price.total) })}
            </button>
            <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
              {t('summary.payment_secure')}
            </p>
          </div>
        ) : isCash ? (
          <div className="flex flex-col gap-4">
            {/* Cash card */}
            <div
              className="rounded-[15px] p-4 flex flex-col gap-3"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Płatność gotówką na miejscu
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
                Kwotę <span className="font-semibold" style={{ color: 'var(--ink)' }}>{money(price.total)}</span> zapłacisz gotówką przy rejestracji na miejscu. Nie jest wymagana żadna przedpłata online.
              </p>
            </div>

            <button
              onClick={onSubmit}
              disabled={submitting}
              className="w-full text-white text-sm font-semibold rounded-[16px] py-4 transition-all duration-150 active:scale-[0.98] hover:opacity-90"
              style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
            >
              Zgłoszenie z płatnością gotówką →
            </button>
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

              <div className="flex flex-col gap-0.5">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {t('summary.recipient')}
                </span>
                <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {bankInfo?.recipient || 'ICPE Mission Polska'}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {t('summary.account')}
                  </span>
                  <span className="text-sm font-medium font-mono truncate" style={{ color: 'var(--ink)' }}>
                    {bankInfo?.account || '—'}
                  </span>
                </div>
                {bankInfo?.account && <CopyButton text={bankInfo.account.replace(/\s/g, '')} />}
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {t('summary.ref_title')}
                </span>
                <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  Numer zgłoszenia (otrzymasz po wysłaniu i w e-mailu)
                </span>
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {t('summary.amount_label')}
                </span>
                <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {money(price.total)}
                </span>
              </div>

              {transferDeadline && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {t('summary.deadline')}
                  </span>
                  <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    do {transferDeadline}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={onSubmit}
              disabled={submitting}
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
            {t('summary.add_google')}
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
            {t('summary.download_ics')}
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
