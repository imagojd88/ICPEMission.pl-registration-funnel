import { useCallback, useEffect, useState } from 'react'
import { Check, Clock, Copy, Mail, MessageCircle, Plus, RefreshCw, Send, Trash2, Users } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import {
  createInvitations,
  deleteInvitation,
  listInvitations,
  sendAllInvitations,
  sendInvitation,
  syncInvitationRegistrations,
  type InvitationItem,
} from '@/lib/api'

/** Fallback bazy linków — API zwraca gotowy `link`, to tylko awaryjnie. */
const PUBLIC_BASE = typeof window !== 'undefined' ? window.location.origin : 'https://rejestracja.icpemission.pl'

/** Serwer odpowiedział „zalogowano zamiast wysłać" → wyłączony SMTP na backendzie. */
const MAIL_OFF_HINT =
  'Mail NIE został wysłany — serwer ma wyłączoną wysyłkę (MAIL_MODE≠smtp). Ustaw MAIL_MODE=smtp w konfiguracji API albo przekaż link ręcznie.'

/** Link do potwierdzenia — API zwraca gotowy `link`, ale trzymamy fallback lokalny. */
function inviteLink(inv: InvitationItem): string {
  return inv.link || `${PUBLIC_BASE}/i/${inv.token}`
}

/** Numer do wa.me: same cyfry. Puste → WhatsApp poprosi o wybór kontaktu. */
function waNumber(phone?: string | null): string {
  return (phone ?? '').replace(/\D/g, '')
}

function whatsappHref(inv: InvitationItem, eventTitle: string): string {
  const text = [
    `${inv.firstName}, zapraszamy Cię na: ${eventTitle}.`,
    '',
    'To wydarzenie tylko dla zaproszonych gości — udział potwierdzisz swoim osobistym linkiem:',
    inviteLink(inv),
  ].join('\n')
  const num = waNumber(inv.phone)
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`
}

export default function InvitedGuestsSection({
  instanceId,
  eventTitle,
}: {
  instanceId: string
  eventTitle: string
}) {
  const [items, setItems] = useState<InvitationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ firstName: '', lastName: '', email: '', phone: '' })

  const load = useCallback(async (silent = false) => {
    // `silent` — odświeżanie w tle (polling): bez spinnera, żeby lista nie mrugała.
    if (!silent) setLoading(true)
    try {
      setItems(await listInvitations(instanceId))
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [instanceId])

  useEffect(() => {
    void load()
  }, [load])

  // Potwierdzenia spływają w tle — admin ma je widzieć bez F5. Pauza w trakcie
  // akcji na wierszu (wysyłka, usuwanie, synchronizacja), żeby nie podmienić danych pod ręką.
  const { lastUpdatedAt, refreshing, refreshNow } = useAutoRefresh(() => load(true), {
    intervalMs: 20000,
    enabled: !busyId && !adding,
  })

  async function handleAdd() {
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setError('Podaj imię i nazwisko gościa.')
      return
    }
    setAdding(true)
    setError(null)
    setInfo(null)
    try {
      const next = await createInvitations(instanceId, [
        {
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim() || undefined,
        },
      ])
      setItems(next)
      const mail = draft.email.trim().toLowerCase()
      setDraft({ firstName: '', lastName: '', email: '', phone: '' })
      if (!mail) {
        setInfo('Gość dodany. Bez e-maila zaproszenie wyślij linkiem lub przez WhatsApp.')
      } else if (next.find((x) => x.email.toLowerCase() === mail)?.sentAt) {
        setInfo('Gość dodany — zaproszenie poszło na podany e-mail.')
      } else {
        // Backend nie ostemplował `sentAt` → mail nie wyszedł (najczęściej MAIL_MODE≠smtp).
        setError(`Gość dodany, ale ${MAIL_OFF_HINT.charAt(0).toLowerCase()}${MAIL_OFF_HINT.slice(1)}`)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAdding(false)
    }
  }

  async function handleCopy(inv: InvitationItem) {
    try {
      await navigator.clipboard.writeText(inviteLink(inv))
      setCopiedId(inv.id)
      window.setTimeout(() => setCopiedId((c) => (c === inv.id ? null : c)), 1600)
    } catch {
      // np. brak HTTPS albo odmowa uprawnień — pokazujemy link do ręcznego skopiowania
      setError(`Nie udało się skopiować automatycznie. Link: ${inviteLink(inv)}`)
    }
  }

  async function handleSend(inv: InvitationItem) {
    if (!inv.email) {
      setError(`${inv.firstName} ${inv.lastName} nie ma e-maila — użyj linku albo WhatsAppa.`)
      return
    }
    setBusyId(inv.id)
    setError(null)
    setInfo(null)
    try {
      const res = await sendInvitation(inv.id)
      if (res.status === 'SENT') {
        setInfo(`Zaproszenie wysłane na ${inv.email}.`)
        await load()
      } else if (res.status === 'LOGGED') {
        setError(MAIL_OFF_HINT)
      } else {
        setError(`Nie udało się wysłać maila na ${inv.email} (status: ${res.status}).`)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleSendAll() {
    setBusyId('all')
    setError(null)
    setInfo(null)
    try {
      const res = await sendAllInvitations(instanceId, true)
      if (res.logged > 0 && res.sent === 0) {
        setError(MAIL_OFF_HINT)
      } else {
        setInfo(`Wysłano: ${res.sent}. Pominięto: ${res.skipped}. Błędy: ${res.failed}.`)
      }
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleSyncRegistrations() {
    setBusyId('sync')
    setError(null)
    setInfo(null)
    try {
      const res = await syncInvitationRegistrations(instanceId)
      setInfo(`Utworzono ${res.created}, zaktualizowano ${res.updated}${res.failed > 0 ? `, błędów: ${res.failed}` : ''}.`)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(inv: InvitationItem) {
    if (!window.confirm(`Usunąć zaproszenie dla: ${inv.firstName} ${inv.lastName}?`)) return
    setBusyId(inv.id)
    try {
      await deleteInvitation(inv.id)
      setItems((prev) => prev.filter((x) => x.id !== inv.id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  const confirmedItems = items.filter((i) => i.confirmedAt)
  const confirmed = confirmedItems.length
  const unsent = items.filter((i) => i.email && !i.sentAt).length
  const notConfirmed = items.length - confirmed
  // Potwierdzeni, których jeszcze nie widać w module Zgłoszenia/Obecność (backfill nie klikany
  // albo synchronizacja przy potwierdzeniu akurat zawiodła).
  const unsynced = confirmedItems.filter((i) => !i.registrationId).length

  // Najważniejsza liczba dla organizatora: ile posiłków zamówić u cateringu.
  const spouseCount = confirmedItems.filter((i) => i.spouseAttending).length
  const childrenCount = confirmedItems.reduce((sum, i) => sum + (i.children?.length ?? 0), 0)
  const adultsCount = confirmed + spouseCount
  const mealsCount = adultsCount + childrenCount

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-center justify-between gap-3 flex-wrap px-3 py-2.5 rounded-[10px]"
        style={{ background: 'var(--brand-soft)', border: '1px solid var(--brand)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
          Potwierdzeni: {adultsCount} dorosłych + {childrenCount} dzieci = {mealsCount} posiłków
        </p>
        {notConfirmed > 0 && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Jeszcze niepotwierdzeni: {notConfirmed}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Potwierdziło <strong style={{ color: 'var(--ink)' }}>{confirmed}</strong> z {items.length}
          {unsent > 0 && ` · bez wysłanego maila: ${unsent}`}
        </p>
        <div className="flex items-center gap-2">
          {lastUpdatedAt && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              Zaktualizowano{' '}
              {lastUpdatedAt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
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
          <button
            type="button"
            onClick={() => { void handleSyncRegistrations() }}
            disabled={busyId === 'sync'}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-[8px]"
            style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
            title="Dogania zgłoszenia w module Zgłoszenia/Obecność dla już potwierdzonych gości"
          >
            <Users size={13} /> {busyId === 'sync' ? 'Synchronizuję…' : 'Synchronizuj z listą zgłoszeń'}
          </button>
          {unsent > 0 && (
            <button
              type="button"
              onClick={() => { void handleSendAll() }}
              disabled={busyId === 'all'}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-[8px]"
              style={{ background: 'var(--brand-soft)', color: 'var(--brand)', border: '1px solid var(--brand)', cursor: 'pointer' }}
            >
              <Send size={13} /> {busyId === 'all' ? 'Wysyłam…' : `Wyślij niewysłane (${unsent})`}
            </button>
          )}
        </div>
      </div>

      {unsynced > 0 && (
        <p className="text-xs px-3 py-2 rounded-[8px]" style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
          {unsynced} {unsynced === 1 ? 'potwierdzenie' : 'potwierdzeń'} jeszcze nie widać w module Zgłoszenia/Obecność —
          kliknij „Synchronizuj z listą zgłoszeń" powyżej.
        </p>
      )}

      {error && (
        <p className="text-xs font-medium px-3 py-2 rounded-[8px]" style={{ background: 'var(--err-soft)', color: 'var(--err)' }}>
          {error}
        </p>
      )}
      {info && (
        <p className="text-xs font-medium px-3 py-2 rounded-[8px]" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>
          {info}
        </p>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: 'var(--faint)' }}>Wczytywanie listy gości…</p>
      ) : items.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--faint)' }}>
          Nikt jeszcze nie jest zaproszony. Dodaj pierwszego gościa poniżej.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((inv) => {
            const isConfirmed = !!inv.confirmedAt
            return (
              <div
                key={inv.id}
                className="flex flex-col gap-2 px-3 py-2.5 rounded-[10px]"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                      {inv.firstName} {inv.lastName}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--faint)' }}>
                      {inv.email || 'bez e-maila'}
                      {inv.phone ? ` · ${inv.phone}` : ''}
                    </p>
                  </div>
                  <span
                    className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full shrink-0"
                    style={
                      isConfirmed
                        ? { background: 'var(--ok-soft)', color: 'var(--ok)' }
                        : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }
                    }
                  >
                    {isConfirmed ? <Check size={12} /> : <Clock size={12} />}
                    {isConfirmed ? 'Potwierdził' : 'Czeka'}
                  </span>
                </div>

                {isConfirmed && (inv.spouseAttending || (inv.children?.length ?? 0) > 0 || inv.dietaryNotes || inv.spouseDietaryNotes) && (
                  <div className="flex flex-col gap-0.5">
                    {inv.spouseAttending && (
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        + małżonek: {[inv.spouseFirstName, inv.spouseLastName].filter(Boolean).join(' ') || '—'}
                      </p>
                    )}
                    {(inv.children?.length ?? 0) > 0 && (
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        dzieci: {inv.children.length} ({inv.children.map((c) => `${c.firstName ? `${c.firstName} ` : ''}${c.age}`).join(', ')} lat)
                      </p>
                    )}
                    {inv.dietaryNotes && (
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>dieta: {inv.dietaryNotes}</p>
                    )}
                    {inv.spouseDietaryNotes && (
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>dieta małżonka: {inv.spouseDietaryNotes}</p>
                    )}
                  </div>
                )}

                <p className="text-[11px] font-mono truncate" style={{ color: 'var(--faint)' }}>{inviteLink(inv)}</p>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => { void handleCopy(inv) }}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-[8px]"
                    style={{ background: 'var(--surface)', color: 'var(--brand)', border: '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    <Copy size={12} /> {copiedId === inv.id ? 'Skopiowano!' : 'Kopiuj link'}
                  </button>
                  <a
                    href={whatsappHref(inv, eventTitle)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-[8px] no-underline"
                    style={{ background: '#25D36618', color: '#128C7E', border: '1px solid #25D36655' }}
                    title={inv.phone ? `Wyślij na ${inv.phone}` : 'Otworzy WhatsApp — adresata wybierzesz w aplikacji'}
                  >
                    <MessageCircle size={12} /> WhatsApp
                  </a>
                  <button
                    type="button"
                    onClick={() => { void handleSend(inv) }}
                    disabled={busyId === inv.id}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-[8px]"
                    style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
                    title={inv.sentAt ? `Ostatnia wysyłka: ${new Date(inv.sentAt).toLocaleString('pl-PL')}` : 'Mail jeszcze nie wysłany'}
                  >
                    <Mail size={12} /> {inv.sentAt ? 'Wyślij ponownie' : 'Wyślij mail'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleDelete(inv) }}
                    disabled={busyId === inv.id}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-[8px] ml-auto"
                    style={{ background: 'transparent', color: 'var(--err)', border: '1px solid var(--border)', cursor: 'pointer' }}
                  >
                    <Trash2 size={12} /> Usuń
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div
        className="flex flex-col gap-2.5 px-3 py-3 rounded-[10px]"
        style={{ background: 'var(--surface-2)', border: '1px dashed var(--border)' }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>
          Dodaj gościa
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="Imię"
            value={draft.firstName}
            onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
          />
          <Input
            placeholder="Nazwisko"
            value={draft.lastName}
            onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
          />
          <Input
            placeholder="E-mail (opcjonalnie)"
            value={draft.email}
            onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
          />
          <Input
            placeholder="Telefon, np. +48600100200"
            value={draft.phone}
            onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
          />
        </div>
        <p className="text-[11px]" style={{ color: 'var(--faint)' }}>
          Po dodaniu zaproszenie z osobistym linkiem idzie automatycznie na e-mail. Telefon z numerem
          kierunkowym pozwala wysłać je jednym kliknięciem przez WhatsApp.
        </p>
        <Button onClick={() => { void handleAdd() }} size="sm" disabled={adding}>
          <Plus size={14} /> {adding ? 'Dodaję…' : 'Dodaj i wyślij zaproszenie'}
        </Button>
      </div>
    </div>
  )
}
