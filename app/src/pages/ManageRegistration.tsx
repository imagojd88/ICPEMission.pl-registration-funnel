import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { Calendar, MapPin } from 'lucide-react'
import { computePrice, formatMoney, roomLabel, roomStockShortages } from '@icpe/shared'
import { getManagedRegistration, pickLang, updateManagedAccommodation, type ManagedRegistration } from '../lib/api'
import { funnelPriceInput, isAccommodationOptional } from '../lib/funnelPrice'
import { formatDateRange } from '../lib/utils'
import { setAnalyticsContext, track } from '../lib/analytics'
import Spinner from '../components/ui/Spinner'
import ThemeToggle from '../components/ui/ThemeToggle'
import LanguageSwitch from '../components/ui/LanguageSwitch'
import Step3Room from '../components/funnel/steps/Step3Room'
import CashAmountBox from '../components/funnel/CashAmountBox'
import LeaderDepositBox from '../components/funnel/LeaderDepositBox'
import type { Participant, RoomEntry } from './PublicFunnel'

let uid = 0
const toEntries = (rooms: ManagedRegistration['rooms']): RoomEntry[] =>
  rooms.map((r) => ({ uid: `z-${++uid}`, roomId: r.roomId, participantIndexes: [...r.participantIndexes] }))

/** Kanoniczna postać składu pokoi (do porównania „czy coś się zmieniło"). */
function canon(rooms: Array<{ roomId: string; participantIndexes: number[] }>): string {
  return JSON.stringify(
    rooms
      .filter((r) => r.participantIndexes.length > 0)
      .map((r) => ({ roomId: r.roomId, p: [...r.participantIndexes].sort((a, b) => a - b) }))
      .sort((a, b) => (a.roomId + a.p.join()).localeCompare(b.roomId + b.p.join())),
  )
}

/**
 * Strona zgłoszenia gościa (`/z/:token`, link z maila z potwierdzeniem).
 * Pokazuje zgłoszenie i pozwala zmienić / domówić nocleg. Cena przeliczana na żywo,
 * zapis przelicza ją ponownie na serwerze i wysyła mail z nową kwotą (przy gotówce:
 * kwota do przygotowania na rejestrację).
 */
export default function ManageRegistration() {
  const { token } = useParams<{ token: string }>()
  const { t, i18n } = useTranslation()
  const lng = i18n.language
  const [reg, setReg] = useState<ManagedRegistration | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [rooms, setRooms] = useState<RoomEntry[]>([])
  const [noAcc, setNoAcc] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const apply = (r: ManagedRegistration) => {
    setReg(r)
    setRooms(toEntries(r.rooms))
    setNoAcc(r.rooms.length === 0)
  }

  useEffect(() => {
    if (!token) return
    getManagedRegistration(token)
      .then((r) => {
        apply(r)
        if (r.event.slug) setAnalyticsContext({ event_slug: r.event.slug })
        track('manage_registration_viewed', { lock: r.lock ?? 'none', rooms: r.rooms.length, payment_method: r.paymentMethod ?? null })
      })
      .catch(() => setLoadError(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    if (!reg) return
    document.title = `${t('manage.tab_title')} — ${pickLang(reg.event.title, lng)}`
  }, [reg, lng, t])

  const participants: Participant[] = useMemo(
    () =>
      (reg?.participants ?? []).map((p, i) => ({
        id: `p-${i}`, type: p.type, name: p.name, age: p.age, gender: 'M', diet: '',
      })),
    [reg],
  )

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
        <ThemeToggle />
        <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('manage.not_found')}</p>
      </div>
    )
  }
  if (!reg || !reg.pricing) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <ThemeToggle />
        <Spinner size="lg" />
      </div>
    )
  }

  const cfg = reg.pricing
  const currency = reg.currency ?? cfg.currency
  const money = (n: number) => formatMoney(n, currency, lng)
  const optional = isAccommodationOptional(cfg)
  const effectiveRooms = noAcc ? [] : rooms.filter((r) => r.participantIndexes.length > 0)
  const { input } = funnelPriceInput(participants, effectiveRooms, cfg, reg.options, reg.discountCode)
  const newTotal = computePrice(input, cfg).total
  const changed = canon(effectiveRooms) !== canon(reg.rooms)
  const isCash = reg.paymentMethod === 'CASH'
  const title = pickLang(reg.event.title, lng)
  const hero = (reg.event.theme as { heroImageUrl?: string } | null)?.heroImageUrl

  /** Walidacja jak w lejku: pokój bez osób / przekroczona pojemność / (obowiązkowy) brak przypisania. */
  function validate(): string | null {
    if (optional && noAcc) return null
    if (rooms.length === 0) return optional ? t('room.err_choose') : t('room.err_no_room')
    const short = roomStockShortages(cfg, rooms, reg?.roomAvailability ?? {})
    if (short.length) {
      const def = cfg.rooms.find((x) => x.id === short[0].roomId)
      return t('room.err_sold_out', { name: def ? roomLabel(def.name, lng) : short[0].roomId })
    }
    for (const r of rooms) {
      const def = cfg.rooms.find((x) => x.id === r.roomId)
      if (!def) continue
      const name = roomLabel(def.name, lng)
      if (r.participantIndexes.length === 0) return t('room.err_empty', { name })
      if (r.participantIndexes.length > def.cap) return t('room.err_over', { name, cap: def.cap, count: r.participantIndexes.length })
    }
    if (!optional) {
      const assigned = new Set(rooms.flatMap((r) => r.participantIndexes)).size
      if (assigned < participants.length) return t('room.err_unassigned', { count: participants.length - assigned })
    }
    return null
  }

  async function save() {
    if (!token || saving) return
    if (!changed) { setMsg({ kind: 'err', text: t('manage.no_changes') }); return }
    const err = validate()
    if (err) { setMsg({ kind: 'err', text: err }); return }
    setSaving(true)
    setMsg(null)
    try {
      const next = await updateManagedAccommodation(
        token,
        effectiveRooms.map((r) => ({ roomId: r.roomId, participantIndexes: r.participantIndexes })),
      )
      const before = reg ?? next
      track('accommodation_changed', {
        rooms_before: before.rooms.length,
        rooms_after: next.rooms.length,
        change: before.rooms.length === 0 && next.rooms.length > 0 ? 'added' : next.rooms.length === 0 ? 'removed' : 'changed',
        total_before: before.totalPrice,
        total_after: next.totalPrice,
        currency: next.currency,
        payment_method: next.paymentMethod ?? null,
      })
      apply(next)
      setMsg({ kind: 'ok', text: t('manage.saved') })
    } catch (e) {
      setMsg({ kind: 'err', text: `${t('manage.save_error')}${e instanceof Error && e.message ? ` (${e.message})` : ''}` })
    } finally {
      setSaving(false)
    }
  }

  const isLeader = reg.paymentMethod === 'LEADER_DEPOSIT'
  const payLabel = isCash
    ? t('manage.payment_cash')
    : isLeader
      ? t('manage.payment_leader')
      : reg.paymentMethod === 'ONLINE' ? t('manage.payment_online') : t('manage.payment_transfer')

  return (
    <div className="min-h-screen mx-auto relative" style={{ maxWidth: 452, background: 'var(--bg)' }}>
      <ThemeToggle />
      <LanguageSwitch locales={reg.event.locales ?? undefined} />
      <div
        className="relative"
        style={{
          height: 170,
          ...(hero
            ? { background: `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.5)), center/cover no-repeat url(${hero})` }
            : { background: 'linear-gradient(160deg, var(--hero-1), var(--hero-2))' }),
        }}
      >
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>{t('manage.supertitle')}</p>
          <h1 className="font-serif leading-tight" style={{ fontSize: 26, fontWeight: 500, color: '#fff' }}>{title}</h1>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-[22px] py-6 pb-12">
        <div className="flex flex-col gap-2.5 text-sm" style={{ color: 'var(--ink)' }}>
          <div className="flex items-center gap-2.5">
            <Calendar size={16} style={{ color: 'var(--brand)' }} /> {formatDateRange(reg.event.startsAt, reg.event.endsAt ?? reg.event.startsAt, lng)}
          </div>
          {reg.event.location && (
            <div className="flex items-center gap-2.5">
              <MapPin size={16} style={{ color: 'var(--brand)' }} /> {reg.event.location}
            </div>
          )}
          <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
            <span>{t('manage.reg_number')}</span>
            <span className="font-mono">{reg.id}</span>
          </div>
        </div>

        <div className="rounded-[15px] px-4 py-3 flex flex-col gap-1" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{t('manage.participants')}</span>
          {participants.map((p) => (
            <span key={p.id} className="text-sm" style={{ color: 'var(--ink)' }}>
              {p.name || t('participants.adult')}{p.type === 'child' ? ` (${p.age} ${t('participants.age_suffix')})` : ''}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
            {optional ? t('room.title_optional') : t('manage.accommodation')}
          </h2>
          {reg.lock ? (
            <p className="text-sm px-3 py-2.5 rounded-[10px]" style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
              {t(`manage.lock_${reg.lock}`)}
            </p>
          ) : (
            <Step3Room
              hideTitle
              rooms={rooms}
              participants={participants}
              pricingConfig={cfg}
              onChange={(r) => { setRooms(r); setMsg(null) }}
              noAccommodation={noAcc}
              availability={reg.roomAvailability ?? {}}
              onNoAccommodationChange={(v) => { setNoAcc(v); if (v) setRooms([]); setMsg(null) }}
            />
          )}
        </div>

        {!cfg.free && (
          <div className="rounded-[15px] overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="flex justify-between px-4 py-3 text-sm">
              <span style={{ color: 'var(--muted)' }}>{t('manage.current_total')}</span>
              <span className="font-semibold" style={{ color: 'var(--ink)', textDecoration: changed ? 'line-through' : 'none', opacity: changed ? 0.6 : 1 }}>
                {money(reg.totalPrice)}
              </span>
            </div>
            {changed && (
              <div className="flex justify-between px-4 py-3 text-sm" style={{ borderTop: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted)' }}>{t('manage.new_total')}</span>
                <span className="font-semibold" style={{ color: 'var(--brand)' }}>{money(newTotal)}</span>
              </div>
            )}
            <div className="px-4 py-2.5 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--muted)' }}>{payLabel}</div>
          </div>
        )}

        {msg && (
          <p
            className="text-sm font-medium px-3 py-2.5 rounded-[10px]"
            role={msg.kind === 'err' ? 'alert' : 'status'}
            style={msg.kind === 'ok'
              ? { background: 'var(--ok-soft)', color: 'var(--ok)' }
              : { background: 'var(--err-soft)', color: 'var(--err)' }}
          >
            {msg.text}
          </p>
        )}

        {!reg.lock && (
          <button
            onClick={() => { void save() }}
            disabled={saving || !changed}
            className="w-full text-white text-sm font-semibold rounded-[16px] py-4 transition-all duration-150 active:scale-[0.98]"
            style={{ background: 'var(--accent)', border: 'none', cursor: changed ? 'pointer' : 'default', opacity: changed ? 1 : 0.5 }}
          >
            {saving ? t('manage.saving') : t('manage.save')}
          </button>
        )}

        {!cfg.free && isCash && reg.status !== 'CONFIRMED' && <CashAmountBox total={reg.totalPrice} currency={currency} />}
        {!cfg.free && isLeader && reg.status !== 'CONFIRMED' && <LeaderDepositBox total={reg.totalPrice} currency={currency} pct={cfg.leaderDepositPct} />}
        {!cfg.free && reg.paymentMethod === 'BANK_TRANSFER' && reg.status !== 'CONFIRMED' && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{t('manage.transfer_note')}</p>
        )}
      </div>
    </div>
  )
}
