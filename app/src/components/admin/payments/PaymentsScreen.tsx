import { useState, useEffect, useCallback, Fragment } from 'react'
import { Search, Check, Wallet, RefreshCw, Plus, ChevronDown, ChevronUp, Undo2, RotateCcw, AlertTriangle } from 'lucide-react'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import {
  getAdminInstances, getAdminRegistrations, markRegistrationPaid, getInstanceFinance, getRegistrationPayments,
  addRegistrationPayment, voidRegistrationPayment, refundPayment, resolveRefund,
  type InstanceFinance, type RegistrationPayments, type RegistrationPaymentRow, type PaymentRefundRow,
} from '@/lib/api'
import { parseRefundAmount } from '@icpe/shared'
import type { RegistrationDto, EventInstanceDto } from '@icpe/shared'

type Filter = 'all' | 'paid' | 'pending' | 'overdue'

function resolveTitle(title: unknown): string {
  if (typeof title === 'string') return title
  if (title && typeof title === 'object') {
    const t = title as Record<string, string>
    return t.pl ?? t.en ?? t.it ?? ''
  }
  return ''
}

type Method = 'ONLINE' | 'BANK_TRANSFER' | 'CASH' | 'LEADER_DEPOSIT'

/**
 * Metoda płatności w jednym zapisie. Lista zgłoszeń z API używa wartości kontraktu Personal OS
 * (`card` = online, `transfer`, `cash`, `leader_deposit`), a wpłaty — wielkich liter (`ONLINE`, `BANK_TRANSFER`…).
 */
function normMethod(m?: string | null): Method | null {
  const v = String(m ?? '').trim().toLowerCase()
  if (v === 'online' || v === 'card') return 'ONLINE'
  if (v === 'bank_transfer' || v === 'transfer') return 'BANK_TRANSFER'
  if (v === 'cash') return 'CASH'
  if (v === 'leader_deposit' || v === 'leader') return 'LEADER_DEPOSIT'
  return null
}

function methodLabel(m?: string | null): string {
  const v = normMethod(m)
  if (v === 'ONLINE') return 'Online'
  if (v === 'BANK_TRANSFER') return 'Przelew'
  if (v === 'CASH') return 'Gotówka'
  if (v === 'LEADER_DEPOSIT') return 'Zaliczka u lidera'
  return '—'
}

/** Operatorzy płatności online — w kolumnie „Metoda” pokazujemy konkretnego (będzie ich kilka). */
const ONLINE_OPERATORS: Record<string, string> = { tpay: 'Tpay', stripe: 'Stripe' }
const OTHER_SOURCES: Record<string, string> = { 'bank-import': 'przelew', panel: 'wpis ręczny', manual: 'wpis ręczny', mock: 'online (test)' }

/**
 * Kolumna „Metoda”: operator zaksięgowanych wpłat online („Tpay”, „Tpay + przelew”, „Tpay + wpis ręczny”);
 * wybrana płatność online bez wpłaty online → „Online (bez wpłaty)”; pozostałe metody jak dotąd.
 * `paidProviders` przychodzi z API (starsze API go nie zwraca — wtedy zostaje sama wybrana metoda).
 */
function methodCell(r: RegistrationDto): string {
  const provs = r.paidProviders ?? []
  const operators = provs.filter((p) => ONLINE_OPERATORS[p]).map((p) => ONLINE_OPERATORS[p])
  if (operators.length > 0) {
    const rest = [...new Set(provs.filter((p) => !ONLINE_OPERATORS[p]).map((p) => OTHER_SOURCES[p] ?? p))]
    return [...operators, ...rest].join(' + ')
  }
  const chosen = normMethod(r.paymentMethod)
  if (chosen === 'ONLINE') return provs.length > 0 ? 'Online (wpłata poza operatorem)' : 'Online (bez wpłaty)'
  return methodLabel(chosen)
}

function zl(n: number): string {
  const v = Math.round((Number(n) || 0) * 100) / 100
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace('.', ',')} zł`
}

/** Data `YYYY-MM-DD` → `20.04.2027` (bez przesunięć stref czasowych). */
function plDate(d?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? ''))
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

/** Chwila ISO → `25.11.2026 21:07` w czasie przeglądarki. */
function plDateTime(iso?: string | null): string {
  const d = new Date(String(iso ?? ''))
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const REFUND_STATUS: Record<PaymentRefundRow['status'], string> = {
  DONE: 'wykonany',
  PENDING: 'w toku',
  UNCERTAIN: 'DO WYJAŚNIENIA',
  FAILED: 'odrzucony — nic nie zwrócono',
}
/** Zlecenie „w toku” starsze niż 2 min = przerwane w trakcie (np. restart serwera) → do wyjaśnienia. */
const isUnresolved = (f: PaymentRefundRow) => f.status === 'UNCERTAIN' || (f.status === 'PENDING' && Date.now() - new Date(f.createdAt).getTime() > 2 * 60_000)

function todayIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function PaymentsScreen() {
  const [instances, setInstances] = useState<EventInstanceDto[]>([])
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('')
  const [regs, setRegs] = useState<RegistrationDto[]>([])
  const [loadingInstances, setLoadingInstances] = useState(true)
  const [loadingRegs, setLoadingRegs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  // Finanse eventu z API (zadatki, zaległości, prognoza wg terminów) + rozwinięte zgłoszenie (wpłaty).
  const [finance, setFinance] = useState<InstanceFinance | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RegistrationPayments | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(todayIso())
  const [payMethod, setPayMethod] = useState<'BANK_TRANSFER' | 'CASH' | 'ONLINE'>('BANK_TRANSFER')
  const [payNote, setPayNote] = useState('')
  // Zwrot wpłaty Tpay: okno potwierdzenia (wpłata, kwota, powód, powiadomienie gościa).
  const [refundOf, setRefundOf] = useState<{ payment: RegistrationPaymentRow; guest: string } | null>(null)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundReason, setRefundReason] = useState('')
  const [refundNotify, setRefundNotify] = useState(true)
  const [refundBusy, setRefundBusy] = useState(false)
  const [refundErr, setRefundErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  useEffect(() => {
    setLoadingInstances(true)
    getAdminInstances()
      .then((list) => {
        setInstances(list)
        if (list.length > 0) setSelectedInstanceId(list[0].id)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingInstances(false))
  }, [])

  const loadRegs = useCallback((instanceId: string) => {
    if (!instanceId) return
    setLoadingRegs(true)
    setError(null)
    getAdminRegistrations(instanceId)
      .then((list) => setRegs(list.filter((r) => r.status !== 'CANCELLED')))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
        setRegs([])
      })
      .finally(() => setLoadingRegs(false))
    // Starsze API (przed wdrożeniem) nie ma tego adresu — wtedy zostają kafle liczone z listy.
    getInstanceFinance(instanceId).then(setFinance).catch(() => setFinance(null))
  }, [])

  // Odświeżanie w tle co 30 s (bez migania listy) — liczby zgłoszeń, wpłat i darowizn „na bieżąco".
  const { lastUpdatedAt, refreshing, refreshNow } = useAutoRefresh(
    async () => {
      if (!selectedInstanceId) return
      const list = await getAdminRegistrations(selectedInstanceId)
      setRegs(list.filter((r) => r.status !== 'CANCELLED'))
      await getInstanceFinance(selectedInstanceId).then(setFinance).catch(() => undefined)
    },
    { intervalMs: 30000, enabled: !!selectedInstanceId && busyId === null },
  )

  useEffect(() => {
    if (selectedInstanceId) loadRegs(selectedInstanceId)
  }, [selectedInstanceId, loadRegs])

  async function handleMarkPaid(r: RegistrationDto) {
    setBusyId(r.id)
    setError(null)
    try {
      await markRegistrationPaid(r.id)
      loadRegs(selectedInstanceId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  /** Rozwija zgłoszenie: historia wpłat + formularz nowej wpłaty (kwota podpowiedziana z harmonogramu). */
  async function toggleOpen(r: RegistrationDto) {
    if (openId === r.id) { setOpenId(null); setDetail(null); return }
    setOpenId(r.id)
    setDetail(null)
    setPayNote('')
    setPayDate(todayIso())
    setPayMethod(normMethod(r.paymentMethod) === 'CASH' ? 'CASH' : 'BANK_TRANSFER')
    const hint = r.payment?.dueNow || r.payment?.nextDue?.amount || r.payment?.remaining || 0
    setPayAmount(hint > 0 ? String(hint) : '')
    try {
      setDetail(await getRegistrationPayments(r.id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleAddPayment(r: RegistrationDto) {
    const amount = parseFloat(payAmount.replace(',', '.'))
    if (!(amount > 0)) { setError('Podaj kwotę wpłaty większą od zera.'); return }
    setBusyId(r.id)
    setError(null)
    try {
      setDetail(await addRegistrationPayment(r.id, { amount, paidAt: payDate, method: payMethod, note: payNote.trim() || undefined }))
      setPayAmount('')
      setPayNote('')
      loadRegs(selectedInstanceId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleVoid(paymentId: string) {
    setError(null)
    try {
      setDetail(await voidRegistrationPayment(paymentId))
      loadRegs(selectedInstanceId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function openRefund(p: RegistrationPaymentRow, r: RegistrationDto) {
    setRefundOf({ payment: p, guest: `${r.contact.firstName} ${r.contact.lastName}`.trim() })
    setRefundAmount((p.refundable ?? 0).toFixed(2).replace('.', ','))
    setRefundReason('')
    setRefundNotify(true)
    setRefundErr(null)
  }

  /** Kwota z okna zwrotu: poprawna, > 0 i ≤ pozostałej z wpłaty (serwer sprawdza to samo jeszcze raz). */
  const refundMax = refundOf?.payment.refundable ?? 0
  const refundValue = parseRefundAmount(refundAmount)
  const refundValid = Number.isFinite(refundValue) && refundValue > 0 && Math.round(refundValue * 100) <= Math.round(refundMax * 100)

  async function handleRefund() {
    if (!refundOf || refundBusy || !refundValid) return
    setRefundBusy(true)
    setRefundErr(null)
    try {
      const res = await refundPayment(refundOf.payment.id, { amount: refundValue, reason: refundReason.trim() || undefined, notifyGuest: refundNotify })
      setDetail(res)
      setRefundOf(null)
      setNotice(res.uncertain
        ? { tone: 'warn', text: `Tpay nie potwierdził zwrotu ${zl(res.amount ?? refundValue)} (przekroczony czas albo błąd połączenia). Nie wiadomo, czy zwrot się wykonał — NIE zlecaj go ponownie. Sprawdź transakcję w panelu Tpay i oznacz zwrot pod wpłatą jako wykonany albo niewykonany. Organizator dostał mail.` }
        : { tone: 'ok', text: `Zwrot ${zl(res.amount ?? refundValue)} zlecony w Tpay.${res.guestMail === 'sent' ? ' Gość dostał mail.' : res.guestMail === 'failed' ? ' Maila do gościa NIE udało się wysłać.' : ''}` })
      loadRegs(selectedInstanceId)
    } catch (e: unknown) {
      setRefundErr(e instanceof Error ? e.message.replace(/^API \d+:\s*/, '') : String(e))
      // Stan mógł się zmienić (np. zwrot odrzucony) — odświeżamy listę zwrotów pod wpłatą.
      if (openId) getRegistrationPayments(openId).then(setDetail).catch(() => undefined)
    } finally {
      setRefundBusy(false)
    }
  }

  async function handleResolve(f: PaymentRefundRow, outcome: 'done' | 'failed') {
    const q = outcome === 'done'
      ? `Potwierdzasz, że w panelu Tpay zwrot ${zl(f.amount)} JEST wykonany? Wpłata zostanie pomniejszona o tę kwotę, a gość dostanie mail (jeśli zaznaczono powiadomienie).`
      : `Potwierdzasz, że w panelu Tpay zwrotu ${zl(f.amount)} NIE MA? Wpłata zostanie bez zmian, a zwrot będzie można zlecić ponownie.`
    if (!window.confirm(q)) return
    setError(null)
    try {
      setDetail(await resolveRefund(f.id, outcome))
      loadRegs(selectedInstanceId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const isPaid = (r: RegistrationDto) => r.paymentStatus === 'PAID'
  /** Wpłacona kwota: suma wpłat z API, a na starszym API cała kwota opłaconego zgłoszenia. */
  const paidOf = (r: RegistrationDto) => (typeof r.paidAmount === 'number' ? Math.min(r.paidAmount, r.totalPrice ?? 0) : isPaid(r) ? (r.totalPrice ?? 0) : 0)

  const revenue = regs.reduce((s, r) => s + paidOf(r), 0)
  const pendingAmount = regs.reduce((s, r) => s + Math.max(0, (r.totalPrice ?? 0) - paidOf(r)), 0)
  const paidCount = regs.filter(isPaid).length

  // Finanse eventu: należności, osoby i pula darowizn (darowizna jest częścią kwoty zgłoszenia).
  const expectedTotal = revenue + pendingAmount
  const peopleCount = regs.reduce((s, r) => s + (r.participants?.length ?? 0), 0)
  const donationOf = (r: RegistrationDto) => Math.max(0, Number(r.options?.donation ?? 0) || 0)
  const donationsTotal = regs.reduce((s, r) => s + donationOf(r), 0)
  const donationsPaid = regs.filter(isPaid).reduce((s, r) => s + donationOf(r), 0)
  const donorsCount = regs.filter((r) => donationOf(r) > 0).length
  const paidPct = expectedTotal > 0 ? Math.round((revenue / expectedTotal) * 100) : 0

  const filtered = regs.filter((r) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      r.contact.firstName.toLowerCase().includes(q) ||
      r.contact.lastName.toLowerCase().includes(q) ||
      r.contact.email.toLowerCase().includes(q)
    const matchFilter = filter === 'all' || (filter === 'paid' ? isPaid(r) : filter === 'overdue' ? (r.payment?.overdue ?? 0) > 0 : !isPaid(r))
    return matchSearch && matchFilter
  })

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Wszystkie' },
    { id: 'paid', label: 'Opłacone' },
    { id: 'pending', label: 'Oczekujące' },
    { id: 'overdue', label: 'Zaległe' },
  ]

  function card(label: string, value: string, accent?: string, hint?: string) {
    return (
      <div className="rounded-[15px] border p-4 flex-1 min-w-[150px]" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--faint)' }}>{label}</p>
        <p className="text-2xl font-bold mt-1" style={{ color: accent ?? 'var(--ink)' }}>{value}</p>
        {hint && <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{hint}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Instance selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Event:</label>
        {loadingInstances ? (
          <span className="text-sm" style={{ color: 'var(--faint)' }}>Ładowanie...</span>
        ) : instances.length === 0 ? (
          <span className="text-sm" style={{ color: 'var(--faint)' }}>Brak eventów</span>
        ) : (
          <select
            value={selectedInstanceId}
            onChange={(e) => setSelectedInstanceId(e.target.value)}
            className="rounded-[12px] border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}
          >
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>{resolveTitle(inst.title)} ({inst.status})</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-[12px] text-sm" style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}>{error}</div>
      )}

      {notice && (
        <div className="px-4 py-3 rounded-[12px] text-sm flex items-start gap-3" role="status" style={notice.tone === 'ok' ? { background: 'var(--ok-soft)', color: 'var(--ok)', border: '1px solid var(--ok)' } : { background: 'var(--warn-soft)', color: 'var(--ink)', border: '1px solid var(--warn)' }}>
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>zamknij</button>
        </div>
      )}

      {/* Summary */}
      <div className="flex gap-3 flex-wrap">
        {card('Zgłoszenia', String(regs.length), undefined, `${peopleCount} os.`)}
        {card('Prognoza wpływów', zl(expectedTotal), undefined, 'suma kwot wszystkich zgłoszeń')}
        {card('Wpłacone', zl(revenue), 'var(--ok)', `${paidPct}% prognozy`)}
        {card('Do wpłaty', zl(pendingAmount), 'var(--warn)', `${regs.length - paidCount} zgłoszeń czeka`)}
        {card('Opłacone', `${paidCount} / ${regs.length}`)}
        {card('Pula darowizn', zl(donationsTotal), 'var(--brand)', donorsCount > 0 ? `wpłacone ${zl(donationsPaid)} · ${donorsCount} darczyńców` : 'brak darowizn')}
      </div>

      {/* Zadatki, zaległości i prognoza wg terminów — gdy event ma harmonogram wpłat */}
      {finance?.hasPlan && (
        <>
          <div className="flex gap-3 flex-wrap">
            {card('Zadatki wpłacone', zl(finance.depositPaid), 'var(--ok)', `z ${zl(finance.depositRequired)} wymaganych · ${finance.depositPaidCount} / ${finance.registrations} zgłoszeń`)}
            {card('Wymagalne teraz', zl(finance.dueNow), finance.dueNow > 0 ? 'var(--warn)' : undefined, 'terminy, które już nadeszły')}
            {card('Po terminie', zl(finance.overdue), finance.overdue > 0 ? 'var(--err)' : undefined, `${finance.overdueCount} zgłoszeń z zaległością`)}
          </div>
          {finance.forecast.length > 0 && (
            <div className="rounded-[15px] border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--faint)' }}>Prognozowane wpłaty wg terminów</p>
              <div className="flex flex-col gap-1">
                {finance.forecast.map((f) => (
                  <div key={f.dueDate} className="flex items-center justify-between text-sm" style={{ color: 'var(--ink)' }}>
                    <span>
                      do {plDate(f.dueDate)}
                      {f.overdue && <span className="ml-2 text-xs font-semibold" style={{ color: 'var(--err)' }}>po terminie</span>}
                    </span>
                    <span><strong>{zl(f.amount)}</strong> <span className="text-xs" style={{ color: 'var(--muted)' }}>· {f.count} zgłoszeń</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--faint)' }}>
        <button
          type="button"
          onClick={() => void refreshNow()}
          className="inline-flex items-center gap-1 rounded-[8px] border px-2 py-1"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--muted)', cursor: 'pointer' }}
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Odśwież
        </button>
        <span>
          Odświeża się samo co 30 s{lastUpdatedAt ? ` · ostatnio ${lastUpdatedAt.toLocaleTimeString('pl-PL')}` : ''}. Kwoty zawierają darowizny; zgłoszenia anulowane pominięte.
        </span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 rounded-[12px] border" style={{ background: 'var(--surface)', borderColor: 'var(--border)', height: 40, minWidth: 240 }}>
          <Search size={15} style={{ color: 'var(--faint)', flexShrink: 0 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Szukaj..." className="flex-1 text-sm bg-transparent outline-none" style={{ color: 'var(--ink)' }} />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-[12px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="px-3 py-1.5 rounded-[9px] text-sm font-medium transition-all duration-150"
              style={filter === f.id ? { background: 'var(--surface)', color: 'var(--brand)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } : { color: 'var(--muted)' }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-[15px] border overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
        {loadingRegs ? (
          <div className="px-5 py-8 text-center"><p className="text-sm" style={{ color: 'var(--faint)' }}>Ładowanie...</p></div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-8 text-center"><p className="text-sm" style={{ color: 'var(--faint)' }}>{regs.length === 0 ? 'Brak zgłoszeń dla tego eventu.' : 'Brak wyników.'}</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  {['Zgłaszający', 'Kwota', 'Wpłacono', 'Najbliższy termin', 'Metoda', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold" style={{ color: 'var(--faint)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const paid = isPaid(r)
                  const isFree = (r.totalPrice ?? 0) === 0
                  const pay = r.payment
                  const paidSum = paidOf(r)
                  const open = openId === r.id
                  return (
                    <Fragment key={r.id}>
                    <tr style={{ borderBottom: !open && i < filtered.length - 1 ? '1px solid var(--border-2)' : undefined }}>
                      <td className="px-4 py-3">
                        <p className="font-medium" style={{ color: 'var(--ink)' }}>{r.contact.firstName} {r.contact.lastName}</p>
                        <p className="text-xs" style={{ color: 'var(--faint)' }}>{r.contact.email}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold" style={{ color: 'var(--ink)' }}>{isFree ? 'Bezpłatne' : zl(r.totalPrice ?? 0)}</td>
                      <td className="px-4 py-3" style={{ color: paidSum > 0 ? 'var(--ok)' : 'var(--faint)' }}>{isFree ? '—' : zl(paidSum)}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>
                        {isFree || paid || !pay?.nextDue ? '—' : (
                          <span style={{ color: pay.overdue > 0 ? 'var(--err)' : 'var(--ink)' }}>
                            {zl(pay.nextDue.amount)}{pay.hasPlan ? ` do ${plDate(pay.nextDue.dueDate)}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{methodCell(r)}</td>
                      <td className="px-4 py-3">
                        {paid ? <Badge variant="ok">Opłacone</Badge>
                          : isFree ? <Badge variant="muted">—</Badge>
                          : (pay?.overdue ?? 0) > 0 ? <Badge variant="err">Zaległe {zl(pay!.overdue)}</Badge>
                          : pay?.hasPlan && pay.depositPaid ? <Badge variant="ok">Zadatek wpłacony</Badge>
                          : paidSum > 0 ? <Badge variant="warn">Częściowo</Badge>
                          : r.paymentStatus === 'REFUNDED' ? <Badge variant="muted">Zwrócono</Badge>
                          : <Badge variant="warn">Oczekuje</Badge>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {!isFree && (
                          <Button size="sm" variant="outline" onClick={() => { void toggleOpen(r) }} aria-expanded={open}>
                            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Wpłaty
                          </Button>
                        )}
                        {!paid && !isFree && (
                          <Button size="sm" variant="default" className="ml-2" style={{ background: 'var(--ok)' }} disabled={busyId === r.id} onClick={() => { void handleMarkPaid(r) }}>
                            {busyId === r.id ? '...' : (<><Check size={14} /> Oznacz opłacone</>)}
                          </Button>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border-2)' : undefined, background: 'var(--surface-2)' }}>
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex flex-col gap-3">
                            {/* Harmonogram */}
                            {(detail?.summary.schedule.length ?? 0) > 0 && (
                              <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                                {detail!.summary.schedule.map((it) => {
                                  const done = detail!.summary.paid >= it.cumulativeAmount - 0.005
                                  return (
                                    <span key={it.id} className="rounded-full border px-2.5 py-1" style={{ borderColor: done ? 'var(--ok)' : 'var(--border)', color: done ? 'var(--ok)' : 'var(--ink)', background: 'var(--surface)' }}>
                                      {done ? '✓ ' : ''}{it.label || 'Rata'}: {zl(it.amount)} {it.atRegistration ? 'przy rejestracji' : `do ${plDate(it.dueDate)}`}
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                            {/* Historia wpłat */}
                            {detail === null ? (
                              <p className="text-xs" style={{ color: 'var(--faint)' }}>Ładowanie wpłat…</p>
                            ) : detail.payments.filter((p) => p.status === 'PAID' || p.status === 'FAILED' || p.status === 'REFUNDED').length === 0 ? (
                              <p className="text-xs" style={{ color: 'var(--faint)' }}>Brak zaksięgowanych wpłat.</p>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {detail.payments.filter((p) => p.status === 'PAID' || p.status === 'FAILED' || p.status === 'REFUNDED').map((p) => (
                                  <Fragment key={p.id}>
                                  <div className="flex items-center gap-3 text-sm flex-wrap" style={{ color: p.status === 'PAID' ? 'var(--ink)' : 'var(--faint)', textDecoration: p.status === 'PAID' ? undefined : 'line-through' }}>
                                    <span style={{ width: 86 }}>{plDate(p.paidAt)}</span>
                                    <strong style={{ width: 80 }}>{zl(p.amount)}</strong>
                                    <span className="text-xs" style={{ color: 'var(--muted)' }}>
                                      {p.provider === 'tpay' ? (
                                        <>online (Tpay){p.title ? ` · ${p.title}` : ''}</>
                                      ) : (
                                        <>{methodLabel(p.method)} · {p.provider === 'bank-import' ? 'z wyciągu' : p.provider === 'panel' ? 'wpis ręczny' : p.provider === 'manual' ? 'oznaczone jako opłacone' : p.provider}</>
                                      )}
                                      {p.note ? ` · ${p.note}` : ''}{p.by ? ` · ${p.by}` : ''}
                                    </span>
                                    {/* Wpłaty Tpay: znacznik transakcji testowej, rozbieżności kwoty i zwrotu. Bez „cofnij” — wpłatę Tpay się zwraca („Zwróć”). */}
                                    {p.provider === 'tpay' && p.testMode && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" title="Transakcja testowa — pieniądze nie wpłynęły" style={{ background: 'var(--err-soft)', color: 'var(--err)', display: 'inline-block', textDecoration: 'none' }}>TEST</span>
                                    )}
                                    {p.provider === 'tpay' && p.mismatch && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" title="Wpłacona kwota różni się od kwoty, na którą utworzono płatność" style={{ background: 'var(--warn-soft)', color: 'var(--warn)', display: 'inline-block', textDecoration: 'none' }}>
                                        INNA KWOTA{typeof p.expected === 'number' ? ` (oczekiwano ${zl(p.expected)})` : ''}
                                      </span>
                                    )}
                                    {p.status === 'REFUNDED' && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', display: 'inline-block', textDecoration: 'none' }}>ZWRÓCONO</span>
                                    )}
                                    {p.status === 'PAID' && p.refundState === 'PARTIAL' && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" title={`Z tej wpłaty zostało ${zl(p.netAmount ?? 0)}`} style={{ background: 'var(--warn-soft)', color: 'var(--warn)', display: 'inline-block' }}>
                                        ZWRÓCONO CZĘŚCIOWO · {zl(p.refundedAmount ?? 0)}
                                      </span>
                                    )}
                                    {p.status === 'PAID' && p.refundInFlight && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--err-soft)', color: 'var(--err)', display: 'inline-block' }}>ZWROT DO WYJAŚNIENIA</span>
                                    )}
                                    {p.provider === 'tpay' && p.status === 'PAID' && (p.refundable ?? 0) > 0 && (
                                      <button type="button" onClick={() => openRefund(p, r)} className="inline-flex items-center gap-1 text-xs ml-auto rounded-[8px] border px-2 py-1" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)', cursor: 'pointer' }}>
                                        <RotateCcw size={12} /> Zwróć
                                      </button>
                                    )}
                                    {p.status === 'PAID' && (p.provider === 'panel' || p.provider === 'bank-import') && (
                                      <button type="button" onClick={() => { void handleVoid(p.id) }} className="inline-flex items-center gap-1 text-xs ml-auto" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                                        <Undo2 size={12} /> cofnij
                                      </button>
                                    )}
                                  </div>
                                  {/* Zwroty tej wpłaty: data, kwota, stan, powód, kto zlecił */}
                                  {(p.refunds ?? []).map((f) => (
                                    <div key={f.id} className="flex items-center gap-3 text-xs flex-wrap" style={{ color: f.status === 'FAILED' ? 'var(--faint)' : 'var(--muted)', paddingLeft: 16 }}>
                                      <span style={{ width: 118 }}>↳ {plDateTime(f.createdAt)}</span>
                                      <strong style={{ width: 80, color: f.status === 'DONE' ? 'var(--ink)' : undefined, textDecoration: f.status === 'FAILED' ? 'line-through' : undefined }}>−{zl(f.amount)}</strong>
                                      <span style={isUnresolved(f) ? { color: 'var(--err)', fontWeight: 700 } : undefined}>
                                        zwrot {isUnresolved(f) ? REFUND_STATUS.UNCERTAIN : REFUND_STATUS[f.status] ?? f.status}
                                      </span>
                                      <span>
                                        {f.source === 'tpay-notification' ? 'zgłoszony przez Tpay (panel Tpay)' : f.by ? `zlecił(a) ${f.by}` : 'z panelu'}
                                        {f.reason ? ` · powód: ${f.reason}` : ''}
                                      </span>
                                      {isUnresolved(f) && (
                                        <span className="inline-flex items-center gap-2">
                                          <button type="button" onClick={() => { void handleResolve(f, 'done') }} className="rounded-[8px] border px-2 py-0.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)', cursor: 'pointer' }}>w Tpay jest — oznacz wykonany</button>
                                          <button type="button" onClick={() => { void handleResolve(f, 'failed') }} className="rounded-[8px] border px-2 py-0.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)', cursor: 'pointer' }}>w Tpay nie ma — oznacz niewykonany</button>
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                  </Fragment>
                                ))}
                              </div>
                            )}
                            {/* Nowa wpłata */}
                            {!paid && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <input value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="kwota" aria-label="Kwota wpłaty" className="rounded-[10px] border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)', width: 110 }} />
                                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} aria-label="Data wpłaty" className="rounded-[10px] border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }} />
                                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'BANK_TRANSFER' | 'CASH' | 'ONLINE')} aria-label="Metoda" className="rounded-[10px] border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}>
                                  <option value="BANK_TRANSFER">Przelew</option>
                                  <option value="CASH">Gotówka</option>
                                  <option value="ONLINE">Online</option>
                                </select>
                                <input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="notatka (opcjonalnie)" aria-label="Notatka" className="rounded-[10px] border px-3 py-2 text-sm flex-1" style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)', minWidth: 160 }} />
                                <Button size="sm" variant="default" disabled={busyId === r.id} onClick={() => { void handleAddPayment(r) }}>
                                  <Plus size={14} /> Zaksięguj wpłatę
                                </Button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--faint)' }}>
        <Wallet size={13} /> „Wpłacone" to suma zaksięgowanych wpłat (także częściowych) pomniejszona o zwroty. „Oznacz opłacone" księguje brakującą resztę.
      </p>

      {/* Okno potwierdzenia zwrotu wpłaty Tpay */}
      {refundOf && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-title"
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)', zIndex: 60 }}
          onClick={(e) => { if (e.target === e.currentTarget && !refundBusy) setRefundOf(null) }}
        >
          <form
            className="rounded-[15px] border p-5 flex flex-col gap-3 w-full"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', maxWidth: 460, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
            onSubmit={(e) => { e.preventDefault(); void handleRefund() }}
          >
            <h3 id="refund-title" className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Zwrot wpłaty Tpay</h3>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {refundOf.guest} · wpłata {zl(refundOf.payment.amount)} z {plDate(refundOf.payment.paidAt)}
              {refundOf.payment.title ? ` · ${refundOf.payment.title}` : ''}
              {(refundOf.payment.refundedAmount ?? 0) > 0 ? ` · zwrócono już ${zl(refundOf.payment.refundedAmount ?? 0)}` : ''}
            </p>
            <div className="flex items-start gap-2 text-sm px-3 py-2.5 rounded-[10px]" style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>Zwrot zleca prawdziwy przelew zwrotny przez Tpay i nie da się go cofnąć.</span>
            </div>
            {refundOf.payment.testMode && (
              <p className="text-sm px-3 py-2.5 rounded-[10px]" style={{ background: 'var(--warn-soft)', color: 'var(--ink)', border: '1px solid var(--warn)' }}>
                To transakcja testowa (znacznik TEST) — pieniądze nie wpłynęły, więc zwrot też będzie testowy.
              </p>
            )}
            <label className="flex flex-col gap-1 text-sm" style={{ color: 'var(--ink)' }}>
              Kwota zwrotu (zł) — najwyżej {zl(refundMax)}
              <input
                value={refundAmount}
                onChange={(e) => { setRefundAmount(e.target.value.replace(/[^\d.,]/g, '')); setRefundErr(null) }}
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={!refundValid}
                className="rounded-[10px] border px-3 py-2 text-sm"
                style={{ borderColor: refundValid ? 'var(--border)' : 'var(--err)', background: 'var(--surface)', color: 'var(--ink)' }}
              />
              {!refundValid && (
                <span className="text-xs" style={{ color: 'var(--err)' }}>Podaj kwotę od 0,01 zł do {zl(refundMax)}, z dokładnością do grosza.</span>
              )}
              {refundValid && Math.round(refundValue * 100) < Math.round(refundMax * 100) && (
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Zwrot częściowy — z wpłaty zostanie {zl(refundMax - refundValue)}.</span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm" style={{ color: 'var(--ink)' }}>
              Powód (opcjonalnie; widoczny tylko w panelu)
              <input value={refundReason} onChange={(e) => setRefundReason(e.target.value)} maxLength={300} className="rounded-[10px] border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }} />
            </label>
            <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
              <input type="checkbox" checked={refundNotify} onChange={(e) => setRefundNotify(e.target.checked)} /> Powiadom gościa mailem („Zwróciliśmy wpłatę”)
            </label>
            {refundErr && <p className="text-sm font-medium" role="alert" style={{ color: 'var(--err)' }}>{refundErr}</p>}
            <div className="flex justify-end gap-2 mt-1">
              <Button type="button" size="sm" variant="outline" disabled={refundBusy} onClick={() => setRefundOf(null)}>Anuluj</Button>
              <Button type="submit" size="sm" variant="default" disabled={refundBusy || !refundValid} style={{ background: 'var(--err)' }}>
                {refundBusy ? 'Zlecam zwrot…' : `Zwróć ${refundValid ? zl(refundValue) : ''}`}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
