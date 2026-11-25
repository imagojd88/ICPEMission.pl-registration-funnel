import { useState, useEffect, useCallback, Fragment } from 'react'
import { Search, Check, Wallet, RefreshCw, Plus, ChevronDown, ChevronUp, Undo2 } from 'lucide-react'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import {
  getAdminInstances, getAdminRegistrations, markRegistrationPaid, getInstanceFinance, getRegistrationPayments,
  addRegistrationPayment, voidRegistrationPayment, type InstanceFinance, type RegistrationPayments,
} from '@/lib/api'
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

function methodLabel(m?: string): string {
  if (m === 'ONLINE') return 'Online'
  if (m === 'BANK_TRANSFER') return 'Przelew'
  if (m === 'CASH') return 'Gotówka'
  if (m === 'LEADER_DEPOSIT') return 'Zaliczka u lidera'
  return '—'
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
    setPayMethod(r.paymentMethod === 'CASH' ? 'CASH' : 'BANK_TRANSFER')
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
                      <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>{methodLabel(r.paymentMethod)}</td>
                      <td className="px-4 py-3">
                        {paid ? <Badge variant="ok">Opłacone</Badge>
                          : isFree ? <Badge variant="muted">—</Badge>
                          : (pay?.overdue ?? 0) > 0 ? <Badge variant="err">Zaległe {zl(pay!.overdue)}</Badge>
                          : pay?.hasPlan && pay.depositPaid ? <Badge variant="ok">Zadatek wpłacony</Badge>
                          : paidSum > 0 ? <Badge variant="warn">Częściowo</Badge>
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
                                  <div key={p.id} className="flex items-center gap-3 text-sm" style={{ color: p.status === 'PAID' ? 'var(--ink)' : 'var(--faint)', textDecoration: p.status === 'PAID' ? undefined : 'line-through' }}>
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
                                    {/* Wpłaty Tpay: znacznik transakcji testowej, rozbieżności kwoty i zwrotu. Bez „cofnij” — zwrot robi się w panelu Tpay. */}
                                    {p.provider === 'tpay' && p.testMode && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" title="Transakcja testowa — pieniądze nie wpłynęły" style={{ background: 'var(--err-soft)', color: 'var(--err)', display: 'inline-block', textDecoration: 'none' }}>TEST</span>
                                    )}
                                    {p.provider === 'tpay' && p.mismatch && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" title="Wpłacona kwota różni się od kwoty, na którą utworzono płatność" style={{ background: 'var(--warn-soft)', color: 'var(--warn)', display: 'inline-block', textDecoration: 'none' }}>
                                        INNA KWOTA{typeof p.expected === 'number' ? ` (oczekiwano ${zl(p.expected)})` : ''}
                                      </span>
                                    )}
                                    {p.status === 'REFUNDED' && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-2)', color: 'var(--muted)', display: 'inline-block', textDecoration: 'none' }}>ZWRÓCONO</span>
                                    )}
                                    {p.status === 'PAID' && (p.provider === 'panel' || p.provider === 'bank-import') && (
                                      <button type="button" onClick={() => { void handleVoid(p.id) }} className="inline-flex items-center gap-1 text-xs ml-auto" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                                        <Undo2 size={12} /> cofnij
                                      </button>
                                    )}
                                  </div>
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
        <Wallet size={13} /> „Wpłacone" to suma zaksięgowanych wpłat (także częściowych). „Oznacz opłacone" księguje brakującą resztę.
      </p>
    </div>
  )
}
