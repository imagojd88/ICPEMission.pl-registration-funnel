import { useState, useEffect, useCallback } from 'react'
import { Search, X, ChevronRight, RefreshCw, Copy, ExternalLink, Download, Mail, RotateCcw, Trash2, Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import {
  getAdminInstances,
  getAdminRegistrations,
  markRegistrationPaid,
  patchRegistrationStatus,
  getEventEditConfig,
  getAdminRegistrationDetail,
  restoreRegistration,
  deleteRegistrationPermanently,
  type AdminRegistrationDetail,
} from '@/lib/api'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import {
  buildRegistrationsCsv, registrationsCsvFilename, downloadCsv, csvMoney, registrationStatusLabel,
  uniqueEmails, mailtoOne, mailtoBcc, emailsForClipboard, copyText,
} from '@/lib/registrationsExport'
import type { RegistrationDto, EventInstanceDto, PricingConfig } from '@icpe/shared'
import { DEFAULT_PRICING, addonLines, displayDietary, eventAddons, type AddonDef } from '@icpe/shared'
import DietSummaryPanel from './DietSummaryPanel'
import RegistrationEditForm from './RegistrationEditForm'
import UnfinishedRegistrations from './UnfinishedRegistrations'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { communityDisplay } from '@/lib/communities'
import { countryName } from '@/lib/countries'

function formatUpdatedAt(d: Date): string {
  return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type PayStatus = 'all' | 'PAID' | 'AWAITING_TRANSFER' | 'PENDING' | 'CANCELLED'

function payBadge(r: RegistrationDto) {
  if (r.status === 'CANCELLED') return <Badge variant="muted">Anulowane</Badge>
  // Zgłoszenia bezpłatne (m.in. potwierdzenia z eventów „na zaproszenie", totalPrice 0)
  // nie mają płatności — czerwone „Oczekuje" byłoby fałszywym alarmem.
  if (r.status === 'CONFIRMED' && Number(r.totalPrice) === 0) return <Badge variant="ok">Bezpłatne</Badge>
  if (r.paymentStatus === 'PAID') return <Badge variant="ok">Opłacone</Badge>
  if (r.paymentStatus === 'AWAITING_TRANSFER') return <Badge variant="warn">Oczekuje</Badge>
  if (r.status === 'WAITLIST') return <Badge variant="muted">Lista oczekujących</Badge>
  return <Badge variant="err">Oczekuje</Badge>
}

function payStatusMatch(r: RegistrationDto, filter: PayStatus): boolean {
  if (filter === 'all') return true
  // Anulowane mają własną zakładkę; w „Opłacone / Oczekujące / W toku” ich nie ma.
  if (filter === 'CANCELLED') return r.status === 'CANCELLED'
  if (r.status === 'CANCELLED') return false
  if (filter === 'PAID') return r.paymentStatus === 'PAID'
  if (filter === 'AWAITING_TRANSFER') return r.paymentStatus === 'AWAITING_TRANSFER'
  if (filter === 'PENDING') return r.paymentStatus === 'PENDING' && r.status !== 'WAITLIST'
  return false
}

function resolveTitle(title: unknown): string {
  if (typeof title === 'string') return title
  if (title && typeof title === 'object') {
    const t = title as Record<string, string>
    return t.pl ?? t.en ?? t.it ?? ''
  }
  return ''
}

// ── Registration Drawer ───────────────────────────────────────────────────────

const zl = (n: number, currency = 'PLN') => `${csvMoney(n)} ${currency === 'PLN' ? 'zł' : currency}`
const paidOf = (r: RegistrationDto) => (typeof r.paidAmount === 'number' ? r.paidAmount : r.paymentStatus === 'PAID' ? r.totalPrice ?? 0 : 0)
const remainingOf = (r: RegistrationDto) =>
  typeof r.payment?.remaining === 'number' ? r.payment.remaining : Math.max(0, Math.round(((r.totalPrice ?? 0) - paidOf(r)) * 100) / 100)
const roomSummaryOf = (r: RegistrationDto) => (r as RegistrationDto & { roomSummary?: string }).roomSummary ?? ''

type DrawerDialog = null | 'cancel' | 'restore' | 'delete'

function RegistrationDrawer({
  registration,
  hasRoomTypes,
  addonDefs,
  onClose,
  onMarkPaid,
  onStatusChange,
  onEdit,
  onChanged,
}: {
  registration: RegistrationDto
  /** event ma typy pokoi → edycja zgłoszenia ma sekcję „Pokoje” */
  hasRoomTypes: boolean
  /** dodatki z limitem skonfigurowane w evencie (nazwy do wyświetlenia) */
  addonDefs: AddonDef[]
  onClose: () => void
  onMarkPaid: (id: string) => Promise<void>
  onStatusChange: (id: string, status: string) => Promise<void>
  onEdit: (r: RegistrationDto, section?: 'rooms') => void
  /** po przywróceniu / trwałym usunięciu: odśwież listę (drawer zamyka się sam) */
  onChanged: (message: string) => void
}) {
  const r = registration
  const fullName = `${r.contact.firstName} ${r.contact.lastName}`.trim()
  const cancelled = r.status === 'CANCELLED'
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<DrawerDialog>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [restoreWarnings, setRestoreWarnings] = useState<string[] | null>(null)
  const [deleteWord, setDeleteWord] = useState('')
  const [copied, setCopied] = useState(false)
  // Szczegóły tylko dla admina: link strony gościa, czy zgłoszenie można usunąć trwale.
  const [detail, setDetail] = useState<AdminRegistrationDetail | null>(null)
  const [detailError, setDetailError] = useState(false)

  useEffect(() => {
    let alive = true
    setDetail(null)
    setDetailError(false)
    getAdminRegistrationDetail(r.id)
      .then((d) => { if (alive) setDetail(d) })
      .catch(() => { if (alive) setDetailError(true) })
    return () => { alive = false }
  }, [r.id])

  const paid = detail ? detail.paidAmount : paidOf(r)
  const people = r.participants.length
  const rooms = roomSummaryOf(r)
  const mailHref = mailtoOne(r.contact.email)

  function openDialog(d: DrawerDialog) {
    setDialog(d)
    setDialogError(null)
    setRestoreWarnings(null)
    setDeleteWord('')
  }

  async function handleMarkPaid() {
    setBusy(true)
    setActionError(null)
    try {
      await onMarkPaid(r.id)
      onClose()
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    setBusy(true)
    setDialogError(null)
    try {
      await onStatusChange(r.id, 'CANCELLED')
      onClose()
    } catch (e: unknown) {
      setDialogError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore(force: boolean) {
    setBusy(true)
    setDialogError(null)
    try {
      const res = await restoreRegistration(r.id, force)
      if (!res.ok && res.needsConfirm) {
        // Brakuje miejsc albo pokoi — nic nie zmieniono; admin decyduje, czy przywrócić mimo to.
        setRestoreWarnings(res.warnings)
        return
      }
      onChanged(`Przywrócono zgłoszenie: ${fullName} — status „${registrationStatusLabel(res.internalStatus)}”. Gość nie dostał maila.`)
    } catch (e: unknown) {
      setDialogError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleDeletePermanently() {
    setBusy(true)
    setDialogError(null)
    try {
      await deleteRegistrationPermanently(r.id, deleteWord.trim())
      onChanged(`Usunięto trwale zgłoszenie: ${fullName}.`)
    } catch (e: unknown) {
      setDialogError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleCopyLink() {
    if (!detail) return
    setCopied(await copyText(detail.manageUrl))
    window.setTimeout(() => setCopied(false), 2500)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.35)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full z-50 overflow-y-auto flex flex-col"
        style={{
          width: 430,
          maxWidth: '100vw',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.14)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-6 py-5 sticky top-0"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', zIndex: 1 }}
        >
          <div>
            <p className="font-bold text-sm" style={{ color: 'var(--faint)' }}>
              Zgłoszenie
            </p>
            <p className="font-bold text-base mt-0.5" style={{ color: 'var(--ink)' }}>
              {r.id}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {payBadge(r)}
            <button
              onClick={onClose}
              aria-label="Zamknij"
              className="p-1.5 rounded-[8px] hover:bg-[var(--surface-2)] transition-colors"
              style={{ color: 'var(--faint)' }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 py-5 flex flex-col gap-6">
          {cancelled && (
            <div className="px-4 py-3 rounded-[12px] text-sm" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
              <strong>Zgłoszenie anulowane.</strong> Nie zajmuje miejsc ani pokoi i nie ma go w „Płatnościach” ani na Recepcji. Można je przywrócić przyciskiem na dole.
            </div>
          )}

          {/* Kontakt */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--faint)' }}>
              Kontakt
            </p>
            <div className="flex flex-col gap-2">
              {[
                { label: 'Imię i nazwisko', value: fullName },
                { label: 'E-mail', value: r.contact.email },
                { label: 'Telefon', value: r.contact.phone ?? '—' },
                // Pola dodatkowe — tylko gdy wypełnione.
                ...(r.contact.address ? [{ label: 'Adres', value: r.contact.address }] : []),
                ...(r.contact.countryCode ? [{ label: 'Kraj zamieszkania', value: `${countryName(r.contact.countryCode, 'pl')} (${r.contact.countryCode})` }] : []),
                ...(r.contact.parish ? [{ label: 'Parafia', value: r.contact.parish }] : []),
                ...(r.contact.community ? [{ label: 'Wspólnota', value: communityDisplay(r.contact) }] : []),
              ].map((item) => (
                <div key={item.label} className="flex items-start justify-between gap-2">
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>{item.label}</span>
                  <span className="text-sm font-medium text-right" style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>{item.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Uczestnicy */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--faint)' }}>
              Uczestnicy ({r.participants.length})
            </p>
            <ul className="flex flex-col gap-2">
              {r.participants.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-sm px-3 py-2 rounded-[10px]"
                  style={{ background: 'var(--surface-2)' }}
                >
                  <span style={{ color: 'var(--ink)' }}>
                    {p.firstName} {p.lastName}
                    {displayDietary(p.dietary) && (
                      <span className="block text-xs" style={{ color: 'var(--warn)' }}>dieta: {displayDietary(p.dietary)}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--faint)', fontSize: 12 }}>{p.age} l.</span>
                    <Badge variant={p.type === 'adult' ? 'brand' : 'muted'}>
                      {p.type === 'adult' ? 'Dorosły' : 'Dziecko'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Dodatki z limitem (np. dostawka, łóżeczko turystyczne) */}
          {addonLines(addonDefs, r.options?.addons).length > 0 && (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--faint)' }}>Dodatki</p>
              <ul className="flex flex-col gap-1.5">
                {addonLines(addonDefs, r.options?.addons).map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-[10px]" style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>
                    <span>{a.name}{a.qty > 1 ? ` × ${a.qty}` : ''}</span>
                    {r.options?.addonsAt?.[a.id] && (
                      <span className="text-xs" style={{ color: 'var(--faint)' }}>zamówiono {new Date(r.options.addonsAt[a.id]).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs mt-1.5" style={{ color: 'var(--faint)' }}>Zmiana: „Edytuj zgłoszenie”. Kolejność i limity: „Diety i dodatki” nad listą.</p>
            </section>
          )}

          {/* Grid: pokój + kwota */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className="p-3 rounded-[10px]"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <p className="text-xs" style={{ color: 'var(--faint)' }}>Pokój</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--ink)' }}>
                {r.assignedRoom ?? '—'}
              </p>
            </div>
            <div
              className="p-3 rounded-[10px]"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
            >
              <p className="text-xs" style={{ color: 'var(--faint)' }}>Kwota</p>
              <p className="text-sm font-semibold mt-0.5" style={{ color: 'var(--ink)' }}>
                {r.totalPrice} {r.currency}
              </p>
              {(r.totalPrice ?? 0) > 0 && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>wpłacono {zl(paid, r.currency)}</p>
              )}
            </div>
          </div>

          {/* Strona gościa: adres z tokenem widzi tylko zalogowany admin */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--faint)' }}>
              Strona gościa
            </p>
            {detail ? (
              <div className="flex flex-col gap-2">
                <input
                  readOnly
                  value={detail.manageUrl}
                  aria-label="Adres strony gościa"
                  onFocus={(e) => e.currentTarget.select()}
                  className="rounded-[10px] border px-3 py-2 text-xs font-mono w-full"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" variant="outline" type="button" onClick={() => { void handleCopyLink() }}>
                    <Copy size={14} /> {copied ? 'Skopiowano' : 'Kopiuj link'}
                  </Button>
                  <a
                    href={detail.manageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 font-semibold h-8 px-3 text-sm rounded-[10px] border hover:bg-[var(--surface-2)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                  >
                    <ExternalLink size={14} /> Otwórz
                  </a>
                </div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  To ten sam adres, który gość ma w mailach: stan zgłoszenia, wpłaty i płatność online. Kto zna ten link, widzi zgłoszenie — wysyłaj go tylko zgłaszającemu.
                </p>
              </div>
            ) : (
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {detailError ? 'Nie udało się pobrać linku (serwer może czekać na wdrożenie nowej wersji API).' : 'Wczytuję link…'}
              </p>
            )}
          </section>

          {/* Historia */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--faint)' }}>
              Historia
            </p>
            <div className="flex flex-col gap-0">
              {[
                { label: 'Zgłoszono', time: new Date(r.createdAt).toLocaleString('pl-PL'), ok: true },
                { label: 'Wysłano potwierdzenie', time: 'automatycznie', ok: true },
                cancelled
                  ? { label: 'Anulowano', time: 'zgłoszenie nieaktywne', ok: false }
                  : {
                      label: r.paymentStatus === 'PAID' ? 'Opłacono' : 'Oczekuje na płatność',
                      time: r.paymentStatus === 'PAID' ? 'potwierdzono' : 'w toku',
                      ok: r.paymentStatus === 'PAID',
                    },
              ].map((ev, i, arr) => (
                <div key={ev.label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className="rounded-full mt-1"
                      style={{
                        width: 10,
                        height: 10,
                        background: ev.ok ? 'var(--ok)' : 'var(--border)',
                        flexShrink: 0,
                      }}
                    />
                    {i < arr.length - 1 && (
                      <div style={{ width: 2, flex: 1, background: 'var(--border)', minHeight: 24 }} />
                    )}
                  </div>
                  <div className="pb-4">
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{ev.label}</p>
                    <p className="text-xs" style={{ color: 'var(--faint)' }}>{ev.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {actionError && (
            <div
              className="px-4 py-3 rounded-[12px] text-sm"
              style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}
            >
              {actionError}
            </div>
          )}
        </div>

        {/* Actions footer */}
        <div
          className="px-6 py-4 flex flex-col gap-2 sticky bottom-0"
          style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)' }}
        >
          {cancelled ? (
            <>
              <Button size="sm" variant="default" onClick={() => openDialog('restore')} disabled={busy}>
                <RotateCcw size={14} /> Przywróć zgłoszenie
              </Button>
              <div className="grid grid-cols-2 gap-2">
                {mailHref ? (
                  <a href={mailHref} className="inline-flex items-center justify-center gap-2 font-semibold h-8 px-3 text-sm rounded-[10px] border hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }} title="Otwiera Twój program pocztowy z adresem gościa — panel niczego nie wysyła">
                    <Mail size={14} /> Napisz e-mail
                  </a>
                ) : <span />}
                {detail?.canDeletePermanently && (
                  <Button size="sm" variant="destructive" onClick={() => openDialog('delete')} disabled={busy}>
                    <Trash2 size={14} /> Usuń trwale
                  </Button>
                )}
              </div>
              {detail && !detail.canDeletePermanently && detail.deleteBlocker === 'REAL_PAYMENTS' && (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Tego zgłoszenia nie da się usunąć trwale — ma wpłaty, które nie są testowe.
                </p>
              )}
            </>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => onEdit(r)}>
                Edytuj zgłoszenie
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="default"
                  style={{ background: 'var(--ok)' }}
                  onClick={() => { void handleMarkPaid() }}
                  disabled={busy || r.paymentStatus === 'PAID'}
                >
                  {busy && !dialog ? 'Zapisuję...' : 'Oznacz opłacone'}
                </Button>
                {hasRoomTypes ? (
                  <Button size="sm" variant="outline" onClick={() => onEdit(r, 'rooms')} title="Otwiera edycję zgłoszenia na sekcji „Pokoje”">
                    Zmień pokoje
                  </Button>
                ) : <span />}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {mailHref ? (
                  <a href={mailHref} className="inline-flex items-center justify-center gap-2 font-semibold h-8 px-3 text-sm rounded-[10px] border hover:bg-[var(--surface-2)]" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }} title="Otwiera Twój program pocztowy z adresem gościa — panel niczego nie wysyła">
                    <Mail size={14} /> Napisz e-mail
                  </a>
                ) : <span />}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => openDialog('cancel')}
                  disabled={busy}
                >
                  Anuluj zgłoszenie
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Potwierdzenie anulowania */}
      {dialog === 'cancel' && (
        <ConfirmDialog
          title="Anulować zgłoszenie?"
          confirmLabel="Anuluj zgłoszenie"
          cancelLabel="Nie anuluj"
          tone="danger"
          busy={busy}
          busyLabel="Anuluję…"
          error={dialogError}
          onConfirm={() => { void handleCancel() }}
          onClose={() => setDialog(null)}
        >
          <p>
            <strong>{fullName}</strong> · {r.contact.email} · {people} {people === 1 ? 'osoba' : 'os.'} · {zl(r.totalPrice ?? 0, r.currency)}
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-1">
            <li>Zgłoszenie dostanie status „Anulowane” i zniknie z „Płatności”, „Zakwaterowania”, „Obecności”, Recepcji i przypomnień o ratach.</li>
            <li>Zwalnia się miejsce w limicie osób ({people} {people === 1 ? 'miejsce' : 'miejsc(a)'}){rooms ? <> oraz pokoje w limicie pokoi: {rooms}</> : null}. Wpisany numer pokoju zostaje przy zgłoszeniu.</li>
            <li><strong>Gość nie dostanie żadnego maila</strong> — anulowanie niczego nie wysyła. Jeśli trzeba, napisz do niego samodzielnie.</li>
            <li>Dostęp do kursu „Formacji online” nadany z tego zgłoszenia zostanie odebrany.</li>
          </ul>
          {paid > 0 ? (
            <p className="px-3 py-2.5 rounded-[10px]" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}>
              Zaksięgowane wpłaty: <strong>{zl(paid, r.currency)}</strong>. Anulowanie <strong>niczego nie zwraca</strong> — wpłaty zostają zapisane przy zgłoszeniu. Zwrot wpłaty Tpay zleca się w „Płatnościach”, a anulowanych zgłoszeń tam nie widać: jeśli chcesz zwrócić pieniądze, zrób to <strong>przed</strong> anulowaniem (albo przywróć zgłoszenie, zwróć i anuluj ponownie).
            </p>
          ) : (
            <p style={{ color: 'var(--muted)' }}>To zgłoszenie nie ma zaksięgowanych wpłat.</p>
          )}
          <p style={{ color: 'var(--muted)' }}>Anulowane zgłoszenie można przywrócić („Anulowane” ▸ „Przywróć zgłoszenie”).</p>
        </ConfirmDialog>
      )}

      {/* Przywracanie */}
      {dialog === 'restore' && (
        <ConfirmDialog
          title={restoreWarnings ? 'Brakuje miejsca — przywrócić mimo to?' : 'Przywrócić zgłoszenie?'}
          confirmLabel={restoreWarnings ? 'Przywróć mimo to' : 'Przywróć zgłoszenie'}
          tone={restoreWarnings ? 'danger' : 'default'}
          busy={busy}
          busyLabel="Przywracam…"
          error={dialogError}
          onConfirm={() => { void handleRestore(!!restoreWarnings) }}
          onClose={() => setDialog(null)}
        >
          <p>
            <strong>{fullName}</strong> · {people} {people === 1 ? 'osoba' : 'os.'}{rooms ? ` · ${rooms}` : ''}
          </p>
          {restoreWarnings ? (
            <>
              <ul className="list-disc pl-5 flex flex-col gap-1 px-3 py-2.5 rounded-[10px]" style={{ background: 'var(--err-soft)', border: '1px solid var(--err)', color: 'var(--ink)' }}>
                {restoreWarnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
              <p>Nic jeszcze nie zostało zmienione. Możesz przywrócić zgłoszenie mimo przekroczonego limitu (np. gdy miejsce jest ustalone z ośrodkiem) albo zamknąć okno.</p>
            </>
          ) : (
            <ul className="list-disc pl-5 flex flex-col gap-1">
              <li>Status wróci zgodnie ze stanem wpłat: opłacony zadatek (albo całość, gdy event nie ma harmonogramu) → „Potwierdzone”, inaczej „Oczekuje na wpłatę”. Zgłoszenie z listy rezerwowej wraca na listę rezerwową.</li>
              <li>Zgłoszenie znów zajmie miejsca i pokoje. Gdy ich brakuje, zobaczysz ostrzeżenie i zdecydujesz.</li>
              <li>Gość nie dostanie maila o przywróceniu (wyjątek: pierwszy mail powitalny kursu „Formacji online”, jeśli event daje dostęp do kursu, a gość go jeszcze nie dostał).</li>
            </ul>
          )}
        </ConfirmDialog>
      )}

      {/* Trwałe usunięcie (dane testowe) */}
      {dialog === 'delete' && (
        <ConfirmDialog
          title="Usunąć zgłoszenie trwale?"
          confirmLabel="Usuń trwale"
          tone="danger"
          busy={busy}
          busyLabel="Usuwam…"
          confirmDisabled={deleteWord.trim() !== 'USUŃ'}
          error={dialogError}
          onConfirm={() => { void handleDeletePermanently() }}
          onClose={() => setDialog(null)}
        >
          <p>
            <strong>{fullName}</strong> · {r.contact.email} · zgłoszenie {r.id}
          </p>
          <p className="px-3 py-2.5 rounded-[10px]" style={{ background: 'var(--err-soft)', border: '1px solid var(--err)' }}>
            Operacja jest <strong>trwała i nieodwracalna</strong>. Znikają: zgłoszenie, uczestnicy, {detail && detail.payments.testCount > 0 ? <>wpłaty testowe Tpay ({detail.payments.testCount}) z próbami płatności i zwrotami, </> : null}prośby i wpisy Recepcji oraz wpisy dziennika maili tego zgłoszenia. Nie będzie czego przywracać.
          </p>
          <p style={{ color: 'var(--muted)' }}>
            Przycisk służy do sprzątania danych testowych. Serwer usunie zgłoszenie tylko wtedy, gdy jest anulowane i nie ma żadnej prawdziwej wpłaty.
          </p>
          <label className="flex flex-col gap-1">
            Aby potwierdzić, wpisz słowo USUŃ
            <input
              value={deleteWord}
              onChange={(e) => setDeleteWord(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="rounded-[10px] border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}
            />
          </label>
        </ConfirmDialog>
      )}
    </>
  )
}

// ── RegistrationsScreen ───────────────────────────────────────────────────────

const FILTER_TABS: { id: PayStatus; label: string }[] = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'PAID', label: 'Opłacone' },
  { id: 'AWAITING_TRANSFER', label: 'Oczekujące' },
  { id: 'PENDING', label: 'W toku' },
  { id: 'CANCELLED', label: 'Anulowane' },
]

/** Zgłoszenia, które zbiorcze „Oznacz opłacone” zaksięguje; reszta jest pomijana z podanym powodem. */
function bulkPaidPlan(list: RegistrationDto[]) {
  const todo: RegistrationDto[] = []
  const skipped = { cancelled: 0, paid: 0, free: 0, waitlist: 0 }
  for (const r of list) {
    if (r.status === 'CANCELLED') skipped.cancelled += 1
    else if ((r.totalPrice ?? 0) <= 0) skipped.free += 1
    else if (r.paymentStatus === 'PAID' || remainingOf(r) <= 0) skipped.paid += 1
    else if (r.status === 'WAITLIST') skipped.waitlist += 1
    else todo.push(r)
  }
  const amount = Math.round(todo.reduce((sum, r) => sum + remainingOf(r), 0) * 100) / 100
  return { todo, skipped, skippedCount: skipped.cancelled + skipped.paid + skipped.free + skipped.waitlist, amount }
}

function skippedText(s: { cancelled: number; paid: number; free: number; waitlist: number }): string {
  return [
    s.paid ? `${s.paid} już opłaconych` : '',
    s.cancelled ? `${s.cancelled} anulowanych` : '',
    s.free ? `${s.free} bezpłatnych` : '',
    s.waitlist ? `${s.waitlist} z listy rezerwowej (oznacz pojedynczo)` : '',
  ].filter(Boolean).join(', ')
}

export default function RegistrationsScreen() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PayStatus>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openDrawer, setOpenDrawer] = useState<RegistrationDto | null>(null)
  const [editing, setEditing] = useState<RegistrationDto | null>(null)
  const [editSection, setEditSection] = useState<'rooms' | undefined>(undefined)
  // Operacje zbiorcze: okno potwierdzenia „Oznacz opłacone”, okno adresów e-mail, komunikat o wyniku.
  const [bulkPaidOpen, setBulkPaidOpen] = useState(false)
  const [bulkPaidBusy, setBulkPaidBusy] = useState(false)
  const [bulkPaidProgress, setBulkPaidProgress] = useState(0)
  const [bulkMailOpen, setBulkMailOpen] = useState(false)
  const [emailsCopied, setEmailsCopied] = useState<boolean | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(DEFAULT_PRICING)
  // Sekcja „Diety i dodatki” (zestawienie dla ośrodka) — zwijana, żeby nie zasłaniać listy.
  const [dietsOpen, setDietsOpen] = useState(false)

  const [instances, setInstances] = useState<EventInstanceDto[]>([])
  const [selectedInstanceId, setSelectedInstanceId] = useState<string>('')
  const [regs, setRegs] = useState<RegistrationDto[]>([])
  const [loadingInstances, setLoadingInstances] = useState(true)
  const [loadingRegs, setLoadingRegs] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load instances once
  useEffect(() => {
    setLoadingInstances(true)
    getAdminInstances()
      .then((list) => {
        setInstances(list)
        // Domyślnie pierwszy event spoza archiwum (zarchiwizowane zostają na liście wyboru, oznaczone „ARCHIWUM”).
        if (list.length > 0) setSelectedInstanceId((list.find((i) => !i.archived) ?? list[0]).id)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingInstances(false))
  }, [])

  // Load registrations when instance changes. `silent` (odświeżanie w tle) nie rusza
  // `loadingRegs` — dane są podmieniane bez migotania spinnera/skeletonu.
  const loadRegs = useCallback((instanceId: string, silent = false) => {
    if (!instanceId) return Promise.resolve()
    if (!silent) setLoadingRegs(true)
    setError(null)
    return getAdminRegistrations(instanceId)
      .then(setRegs)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e))
        if (!silent) setRegs([])
      })
      .finally(() => {
        if (!silent) setLoadingRegs(false)
      })
  }, [])

  useEffect(() => {
    // Zaznaczenie dotyczy jednego eventu — po zmianie eventu zaczynamy od zera.
    setSelected(new Set())
    setNotice(null)
    if (selectedInstanceId) void loadRegs(selectedInstanceId)
  }, [selectedInstanceId, loadRegs])

  // Auto-odświeżanie w tle. Wstrzymane, gdy admin ma otwarty drawer zgłoszenia lub
  // formularz edycji — nie chcemy podmieniać danych pod ręką kogoś, kto właśnie edytuje.
  const { lastUpdatedAt, refreshing, refreshNow } = useAutoRefresh(
    () => loadRegs(selectedInstanceId, true),
    { intervalMs: 20000, enabled: !openDrawer && !editing && !bulkPaidOpen && !bulkMailOpen },
  )

  // Konfiguracja cennika instancji (do edycji zgłoszeń — typy pokoi, opcje, przeliczenie).
  useEffect(() => {
    const inst = instances.find((i) => i.id === selectedInstanceId)
    const slug = (inst as { slug?: string } | undefined)?.slug
    if (!slug) return
    getEventEditConfig(slug)
      .then((cfg) => setPricingConfig(cfg.pricingConfig ?? DEFAULT_PRICING))
      .catch(() => setPricingConfig(DEFAULT_PRICING))
  }, [selectedInstanceId, instances])

  async function handleMarkPaid(id: string) {
    await markRegistrationPaid(id)
    loadRegs(selectedInstanceId)
  }

  async function handleStatusChange(id: string, status: string) {
    await patchRegistrationStatus(id, status)
    loadRegs(selectedInstanceId)
  }

  const filtered = regs.filter((r) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      r.contact.firstName.toLowerCase().includes(q) ||
      r.contact.lastName.toLowerCase().includes(q) ||
      r.contact.email.toLowerCase().includes(q) ||
      (r.contact.community ?? '').toLowerCase().includes(q) ||
      (r.contact.parish ?? '').toLowerCase().includes(q)
    return matchSearch && payStatusMatch(r, statusFilter)
  })

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (filtered.length > 0 && filtered.every((r) => selected.has(r.id))) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((r) => r.id)))
    }
  }

  const allSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id))

  // Zaznaczone zgłoszenia — z pełnej listy eventu (zaznaczenie przeżywa zmianę filtra i wyszukiwania).
  const selectedRegs = regs.filter((r) => selected.has(r.id))
  const currentInstance = instances.find((i) => i.id === selectedInstanceId)
  const eventTitle = currentInstance ? resolveTitle(currentInstance.title) : ''
  const hasRoomTypes = (pricingConfig.rooms ?? []).length > 0
  const addonDefs = eventAddons(pricingConfig)
  const bulkPlan = bulkPaidPlan(selectedRegs)
  const bulkEmails = uniqueEmails(selectedRegs.filter((r) => r.status !== 'CANCELLED'))
  const bulkEmailsSkipped = selectedRegs.length - bulkEmails.length
  const bulkMailto = mailtoBcc(bulkEmails)

  /** CSV w przeglądarce: zaznaczone zgłoszenia albo — bez zaznaczenia — wszystkie z bieżącego filtra. */
  function exportCsv(list: RegistrationDto[], what: string) {
    if (list.length === 0) return
    downloadCsv(registrationsCsvFilename(eventTitle), buildRegistrationsCsv(list, addonDefs))
    setNotice({ tone: 'ok', text: `Pobrano plik CSV: ${list.length} zgłoszeń (${what}).` })
  }

  /** Zbiorcze „Oznacz opłacone”: ta sama operacja co przy jednym zgłoszeniu, po kolei dla każdego. */
  async function runBulkPaid() {
    const plan = bulkPaidPlan(selectedRegs)
    setBulkPaidBusy(true)
    setBulkPaidProgress(0)
    let done = 0
    let amount = 0
    const errors: string[] = []
    for (const r of plan.todo) {
      try {
        await markRegistrationPaid(r.id)
        done += 1
        amount += remainingOf(r)
      } catch (e: unknown) {
        errors.push(`${r.contact.firstName} ${r.contact.lastName}: ${e instanceof Error ? e.message : String(e)}`)
      }
      setBulkPaidProgress((n) => n + 1)
    }
    setBulkPaidBusy(false)
    setBulkPaidOpen(false)
    setSelected(new Set())
    const skippedInfo = plan.skippedCount ? ` Pominięto ${plan.skippedCount}: ${skippedText(plan.skipped)}.` : ''
    setNotice({
      tone: errors.length ? 'warn' : 'ok',
      text: `Oznaczono jako opłacone: ${done} zgłoszeń, zaksięgowano ${zl(Math.round(amount * 100) / 100)}.${skippedInfo}${errors.length ? ` Błędy (${errors.length}): ${errors.join('; ')}` : ''}`,
    })
    void loadRegs(selectedInstanceId)
  }

  async function copyBulkEmails() {
    setEmailsCopied(await copyText(emailsForClipboard(bulkEmails)))
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Instance selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          Event:
        </label>
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
              <option key={inst.id} value={inst.id}>
                {resolveTitle(inst.title)} ({inst.archived ? 'ARCHIWUM' : inst.status})
              </option>
            ))}
          </select>
        )}

        {selectedInstanceId && (
          <button
            type="button"
            onClick={() => setDietsOpen((v) => !v)}
            aria-expanded={dietsOpen}
            className="text-sm font-medium px-3 py-2 rounded-[12px]"
            style={{
              background: dietsOpen ? 'var(--brand-soft)' : 'var(--surface)',
              color: dietsOpen ? 'var(--brand)' : 'var(--ink)',
              border: `1px solid ${dietsOpen ? 'var(--brand)' : 'var(--border)'}`,
              cursor: 'pointer',
            }}
          >
            {dietsOpen ? 'Ukryj: Diety i dodatki' : 'Diety i dodatki'}
          </button>
        )}

        {/* Wskaźnik odświeżania */}
        <div className="flex items-center gap-2 ml-auto">
          {lastUpdatedAt && (
            <span className="text-xs" style={{ color: 'var(--faint)' }}>
              Zaktualizowano {formatUpdatedAt(lastUpdatedAt)}
            </span>
          )}
          <button
            type="button"
            onClick={() => { void refreshNow() }}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-[8px]"
            style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} /> Odśwież
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="px-4 py-3 rounded-[12px] text-sm"
          style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}
        >
          {error}
        </div>
      )}

      {notice && (
        <div className="px-4 py-3 rounded-[12px] text-sm flex items-start gap-3" role="status" style={notice.tone === 'ok' ? { background: 'var(--ok-soft)', color: 'var(--ok)', border: '1px solid var(--ok)' } : { background: 'var(--warn-soft)', color: 'var(--ink)', border: '1px solid var(--warn)' }}>
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs font-semibold" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>zamknij</button>
        </div>
      )}

      {/* Diety i dodatki — zestawienie dla ośrodka (liczy z listy zgłoszeń tego eventu) */}
      {dietsOpen && selectedInstanceId && (
        <DietSummaryPanel
          regs={regs}
          pricingConfig={pricingConfig}
          eventTitle={eventTitle}
          startsAt={currentInstance?.startsAt}
          endsAt={currentInstance?.endsAt}
          location={currentInstance?.location}
          onOpen={(r) => setOpenDrawer(r)}
        />
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div
          className="flex items-center gap-2 px-3 rounded-[12px] border"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            height: 40,
            minWidth: 260,
          }}
        >
          <Search size={15} style={{ color: 'var(--faint)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj zgłoszeń..."
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: 'var(--ink)' }}
          />
        </div>

        {/* Status tabs */}
        <div
          className="flex items-center gap-1 p-1 rounded-[12px]"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className="px-3 py-1.5 rounded-[9px] text-sm font-medium transition-all duration-150"
              style={
                statusFilter === tab.id
                  ? { background: 'var(--surface)', color: 'var(--brand)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                  : { color: 'var(--muted)' }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Eksport bez zaznaczenia = wszystkie zgłoszenia z bieżącego filtra i wyszukiwania */}
        {selectedRegs.length === 0 && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={filtered.length === 0}
            onClick={() => exportCsv(filtered, 'bieżący filtr')}
            title="Pobiera plik CSV (otwiera się w Excelu) ze wszystkimi zgłoszeniami z bieżącego filtra"
          >
            <Download size={14} /> Eksport CSV ({filtered.length})
          </Button>
        )}
      </div>

      {/* Bulk bar */}
      {selectedRegs.length > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 rounded-[12px] border"
          style={{ background: 'var(--brand-soft)', borderColor: 'var(--brand)' }}
        >
          <span className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
            {selectedRegs.length} zaznaczono
          </span>
          <div className="flex gap-2 ml-2 flex-wrap">
            <Button size="sm" variant="outline" style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }} onClick={() => { setBulkPaidProgress(0); setBulkPaidOpen(true) }}>
              <Check size={14} /> Oznacz opłacone…
            </Button>
            <Button size="sm" variant="outline" style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }} onClick={() => { setEmailsCopied(null); setBulkMailOpen(true) }} title="Adresy zaznaczonych do Twojego programu pocztowego — panel niczego nie wysyła">
              <Mail size={14} /> Napisz e-mail…
            </Button>
            <Button size="sm" variant="outline" style={{ borderColor: 'var(--brand)', color: 'var(--brand)' }} onClick={() => exportCsv(selectedRegs, 'zaznaczone')} title="Pobiera plik CSV z zaznaczonymi zgłoszeniami">
              <Download size={14} /> Eksport CSV
            </Button>
          </div>
          <button
            className="ml-auto p-1"
            aria-label="Wyczyść zaznaczenie"
            title="Wyczyść zaznaczenie"
            onClick={() => setSelected(new Set())}
            style={{ color: 'var(--brand)' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-[15px] border overflow-hidden"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}
      >
        {loadingRegs ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--faint)' }}>Ładowanie zgłoszeń...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm" style={{ color: 'var(--faint)' }}>
              {regs.length === 0 ? 'Brak zgłoszeń dla tego eventu.' : 'Brak zgłoszeń pasujących do filtrów.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="accent-[var(--brand)] w-4 h-4"
                    />
                  </th>
                  {['Zgłaszający', 'Osoby', 'Pokój', 'Kwota', 'Płatność', ''].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-xs font-semibold"
                      style={{ color: 'var(--faint)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                    style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border-2)' : undefined, opacity: r.status === 'CANCELLED' ? 0.6 : 1 }}
                    onClick={() => setOpenDrawer(r)}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="accent-[var(--brand)] w-4 h-4"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium" style={{ color: 'var(--ink)' }}>
                        {r.contact.firstName} {r.contact.lastName}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--faint)' }}>{r.contact.email}</p>
                      {(r.contact.community || r.contact.parish) && (
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>
                          {r.contact.community ? communityDisplay(r.contact) : r.contact.parish}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center" style={{ color: 'var(--ink)' }}>
                      {r.participants.length}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--muted)' }}>
                      {r.assignedRoom ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--ink)' }}>
                      {r.totalPrice} zł
                    </td>
                    <td className="px-4 py-3">{payBadge(r)}</td>
                    <td className="px-4 py-3">
                      <ChevronRight size={15} style={{ color: 'var(--faint)' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer — lista nie jest stronicowana (całość eventu naraz), więc bez strzałek stron */}
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Pokazano {filtered.length} z {regs.length}
        {regs.some((r) => r.status === 'CANCELLED') ? ` · w tym anulowane: ${regs.filter((r) => r.status === 'CANCELLED').length} (zakładka „Anulowane”)` : ''}
      </p>

      {/* Rozpoczęte, niedokończone (przypomnienie po 3 h) */}
      {selectedInstanceId && <UnfinishedRegistrations instanceId={selectedInstanceId} refreshKey={lastUpdatedAt} />}

      {/* Drawer */}
      {openDrawer && (
        <RegistrationDrawer
          registration={openDrawer}
          hasRoomTypes={hasRoomTypes}
          addonDefs={addonDefs}
          onClose={() => setOpenDrawer(null)}
          onMarkPaid={handleMarkPaid}
          onStatusChange={handleStatusChange}
          onEdit={(r, section) => { setOpenDrawer(null); setEditSection(section); setEditing(r) }}
          onChanged={(message) => {
            setOpenDrawer(null)
            setSelected((prev) => { const next = new Set(prev); next.delete(openDrawer.id); return next })
            setNotice({ tone: 'ok', text: message })
            void loadRegs(selectedInstanceId)
          }}
        />
      )}

      {/* Edycja zgłoszenia */}
      {editing && (
        <RegistrationEditForm
          registration={editing}
          pricingConfig={pricingConfig}
          focusSection={editSection}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadRegs(selectedInstanceId) }}
        />
      )}

      {/* Zbiorcze „Oznacz opłacone” — potwierdzenie z liczbą zgłoszeń i łączną kwotą */}
      {bulkPaidOpen && (
        <ConfirmDialog
          title="Oznaczyć zaznaczone jako opłacone?"
          confirmLabel={bulkPlan.todo.length > 0 ? `Zaksięguj ${zl(bulkPlan.amount)} (${bulkPlan.todo.length})` : undefined}
          tone="ok"
          busy={bulkPaidBusy}
          busyLabel={`Księguję… ${bulkPaidProgress} / ${bulkPlan.todo.length}`}
          onConfirm={() => { void runBulkPaid() }}
          onClose={() => setBulkPaidOpen(false)}
        >
          {bulkPlan.todo.length > 0 ? (
            <>
              <p>
                Zaksięguję brakującą resztę dla <strong>{bulkPlan.todo.length}</strong> zgłoszeń — łącznie <strong>{zl(bulkPlan.amount)}</strong>.
                Każde dostanie wpłatę „oznaczone jako opłacone” (przelew) na swoją pozostałą kwotę i status „Potwierdzone”.
              </p>
              <ul className="flex flex-col gap-0.5 text-xs rounded-[10px] px-3 py-2" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', maxHeight: 180, overflowY: 'auto' }}>
                {bulkPlan.todo.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3">
                    <span>{r.contact.firstName} {r.contact.lastName}</span>
                    <strong>{zl(remainingOf(r), r.currency)}</strong>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Wśród zaznaczonych nie ma zgłoszeń do zaksięgowania.</p>
          )}
          {bulkPlan.skippedCount > 0 && (
            <p style={{ color: 'var(--muted)' }}>Pominę {bulkPlan.skippedCount}: {skippedText(bulkPlan.skipped)}.</p>
          )}
          {bulkPlan.todo.length > 0 && (
            <p style={{ color: 'var(--muted)' }}>
              Gość nie dostaje maila. Błędnie zaksięgowanej reszty nie cofa się jednym kliknięciem — sprawdź listę przed potwierdzeniem.
            </p>
          )}
        </ConfirmDialog>
      )}

      {/* Zbiorczy e-mail — tylko adresy do programu pocztowego admina, serwer niczego nie wysyła */}
      {bulkMailOpen && (
        <ConfirmDialog title="E-mail do zaznaczonych" onClose={() => setBulkMailOpen(false)}>
          <p>
            Panel <strong>nie wysyła</strong> tej wiadomości — otwiera Twój program pocztowy albo kopiuje adresy. Adresów: <strong>{bulkEmails.length}</strong>
            {bulkEmailsSkipped > 0 ? ` (pominięto ${bulkEmailsSkipped}: anulowane, powtórzone albo bez poprawnego adresu)` : ''}.
          </p>
          {bulkEmails.length > 0 ? (
            <>
              <textarea
                readOnly
                value={emailsForClipboard(bulkEmails)}
                rows={4}
                aria-label="Adresy e-mail zaznaczonych zgłoszeń"
                onFocus={(e) => e.currentTarget.select()}
                className="rounded-[10px] border px-3 py-2 text-xs font-mono w-full"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Button type="button" size="sm" variant="default" onClick={() => { void copyBulkEmails() }}>
                  <Copy size={14} /> {emailsCopied ? 'Skopiowano' : 'Kopiuj adresy'}
                </Button>
                <a
                  href={bulkMailto.href}
                  className="inline-flex items-center justify-center gap-2 font-semibold h-8 px-3 text-sm rounded-[10px] border hover:bg-[var(--surface-2)]"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                >
                  <Mail size={14} /> Otwórz program pocztowy (adresy w UDW)
                </a>
              </div>
              {emailsCopied === false && <p style={{ color: 'var(--err)' }}>Nie udało się skopiować — zaznacz adresy w polu powyżej i skopiuj ręcznie.</p>}
              {bulkMailto.tooLong && (
                <p className="px-3 py-2.5 rounded-[10px]" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}>
                  Lista jest długa ({bulkEmails.length} adresów) — program pocztowy może nie otworzyć wiadomości albo uciąć adresy. Bezpieczniej: „Kopiuj adresy” i wklej je w pole <strong>UDW</strong> nowej wiadomości.
                </p>
              )}
              <p style={{ color: 'var(--muted)' }}>
                Adresy trafiają do pola UDW (ukryta kopia), żeby goście nie widzieli adresów pozostałych. Skopiowane adresy też wklejaj w UDW, nie w „Do”.
              </p>
            </>
          ) : (
            <p>Żadne z zaznaczonych zgłoszeń nie ma poprawnego adresu e-mail.</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}
