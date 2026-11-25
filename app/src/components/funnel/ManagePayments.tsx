import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CreditCard } from 'lucide-react'
import { onlinePayAmount, parsePayAmount } from '@icpe/shared'
import { getManagedPayments, startManagedPayment, type ManagedPayments as Overview } from '../../lib/api'
import { bcp47 } from '../../lib/utils'
import { track } from '../../lib/analytics'
import Spinner from '../ui/Spinner'

/** Kwota z groszami tylko wtedy, gdy są (formatMoney z shared zaokrągla do pełnych złotych). */
function money(n: number, currency: string, lng: string): string {
  const whole = Math.abs(n - Math.round(n)) < 0.005
  try {
    return new Intl.NumberFormat(bcp47(lng), { style: 'currency', currency, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(n)
  } catch {
    return `${n.toFixed(whole ? 0 : 2)} ${currency}`
  }
}

function day(date: string, lng: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString(bcp47(lng), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

type ReturnState = 'none' | 'checking' | 'confirmed' | 'pending' | 'error'

/** Parametr powrotu z Tpay (`?pay=return` / `?pay=error`) — służy TYLKO do banera; stan pochodzi z API. */
function readReturnParam(): 'return' | 'error' | null {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('pay')
  return v === 'return' || v === 'error' ? v : null
}

function clearReturnParam() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('pay')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  } catch {
    /* brak history API */
  }
}

const POLL_MS = 3000
const POLL_MAX = 20

/**
 * Sekcja „Płatności” na stronie zgłoszenia gościa (`/z/:token`): harmonogram, wpłacono, pozostało,
 * lista wpłat — dla KAŻDEGO płatnego zgłoszenia. Przyciski płatności online (Tpay) tylko wtedy,
 * gdy API zgłasza dostępność (tryb `tpay`, event z ONLINE, PLN, reguła kraj / język).
 * Kwotę płatności zawsze liczy i sprawdza serwer; tu tylko podpowiadamy granice.
 */
export default function ManagePayments({ token, onChanged, refreshKey }: {
  token: string
  /** wpłata została zaksięgowana — rodzic odświeża zgłoszenie (status) */
  onChanged?: () => void
  /** zmiana wartości (np. kwoty zgłoszenia po zmianie noclegu) wczytuje rozliczenie ponownie */
  refreshKey?: number | string
}) {
  const { t, i18n } = useTranslation()
  const lng = i18n.language
  const [data, setData] = useState<Overview | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<null | 'due' | 'remaining' | 'custom'>(null)
  const [err, setErr] = useState<string | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const [ret, setRet] = useState<ReturnState>(() => (readReturnParam() === 'return' ? 'checking' : readReturnParam() === 'error' ? 'error' : 'none'))
  const sectionRef = useRef<HTMLDivElement | null>(null)
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged

  const load = useCallback(async () => {
    const d = await getManagedPayments(token)
    setData(d)
    setLoadError(false)
    return d
  }, [token])

  // Pierwsze wczytanie + obsługa powrotu z płatności (odpytywanie stanu do skutku albo limitu).
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const param = readReturnParam()
    if (param) clearReturnParam()
    let tries = 0
    const tick = async () => {
      try {
        const d = await load()
        if (!alive) return
        if (param !== 'return') return
        const st = d.lastAttempt?.status
        if (st === 'PAID' || d.summary.fullyPaid) {
          setRet('confirmed')
          track('online_payment_confirmed', { amount: d.lastAttempt?.paidAmount ?? d.lastAttempt?.amount ?? null })
          onChangedRef.current?.()
          return
        }
        if (st === 'FAILED' || st === 'EXPIRED' || !d.lastAttempt) {
          setRet('pending')
          return
        }
        tries += 1
        if (tries >= POLL_MAX) {
          setRet('pending')
          return
        }
        timer = setTimeout(() => void tick(), POLL_MS)
      } catch {
        if (!alive) return
        setLoadError(true)
        if (param === 'return') setRet('pending')
      }
    }
    void tick()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [load])

  // Zmieniła się kwota zgłoszenia (np. gość zmienił nocleg) → rozliczenie i granice kwot od nowa.
  const firstKey = useRef(refreshKey)
  useEffect(() => {
    if (firstKey.current === refreshKey) return
    firstKey.current = refreshKey
    void load().catch(() => undefined)
  }, [refreshKey, load])

  // Link z maila „Zapłać online” prowadzi do #platnosci — przewijamy, gdy sekcja jest już na stronie.
  useEffect(() => {
    if (!data) return
    if (window.location.hash === '#platnosci' || ret !== 'none') sectionRef.current?.scrollIntoView({ block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data])

  async function pay(mode: 'due' | 'remaining' | 'custom') {
    if (busy || !data) return
    setErr(null)
    let amount: number | undefined
    if (mode === 'custom') {
      const picked = onlinePayAmount('custom', custom, data.bounds)
      if (!picked.ok) {
        setErr(t('pay.custom_invalid', { min: money(data.bounds.min, data.currency, lng), max: money(data.bounds.max, data.currency, lng) }))
        return
      }
      amount = picked.amount
    }
    setBusy(mode)
    try {
      const res = await startManagedPayment(token, { mode, ...(amount !== undefined ? { amount } : {}) })
      track('online_payment_started', { mode, amount: res.amount })
      window.location.assign(res.redirectUrl)
      // Zostawiamy „Przekierowujemy…” do czasu opuszczenia strony.
    } catch (e) {
      setErr(`${t('pay.start_error')}${e instanceof Error && e.message ? ` ${e.message}` : ''}`)
      setBusy(null)
      void load().catch(() => undefined)
    }
  }

  if (loadError && !data) {
    return (
      <div id="platnosci" className="rounded-[15px] px-4 py-3 text-sm" style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)' }}>
        {t('pay.load_error')}
      </div>
    )
  }
  if (!data) {
    return (
      <div id="platnosci" className="flex justify-center py-4">
        <Spinner />
      </div>
    )
  }
  // Zgłoszenie bezpłatne: nie ma czego pokazywać.
  if (!(data.summary.total > 0)) return null

  const s = data.summary
  const cur = data.currency
  const f = (n: number) => money(n, cur, lng)
  const b = data.bounds
  const canPay = data.online.available && b.max > 0
  const showAll = canPay && b.max > b.due + 0.005
  const showCustom = canPay && b.max > b.min + 0.005
  const row = (label: string, value: string, strong = false) => (
    <div className="flex justify-between gap-3 px-4 py-2.5 text-sm" style={{ borderTop: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className={strong ? 'font-semibold' : 'font-medium'} style={{ color: strong ? 'var(--brand)' : 'var(--ink)' }}>{value}</span>
    </div>
  )

  return (
    <div id="platnosci" ref={sectionRef} className="flex flex-col gap-3" style={{ scrollMarginTop: 12 }}>
      <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>{t('pay.title')}</h2>

      {ret === 'checking' && (
        <div className="flex items-center gap-3 text-sm font-medium px-3 py-2.5 rounded-[10px]" role="status" style={{ background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
          <Spinner /> {t('pay.checking')}
        </div>
      )}
      {ret === 'confirmed' && (
        <p className="text-sm font-medium px-3 py-2.5 rounded-[10px]" role="status" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>{t('pay.confirmed')}</p>
      )}
      {ret === 'pending' && (
        <div className="flex flex-col gap-2 text-sm px-3 py-2.5 rounded-[10px]" role="status" style={{ background: 'var(--warn-soft)', color: 'var(--ink)' }}>
          <span>{t('pay.still_pending')}</span>
          <button
            onClick={() => { void load().then((d) => { if (d.lastAttempt?.status === 'PAID' || d.summary.fullyPaid) { setRet('confirmed'); onChanged?.() } }).catch(() => undefined) }}
            className="self-start text-xs font-semibold px-3 py-1.5 rounded-[9px]"
            style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer' }}
          >
            {t('pay.refresh')}
          </button>
        </div>
      )}
      {ret === 'error' && (
        <p className="text-sm font-medium px-3 py-2.5 rounded-[10px]" role="alert" style={{ background: 'var(--err-soft)', color: 'var(--err)' }}>{t('pay.return_error')}</p>
      )}

      {/* Rozliczenie */}
      <div className="rounded-[15px] overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="flex justify-between gap-3 px-4 py-2.5 text-sm">
          <span style={{ color: 'var(--muted)' }}>{t('pay.total')}</span>
          <span className="font-medium" style={{ color: 'var(--ink)' }}>{f(s.total)}</span>
        </div>
        {row(t('pay.paid'), f(s.paid))}
        {row(t('pay.remaining'), f(s.remaining), s.remaining > 0)}
        {s.remaining > 0 && s.dueNow > 0 && s.dueNow < s.remaining - 0.005 && row(t('pay.due_now'), f(s.dueNow), true)}
      </div>

      {s.fullyPaid && (
        <p className="text-sm font-medium px-3 py-2.5 rounded-[10px]" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>{t('pay.fully_paid')}</p>
      )}

      {/* Harmonogram (gdy event ma plan wpłat) */}
      {s.schedule.length > 1 && (
        <div className="rounded-[15px] px-4 py-3 flex flex-col gap-1.5" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{t('pay.schedule')}</span>
          {s.schedule.map((it) => {
            const covered = s.paid >= it.cumulativeAmount - 0.005
            return (
              <div key={it.id} className="flex justify-between gap-3 text-sm" style={{ color: 'var(--ink)', opacity: covered ? 0.55 : 1 }}>
                <span>
                  {it.label || t('pay.installment')} · {it.atRegistration ? t('pay.at_registration') : t('pay.due_by', { date: day(it.dueDate, lng) })}
                </span>
                <span className="font-medium" style={{ textDecoration: covered ? 'line-through' : 'none' }}>{f(it.amount)}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Zaksięgowane wpłaty */}
      <div className="rounded-[15px] px-4 py-3 flex flex-col gap-1.5" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{t('pay.history')}</span>
        {data.payments.length === 0 ? (
          <span className="text-sm" style={{ color: 'var(--muted)' }}>{t('pay.no_payments')}</span>
        ) : (
          data.payments.map((p) => {
            // Zwroty: starsze API nie zwraca listy — wtedy zostaje sam dopisek „zwrócono” przy wpłacie REFUNDED.
            const refunds = p.refunds ?? []
            const partly = p.status !== 'REFUNDED' && (p.refunded ?? 0) > 0
            return (
              <div key={p.id} className="flex flex-col gap-1">
                <div className="flex justify-between gap-3 text-sm" style={{ color: 'var(--ink)' }}>
                  <span>
                    {day(p.paidAt, lng)} · {t(`pay.src_${p.source}`)}
                    {p.status === 'REFUNDED' ? ` · ${t('pay.refunded')}` : partly ? ` · ${t('pay.refunded_part')}` : ''}
                  </span>
                  <span className="font-medium" style={{ textDecoration: p.status === 'REFUNDED' ? 'line-through' : 'none' }}>{money(p.amount, p.currency || cur, lng)}</span>
                </div>
                {refunds.map((r, i) => (
                  <div key={`${p.id}-r${i}`} className="flex justify-between gap-3 text-sm pl-3" style={{ color: 'var(--muted)' }}>
                    <span>{day(r.date, lng)} · {t('pay.refund_row')}</span>
                    <span className="font-medium">−{money(r.amount, p.currency || cur, lng)}</span>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>

      {/* Płatność online (Tpay) */}
      {canPay && (
        <div className="rounded-[15px] px-4 py-4 flex flex-col gap-3" style={{ border: '1.5px solid var(--brand)', background: 'var(--brand-soft)' }}>
          <div className="flex items-center gap-2">
            <CreditCard size={18} style={{ color: 'var(--brand)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t('pay.online_title')}</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>{t('pay.methods')}</span>
          </div>
          {busy ? (
            <div className="flex items-center gap-3 text-sm" role="status" style={{ color: 'var(--ink)' }}>
              <Spinner /> {t('pay.redirecting')}
            </div>
          ) : (
            <>
              <button
                onClick={() => { void pay('due') }}
                className="w-full text-white text-sm font-semibold rounded-[14px] py-3.5 transition-all duration-150 active:scale-[0.98]"
                style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
              >
                {t('pay.pay_now', { amount: f(b.due) })}
              </button>
              {showAll && (
                <button
                  onClick={() => { void pay('remaining') }}
                  className="w-full text-sm font-semibold rounded-[14px] py-3 transition-all duration-150 active:scale-[0.98]"
                  style={{ background: 'var(--surface)', color: 'var(--brand)', border: '1px solid var(--brand)', cursor: 'pointer' }}
                >
                  {t('pay.pay_all', { amount: f(b.max) })}
                </button>
              )}
              {showCustom && !customOpen && (
                <button
                  onClick={() => { setCustomOpen(true); setErr(null) }}
                  className="self-center text-sm font-medium underline"
                  style={{ background: 'none', border: 'none', color: 'var(--ink)', cursor: 'pointer' }}
                >
                  {t('pay.pay_custom')}
                </button>
              )}
              {showCustom && customOpen && (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => { e.preventDefault(); void pay('custom') }}
                >
                  <label className="text-xs font-medium" htmlFor="pay-custom" style={{ color: 'var(--muted)' }}>
                    {t('pay.custom_label')} ({cur}) · {t('pay.custom_range', { min: f(b.min), max: f(b.max) })}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="pay-custom"
                      inputMode="decimal"
                      autoComplete="off"
                      value={custom}
                      onChange={(e) => { setCustom(e.target.value); setErr(null) }}
                      className="flex-1 min-w-0 rounded-[12px] px-3 py-2.5 text-sm"
                      style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}
                    />
                    <button
                      type="submit"
                      disabled={!Number.isFinite(parsePayAmount(custom))}
                      className="text-white text-sm font-semibold rounded-[12px] px-4 disabled:opacity-40"
                      style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
                    >
                      {t('pay.custom_submit')}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
          {err && <p className="text-sm font-medium" role="alert" style={{ color: 'var(--err)' }}>{err}</p>}
        </div>
      )}
    </div>
  )
}
