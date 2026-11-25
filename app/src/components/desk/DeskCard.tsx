import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, KeyRound, Banknote, MessageSquarePlus, Undo2 } from 'lucide-react'
import { DESK_REQUEST_KINDS, type DeskRequestKind, type DeskScope } from '@icpe/shared'
import {
  DeskError,
  deskAddPayment,
  deskAddRequest,
  deskCheckIn,
  deskKey,
  deskPayments,
  deskSetRequestStatus,
  deskVoidPayment,
  newClientId,
  type DeskKeyAction,
  type DeskPaymentRow,
  type DeskRegistration,
} from '@/lib/deskApi'
import { BigButton, Notice, Pill, deskErrText, fieldStyle, fmtMoney, fmtTime } from './deskUi'

interface Props {
  instanceId: string
  reg: DeskRegistration
  scopes: DeskScope[]
  /** pełny admin: może cofnąć wpłatę i zaksięgować nadpłatę */
  full: boolean
  onUpdated: (reg: DeskRegistration) => void
  onOffline: () => void
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-sm" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="text-sm font-semibold text-right" style={{ color: 'var(--ink)' }}>{children}</span>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--faint)' }}>{title}</h3>
      {children}
    </section>
  )
}

/** Karta zgłoszenia: osoby, pokój, rozliczenie i akcje — każda akcja tylko przy swoim zakresie. */
export default function DeskCard({ instanceId, reg, scopes, full, onUpdated, onOffline }: Props) {
  const { t, i18n } = useTranslation()
  const lng = i18n.language
  const can = (s: DeskScope) => scopes.includes(s)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  // ── wpłaty ──
  const [payOpen, setPayOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'CASH' | 'BANK_TRANSFER'>('CASH')
  const [payNote, setPayNote] = useState('')
  const [clientId, setClientId] = useState(newClientId)
  const [history, setHistory] = useState<DeskPaymentRow[] | null>(null)

  // ── prośby ──
  const [reqOpen, setReqOpen] = useState(false)
  const [reqKind, setReqKind] = useState<DeskRequestKind>('DIET')
  const [reqPerson, setReqPerson] = useState('')
  const [reqNote, setReqNote] = useState('')

  const money = reg.money
  const cur = money?.currency ?? 'PLN'

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof DeskError && e.kind === 'offline') onOffline()
      setError(deskErrText(t, e))
    },
    [onOffline, t],
  )

  const loadHistory = useCallback(() => {
    if (!scopes.includes('payments')) return
    deskPayments(instanceId, reg.id)
      .then((r) => setHistory(r.payments))
      .catch(() => undefined)
  }, [instanceId, reg.id, scopes])

  useEffect(() => {
    loadHistory()
    // tylko przy otwarciu karty; po akcjach odświeżamy jawnie
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg.id])

  async function run(fn: () => Promise<DeskRegistration>, okText?: string): Promise<boolean> {
    if (busy) return false
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      onUpdated(await fn())
      if (okText) setFlash(okText)
      return true
    } catch (e) {
      fail(e)
      return false
    } finally {
      setBusy(false)
    }
  }

  function openPay() {
    const suggested = money ? (money.dueNow > 0 ? money.dueNow : money.remaining) : 0
    setAmount(suggested > 0 ? suggested.toFixed(2) : '')
    setMethod('CASH')
    setPayNote('')
    setClientId(newClientId())
    setError(null)
    setFlash(null)
    setPayOpen(true)
  }

  const parsedAmount = Math.round(parseFloat(amount.replace(',', '.').replace(/\s/g, '')) * 100) / 100

  async function submitPay(e: React.FormEvent) {
    e.preventDefault()
    if (!(parsedAmount > 0)) return setError(t('desk.pay.err_amount'))
    if (!full && money && parsedAmount > money.remaining + 0.005) return setError(t('desk.pay.err_too_much', { amount: fmtMoney(money.remaining, cur, lng) }))
    const ok = await run(
      () => deskAddPayment(instanceId, reg.id, { amount: parsedAmount, method, note: payNote.trim() || undefined, clientId }),
      t('desk.pay.done', { amount: fmtMoney(parsedAmount, cur, lng) }),
    )
    if (ok) {
      setPayOpen(false)
      loadHistory()
    }
  }

  async function voidPay(p: DeskPaymentRow) {
    if (!window.confirm(t('desk.pay.confirm_void', { amount: fmtMoney(p.amount, p.currency, lng) }))) return
    if (await run(() => deskVoidPayment(instanceId, p.id))) loadHistory()
  }

  async function submitReq(e: React.FormEvent) {
    e.preventDefault()
    if (!reqNote.trim() && reqKind !== 'EXTRA_BED') return setError(t('desk.req.err_note'))
    const ok = await run(() => deskAddRequest(instanceId, reg.id, { kind: reqKind, participantId: reqPerson || null, note: reqNote.trim() }), t('desk.req.saved'))
    if (ok) {
      setReqOpen(false)
      setReqNote('')
      setReqPerson('')
    }
  }

  function keyAction(action: DeskKeyAction, confirmKey?: string) {
    if (confirmKey && !window.confirm(t(confirmKey))) return
    void run(() => deskKey(instanceId, reg.id, action))
  }

  const personName = (id: string | null) => {
    const p = reg.people.find((x) => x.id === id)
    return p ? `${p.firstName} ${p.lastName}`.trim() : ''
  }
  const kindLabel = (k: string) => ((DESK_REQUEST_KINDS as readonly string[]).includes(k) ? t(`desk.req.kind.${k}`) : k)

  return (
    <div className="flex flex-col gap-5 px-4 pb-5 pt-1">
      {error && <Notice tone="err">{error}</Notice>}
      {flash && !error && <Notice tone="ok">{flash}</Notice>}

      {/* Przyjazd */}
      {can('checkin') &&
        (reg.checkedInAt ? (
          <div className="flex flex-col gap-2">
            <Notice tone="ok">
              <span className="font-semibold">{t('desk.card.arrived_at', { time: fmtTime(reg.checkedInAt, lng) })}</span>
              {reg.checkedInBy ? <span> · {reg.checkedInBy}</span> : null}
            </Notice>
            <BigButton
              small
              tone="plain"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t('desk.act.confirm_undo_check_in'))) void run(() => deskCheckIn(instanceId, reg.id, false))
              }}
            >
              <Undo2 size={16} /> {t('desk.act.undo_check_in')}
            </BigButton>
          </div>
        ) : (
          <BigButton tone="ok" disabled={busy} onClick={() => void run(() => deskCheckIn(instanceId, reg.id, true))}>
            <Check size={20} /> {t('desk.act.check_in')}
          </BigButton>
        ))}
      {!can('checkin') && reg.checkedInAt && <Notice tone="ok">{t('desk.card.arrived_at', { time: fmtTime(reg.checkedInAt, lng) })}</Notice>}

      {/* Osoby */}
      <Block title={t('desk.card.people')}>
        <ul className="flex flex-col gap-1.5">
          {reg.people.map((p) => (
            <li key={p.id} className="rounded-[12px] px-3 py-2" style={{ background: 'var(--bg)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                  {p.firstName} {p.lastName}
                </span>
                {p.child && <Pill tone="brand">{p.age !== null ? t('desk.card.child_age', { n: p.age }) : t('desk.card.child')}</Pill>}
              </div>
              {p.diet && (
                <p className="text-sm mt-0.5" style={{ color: 'var(--warn)' }}>
                  {t('desk.card.diet')}: {p.diet}
                </p>
              )}
            </li>
          ))}
        </ul>
        {reg.dietaryNotes && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {t('desk.card.diet_notes')}: {reg.dietaryNotes}
          </p>
        )}
      </Block>

      {/* Pokój + dane zgłoszenia */}
      <Block title={t('desk.card.details')}>
        <div className="rounded-[12px] px-3 py-1" style={{ border: '1px solid var(--border)' }}>
          <Row label={t('desk.card.room')}>{reg.roomLabel || t('desk.list.no_room')}</Row>
          {reg.roomNote && <Row label={t('desk.card.room_note')}>{reg.roomNote}</Row>}
          <Row label={t('desk.card.contact')}>
            {reg.contact.firstName} {reg.contact.lastName}
          </Row>
          {reg.contact.phone && (
            <Row label={t('desk.card.phone')}>
              <a href={`tel:${reg.contact.phone.replace(/\s/g, '')}`} style={{ color: 'var(--brand)' }}>{reg.contact.phone}</a>
            </Row>
          )}
          {reg.contact.email && (
            <Row label="E-mail">
              <span style={{ wordBreak: 'break-all' }}>{reg.contact.email}</span>
            </Row>
          )}
          <Row label={t('desk.card.reg_no')}>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', wordBreak: 'break-all' }}>{reg.id}</span>
          </Row>
        </div>
      </Block>

      {/* Rozliczenie */}
      {money && (
        <Block title={t('desk.money.title')}>
          <div className="rounded-[12px] px-3 py-1" style={{ border: '1px solid var(--border)' }}>
            <Row label={t('desk.money.total')}>{fmtMoney(money.total, cur, lng)}</Row>
            <Row label={t('desk.money.paid')}>{fmtMoney(money.paid, cur, lng)}</Row>
            <Row label={t('desk.money.remaining')}>
              <span style={{ color: money.remaining > 0 ? 'var(--warn)' : 'var(--ok)' }}>
                {money.remaining > 0 ? fmtMoney(money.remaining, cur, lng) : t('desk.money.settled')}
              </span>
            </Row>
            {money.remaining > 0 && <Row label={t('desk.money.due_now')}>{fmtMoney(money.dueNow, cur, lng)}</Row>}
            {money.overdue > 0 && (
              <Row label={t('desk.money.overdue')}>
                <span style={{ color: 'var(--err)' }}>{fmtMoney(money.overdue, cur, lng)}</span>
              </Row>
            )}
          </div>

          {!payOpen && (money.remaining > 0 || full) && (
            <BigButton tone="brand" disabled={busy} onClick={openPay}>
              <Banknote size={20} /> {t('desk.pay.open')}
            </BigButton>
          )}

          {payOpen && (
            <form onSubmit={submitPay} className="flex flex-col gap-3 rounded-[14px] p-3" style={{ background: 'var(--brand-soft)' }}>
              <label className="flex flex-col gap-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {t('desk.pay.amount', { currency: cur })}
                <input inputMode="decimal" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...fieldStyle, fontSize: 22, fontWeight: 700 }} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['CASH', 'BANK_TRANSFER'] as const).map((m) => (
                  <BigButton key={m} small tone={method === m ? 'brand' : 'plain'} onClick={() => setMethod(m)}>
                    {t(m === 'CASH' ? 'desk.pay.cash' : 'desk.pay.transfer')}
                  </BigButton>
                ))}
              </div>
              <label className="flex flex-col gap-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {t('desk.pay.note')}
                <input value={payNote} maxLength={300} onChange={(e) => setPayNote(e.target.value)} style={fieldStyle} />
              </label>
              <BigButton type="submit" tone="ok" disabled={busy || !(parsedAmount > 0)}>
                {busy
                  ? t('desk.common.saving')
                  : t('desk.pay.submit', {
                      amount: parsedAmount > 0 ? fmtMoney(parsedAmount, cur, lng) : '',
                      method: t(method === 'CASH' ? 'desk.pay.cash' : 'desk.pay.transfer').toLowerCase(),
                    })}
              </BigButton>
              <BigButton small tone="plain" disabled={busy} onClick={() => setPayOpen(false)}>
                {t('desk.common.cancel')}
              </BigButton>
            </form>
          )}

          {history && history.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {history.map((p) => {
                const voided = p.status !== 'PAID'
                return (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-[12px] px-3 py-2 text-sm" style={{ background: 'var(--bg)', opacity: voided ? 0.6 : 1 }}>
                    <div className="min-w-0">
                      <span className="font-semibold" style={{ color: 'var(--ink)', textDecoration: voided ? 'line-through' : 'none' }}>
                        {fmtMoney(p.amount, p.currency, lng)}
                      </span>
                      <span style={{ color: 'var(--muted)' }}>
                        {' · '}
                        {p.paidAt}
                        {' · '}
                        {p.method === 'CASH' ? t('desk.pay.cash') : p.method === 'BANK_TRANSFER' ? t('desk.pay.transfer') : t('desk.pay.online')}
                        {voided ? ` · ${t('desk.pay.voided')}` : ''}
                      </span>
                      {(p.note || p.by) && (
                        <p className="truncate" style={{ color: 'var(--faint)' }}>
                          {[p.note, p.by].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    {full && p.voidable && (
                      <button type="button" disabled={busy} onClick={() => void voidPay(p)} className="shrink-0 rounded-[10px] px-3 font-semibold" style={{ minHeight: 40, border: '1px solid var(--err)', color: 'var(--err)', background: 'transparent', cursor: 'pointer' }}>
                        {t('desk.pay.void')}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Block>
      )}

      {/* Klucz */}
      {(can('keys') || reg.key.issuedAt) && (
        <Block title={t('desk.key.title')}>
          {reg.key.issuedAt && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {t('desk.key.issued_at', { time: fmtTime(reg.key.issuedAt, lng) })}
              {reg.key.issuedBy ? ` · ${reg.key.issuedBy}` : ''}
              {reg.key.returnedAt ? (
                <>
                  <br />
                  {t('desk.key.returned_at', { time: fmtTime(reg.key.returnedAt, lng) })}
                  {reg.key.returnedBy ? ` · ${reg.key.returnedBy}` : ''}
                </>
              ) : null}
            </p>
          )}
          {can('keys') && (
            <div className="flex flex-col gap-2">
              {(!reg.key.issuedAt || reg.key.returnedAt) && (
                <BigButton tone="brand" disabled={busy} onClick={() => keyAction('issue')}>
                  <KeyRound size={20} /> {reg.key.returnedAt ? t('desk.key.issue_again') : t('desk.key.issue')}
                </BigButton>
              )}
              {reg.key.issuedAt && !reg.key.returnedAt && (
                <>
                  <BigButton tone="warn" disabled={busy} onClick={() => keyAction('return')}>
                    <KeyRound size={20} /> {t('desk.key.return')}
                  </BigButton>
                  <BigButton small tone="plain" disabled={busy} onClick={() => keyAction('undo-issue', 'desk.key.confirm_undo')}>
                    <Undo2 size={16} /> {t('desk.key.undo_issue')}
                  </BigButton>
                </>
              )}
              {reg.key.returnedAt && (
                <BigButton small tone="plain" disabled={busy} onClick={() => keyAction('undo-return', 'desk.key.confirm_undo')}>
                  <Undo2 size={16} /> {t('desk.key.undo_return')}
                </BigButton>
              )}
            </div>
          )}
        </Block>
      )}

      {/* Prośby dodatkowe */}
      {(can('requests') || reg.requests.length > 0) && (
        <Block title={t('desk.req.title')}>
          {reg.requests.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {reg.requests.map((q) => (
                <li key={q.id} className="rounded-[12px] px-3 py-2 flex flex-col gap-2" style={{ background: 'var(--bg)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm">
                      <span className="font-semibold" style={{ color: 'var(--ink)' }}>{kindLabel(q.kind)}</span>
                      {personName(q.participantId) && <span style={{ color: 'var(--muted)' }}> · {personName(q.participantId)}</span>}
                      {q.note && <p style={{ color: 'var(--ink)' }}>{q.note}</p>}
                      <p style={{ color: 'var(--faint)' }}>
                        {q.createdBy} · {fmtTime(q.createdAt, lng)}
                        {q.status === 'DONE' && q.resolvedBy ? ` → ${q.resolvedBy} · ${fmtTime(q.resolvedAt, lng)}` : ''}
                      </p>
                    </div>
                    <Pill tone={q.status === 'DONE' ? 'ok' : 'warn'}>{t(q.status === 'DONE' ? 'desk.req.done' : 'desk.req.open')}</Pill>
                  </div>
                  {can('requests') && (
                    <BigButton small tone="plain" disabled={busy} onClick={() => void run(() => deskSetRequestStatus(instanceId, q.id, q.status === 'DONE' ? 'OPEN' : 'DONE'))}>
                      {q.status === 'DONE' ? t('desk.req.reopen') : t('desk.req.mark_done')}
                    </BigButton>
                  )}
                </li>
              ))}
            </ul>
          )}
          {can('requests') && !reqOpen && (
            <BigButton
              tone="plain"
              disabled={busy}
              onClick={() => {
                setError(null)
                setFlash(null)
                setReqOpen(true)
              }}
            >
              <MessageSquarePlus size={20} /> {t('desk.req.add')}
            </BigButton>
          )}
          {can('requests') && reqOpen && (
            <form onSubmit={submitReq} className="flex flex-col gap-3 rounded-[14px] p-3" style={{ background: 'var(--warn-soft)' }}>
              <div className="grid grid-cols-3 gap-2">
                {DESK_REQUEST_KINDS.map((k) => (
                  <BigButton key={k} small tone={reqKind === k ? 'brand' : 'plain'} onClick={() => setReqKind(k)}>
                    {t(`desk.req.kind.${k}`)}
                  </BigButton>
                ))}
              </div>
              <label className="flex flex-col gap-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {t('desk.req.person')}
                <select value={reqPerson} onChange={(e) => setReqPerson(e.target.value)} style={fieldStyle}>
                  <option value="">{t('desk.req.whole')}</option>
                  {reg.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>
                {t('desk.req.note')}
                <textarea value={reqNote} maxLength={500} rows={3} onChange={(e) => setReqNote(e.target.value)} style={{ ...fieldStyle, resize: 'vertical' }} />
              </label>
              <BigButton type="submit" tone="ok" disabled={busy}>
                {busy ? t('desk.common.saving') : t('desk.req.submit')}
              </BigButton>
              <BigButton small tone="plain" disabled={busy} onClick={() => setReqOpen(false)}>
                {t('desk.common.cancel')}
              </BigButton>
            </form>
          )}
        </Block>
      )}
    </div>
  )
}
