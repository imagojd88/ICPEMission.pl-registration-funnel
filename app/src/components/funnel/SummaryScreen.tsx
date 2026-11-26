import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { computePrice, formatMoney, roomLabel, buildIcs, googleCalendarUrl, hasAccommodation, leaderDepositSplit, buildSchedule, minDepositPctFor, warsawDate, eventAddons, visibleAddonSelection, addonLines } from '@icpe/shared'
import type { EventInstanceDto, PricingConfig, PriceLine } from '@icpe/shared'
import type { StepperState } from '../../pages/PublicFunnel'
import { bcp47 } from '../../lib/utils'
import { pickLang, type BankInfo } from '../../lib/api'
import { dietLabel } from '../../lib/diets'
import { funnelPriceInput, isAccommodationOptional } from '../../lib/funnelPrice'

interface Props {
  state: StepperState
  event: EventInstanceDto
  pricingConfig: PricingConfig
  onSubmit: () => void | Promise<void>
  onEdit: (step: number) => void
  onBack: () => void
  submitting?: boolean
  submitError?: string | null
  bankInfo?: BankInfo
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
  // Tytuł eventu w języku strony (mapa {pl,en,it} albo zwykły tekst).
  const eventTitle = pickLang(event.title as string | Record<string, string>, i18n.language)
  const free = !!pricingConfig.free
  const transferDeadline = (() => {
    try {
      return new Date(event.startsAt).toLocaleDateString(bcp47(i18n.language), { day: 'numeric', month: 'long', year: 'numeric' })
    } catch {
      return ''
    }
  })()

  // Dodatki z limitem — tylko te widoczne dla tego składu osób (tak samo liczy lejek i API).
  const addonDefs = eventAddons(pricingConfig)
  const chosenAddons = visibleAddonSelection(state.options.addons, addonDefs, state.participants)
  const addonRows = addonLines(addonDefs, chosenAddons, i18n.language)
  const { input: priceInput, owners } = funnelPriceInput(
    state.participants,
    state.rooms,
    pricingConfig,
    { transport: state.options.transport, bedding: state.options.bedding, donation: state.options.donation, addons: chosenAddons },
    state.discountApplied ? state.discountCode : '',
  )

  const price = computePrice(priceInput, pricingConfig)
  // Harmonogram wpłat (zadatek + raty z terminami) — gdy event go ma.
  const schedule = free
    ? []
    : buildSchedule(price.total, pricingConfig.paymentPlan, warsawDate(), minDepositPctFor(pricingConfig.rooms, state.rooms.map((r) => r.roomId)))
  const scheduleDate = (d: string) => {
    const [y, m, day] = d.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, day, 12)).toLocaleDateString(bcp47(i18n.language), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  }
  const offersRooms = hasAccommodation(pricingConfig)
  const optionalRooms = isAccommodationOptional(pricingConfig)

  /** participantIndex → PriceLine (kolejność linii: osoby w pokojach, potem osoby bez noclegu). */
  const participantLineMap = new Map<number, PriceLine>()
  owners.forEach((pIdx, li) => {
    const line = price.lines[li]
    if (line) participantLineMap.set(pIdx, line)
  })
  /** Osoby bez noclegu (nocleg opcjonalny, częściowe przypisanie albo „Nie potrzebuję noclegu"). */
  const assignedSet = new Set(state.rooms.flatMap((r) => r.participantIndexes))
  const withoutRoomNames = optionalRooms
    ? state.participants
        .map((p, i) => ({ p, i }))
        .filter(({ i }) => !assignedSet.has(i))
        .map(({ p }) => p.name.trim() || (p.type === 'adult' ? t('participants.adult') : t('participants.child')))
    : []

  const isOnline = state.paymentMethod === 'online'
  const isCash = state.paymentMethod === 'cash'
  const isLeader = state.paymentMethod === 'leader'
  const leaderSplit = leaderDepositSplit(price.total, pricingConfig)

  // Calendar helpers
  const calInput = {
    uid: `dzien-formacji-2026@icpe.pl`,
    title: eventTitle,
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
            {eventTitle}
          </span>
        </div>

        {/* Uczestnicy */}
        <div
          className="rounded-[15px] overflow-hidden"
          style={{ border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--surface-2)' }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              {t('stepper.step1')}
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
                      {p.name || (p.type === 'adult' ? t('participants.adult') : t('participants.child'))}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {p.type === 'adult' ? t('participants.adult') : `${t('participants.child')} · ${p.age} ${t('participants.age_suffix')}`}
                    </span>
                    {((p.dietKeys ?? []).length > 0 || p.diet.trim()) && (
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        {t('summary.diet')}: {[...(p.dietKeys ?? []).map((k) => dietLabel(k, i18n.language)), p.diet.trim()].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {money(line?.total ?? 0)}
                  </span>
                </div>
                {/* Rozbicie ceny per osoba wg PriceLine */}
                {line && line.total > 0 && (
                  <div className="flex gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {t('summary.line_formation')}: {money(line.formation)}
                    </span>
                    {line.roomId === '' ? (
                      // Event w ogóle bez noclegu → nic nie dopisujemy („bez noclegu” ma sens tylko, gdy nocleg jest do wyboru).
                      (offersRooms || optionalRooms) && (
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        {t('room.no_accommodation_short')}
                      </span>
                      )
                    ) : (
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        {t('summary.line_accommodation')}: {money(line.accommodation)}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                      {t('summary.line_meals')}: {money(line.meals)}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Pokoje (albo „bez noclegu" przy noclegu opcjonalnym) */}
        {(state.rooms.length > 0 || optionalRooms) && offersRooms && (
          <div
            className="rounded-[15px] overflow-hidden"
            style={{ border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ background: 'var(--surface-2)' }}>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
                {optionalRooms ? t('room.title_optional') : t('room.title')}
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
                  return p.name.trim() || (p.type === 'adult' ? t('participants.adult') : t('participants.child'))
                })
              return (
                <div
                  key={room.uid}
                  className="flex flex-col gap-0.5 px-4 py-3"
                  style={{ borderTop: ri === 0 ? 'none' : '1px solid var(--border)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                      {t('summary.room_n', { n: ri + 1 })}: {roomType ? roomLabel(roomType.name, i18n.language) : room.roomId}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>
                      {roomType ? `${money(roomType.perPerson)} ${roomType.priceUnit === 'room' ? t('room.per_room_night') : t('room.per_person_night')}` : ''}
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
            {withoutRoomNames.length > 0 && (
              <div
                className="flex flex-col gap-0.5 px-4 py-3"
                style={{ borderTop: state.rooms.length === 0 ? 'none' : '1px solid var(--border)' }}
              >
                <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {t('room.no_accommodation_short')}
                </span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {withoutRoomNames.join(', ')}
                </span>
              </div>
            )}
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
                {t('summary.formation_fee')}
              </span>
              <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {money(price.formation)}
              </span>
            </div>

            {/* Accommodation (ukryte, gdy nikt nie nocuje przy noclegu opcjonalnym) */}
            {!(optionalRooms && price.accommodation === 0) && (offersRooms || price.accommodation > 0) && (
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                {t('summary.accommodation')}
              </span>
              <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {money(price.accommodation)}
              </span>
            </div>
            )}

            {/* Meals */}
            <div className="flex justify-between items-center px-4 py-3">
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                {t('summary.meals')}
              </span>
              <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {money(price.meals)}
              </span>
            </div>

            {/* Dodatki z limitem (np. dostawka) — nazwy i liczba sztuk; cena (gdy jest) wchodzi w „Opcje dodatkowe” */}
            {addonRows.length > 0 && (
              <div className="flex justify-between items-start gap-3 px-4 py-3">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>
                  {t('summary.addons')}
                </span>
                <span className="text-sm font-medium text-right" style={{ color: 'var(--ink)' }}>
                  {addonRows.map((a) => (
                    <span key={a.id} className="block">
                      {a.name}{a.qty > 1 ? ` × ${a.qty}` : ''}{a.price > 0 ? ` · ${money(a.price)}` : ` · ${t('options.addon_free')}`}
                    </span>
                  ))}
                  <button
                    onClick={() => onEdit(4)}
                    className="text-xs font-semibold mt-1"
                    style={{ color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    {t('summary.change')}
                  </button>
                </span>
              </div>
            )}

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

            {/* Darowizna (dobrowolna, poza rabatami) */}
            {(price.donation ?? 0) > 0 && (
              <div className="flex justify-between items-center px-4 py-3">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>
                  {t('summary.donation')}
                </span>
                <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {money(price.donation ?? 0)}
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

        {/* Harmonogram wpłat */}
        {schedule.length > 0 && (
          <div className="rounded-[15px] px-4 py-3 flex flex-col gap-2" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t('summary.schedule_title')}</p>
            {schedule.map((it, i) => (
              <div key={it.id} className="flex justify-between items-baseline gap-3">
                <span className="text-sm" style={{ color: 'var(--muted)' }}>
                  {it.label ? `${it.label} · ` : ''}{it.atRegistration ? t('summary.schedule_now') : t('summary.schedule_by', { date: scheduleDate(it.dueDate) })}
                </span>
                <span className="text-sm font-semibold whitespace-nowrap" style={{ color: i === 0 ? 'var(--brand)' : 'var(--ink)' }}>{money(it.amount)}</span>
              </div>
            ))}
            <p className="text-xs" style={{ color: 'var(--muted)' }}>{t('summary.schedule_note')}</p>
          </div>
        )}

        {/* Bezpłatne — bez kosztów */}
        {free && (
          <div
            className="rounded-[15px] px-4 py-4 text-center"
            style={{ border: '1px solid var(--ok)', background: 'var(--ok-soft)' }}
          >
            <p className="text-sm font-semibold" style={{ color: 'var(--ok)' }}>{t('summary.free_title')}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{t('summary.free_desc')}</p>
          </div>
        )}

        {/* Błąd zapisu */}
        {submitError && (
          <div
            className="px-4 py-3 rounded-[12px] text-sm"
            style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}
          >
            {submitError}
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
            {submitting ? t('summary.sending') : t('summary.submit_free')}
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
              {t('summary.pay_now', { amount: money(schedule.length > 1 ? schedule[0].amount : price.total) })}
            </button>
            <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
              {t('summary.payment_secure')}
            </p>
          </div>
        ) : isLeader ? (
          <div className="flex flex-col gap-4">
            {/* Zaliczka u lidera wspólnoty + reszta gotówką */}
            <div
              className="rounded-[15px] p-4 flex flex-col gap-3"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {t('summary.leader_title')}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
                {t('summary.leader_desc', { deposit: money(leaderSplit.deposit), rest: money(leaderSplit.rest), pct: leaderSplit.pct })}
              </p>
            </div>
            <button
              onClick={onSubmit}
              disabled={submitting}
              className="w-full text-white text-sm font-semibold rounded-[16px] py-4 transition-all duration-150 active:scale-[0.98] hover:opacity-90"
              style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
            >
              {t('summary.submit_leader')}
            </button>
          </div>
        ) : isCash ? (
          <div className="flex flex-col gap-4">
            {/* Cash card */}
            <div
              className="rounded-[15px] p-4 flex flex-col gap-3"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {t('summary.cash_title')}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
                {t('summary.cash_desc_1')} <span className="font-semibold" style={{ color: 'var(--ink)' }}>{money(price.total)}</span> {t('summary.cash_desc_2')}
              </p>
            </div>

            <button
              onClick={onSubmit}
              disabled={submitting}
              className="w-full text-white text-sm font-semibold rounded-[16px] py-4 transition-all duration-150 active:scale-[0.98] hover:opacity-90"
              style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
            >
              {t('summary.submit_cash')}
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

              {/* Przelewy z zagranicy: SWIFT, bank, adres banku — tylko poza wersją polską i tylko wypełnione */}
              {!i18n.language.startsWith('pl') &&
                ([
                  ['summary.swift', bankInfo?.swift, true],
                  ['summary.bank', bankInfo?.bankName, false],
                  ['summary.bank_address', bankInfo?.bankAddress, false],
                ] as Array<[string, string | undefined, boolean]>)
                  .filter(([, v]) => !!v?.trim())
                  .map(([key, v, mono]) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>{t(key)}</span>
                        <span className={`text-sm font-medium${mono ? ' font-mono' : ''}`} style={{ color: 'var(--ink)' }}>{v}</span>
                      </div>
                      {mono && <CopyButton text={(v ?? '').replace(/\s/g, '')} />}
                    </div>
                  ))}

              <div className="flex flex-col gap-0.5">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {t('summary.ref_title')}
                </span>
                <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {t('summary.ref_value')}
                </span>
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {schedule.length > 1 ? t('success.pay_now') : t('summary.amount_label')}
                </span>
                <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {money(schedule.length > 1 ? schedule[0].amount : price.total)}
                </span>
              </div>

              {transferDeadline && schedule.length <= 1 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {t('summary.deadline')}
                  </span>
                  <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    do {transferDeadline}
                  </span>
                </div>
              )}

              {/* Podmiot obsługujący wydarzenie — zdanie opcjonalne (gdy wpisany w ustawieniach eventu) */}
              {bankInfo?.operator?.trim() && (
                <p className="text-xs pt-1" style={{ color: 'var(--muted)', borderTop: '1px solid var(--border-2)' }}>
                  {t('summary.operator_note', { name: bankInfo.operator.trim() })}
                </p>
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
