import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeftRight,
  Bell,
  Check,
  ChevronDown,
  ClipboardList,
  Clock,
  Copy,
  Mail,
  MessageCircle,
  MessageSquare,
  PenLine,
  Plus,
  RefreshCw,
  Send,
  StickyNote,
  Trash2,
  Undo2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Utensils,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import InviteMailEditor, { isPersonalized } from '@/components/admin/events/InviteMailEditor'
import HouseholdEditor from '@/components/admin/events/HouseholdEditor'
import {
  describeHousehold,
  emptyHousehold,
  hasSpouse,
  householdDraftError,
  householdFromItem,
  householdToInput,
  parseHouseholdLines,
  type HouseholdDraft,
} from '@/lib/households'
import {
  createInvitations,
  deleteInvitation,
  listInvitations,
  previewInvitation,
  previewNewInvitation,
  updateInvitation,
  type MailPersonalization,
  sendAllInvitations,
  sendInvitation,
  sendGuestInviteLinks,
  syncInvitationRegistrations,
  createConfirmedInvitations,
  confirmInvitationByAdmin,
  unconfirmInvitation,
  declineInvitationByAdmin,
  sendDietReminders,
  type HouseholdConflict,
  type HouseholdInput,
  type InvitationItem,
  type InvitationStatus,
} from '@/lib/api'

/** Fallback bazy linków — API zwraca gotowy `link`, to tylko awaryjnie. */
const PUBLIC_BASE = typeof window !== 'undefined' ? window.location.origin : 'https://rejestracja.icpemission.pl'

/** Serwer odpowiedział „zalogowano zamiast wysłać" → brak skonfigurowanego dostawcy poczty. */
const MAIL_OFF_HINT =
  'Mail NIE został wysłany — serwer nie ma skonfigurowanej poczty. Podłącz Resend (Ustawienia ▸ E-mail) albo przekaż link ręcznie.'

/** Link do potwierdzenia — API zwraca gotowy `link`, ale trzymamy fallback lokalny. */
function inviteLink(inv: InvitationItem): string {
  return inv.link || `${PUBLIC_BASE}/i/${inv.token}`
}

/** Status zaproszenia (starsze API bez `status` → wyliczony z dat). */
function statusOf(inv: InvitationItem): InvitationStatus {
  return inv.status ?? (inv.confirmedAt ? 'CONFIRMED' : inv.declinedAt ? 'DECLINED' : 'PENDING')
}

/** Potwierdzony przez organizatora (dostaje mail „udział potwierdzony, podaj dietę", nie zaproszenie). */
function byAdmin(inv: InvitationItem): boolean {
  return statusOf(inv) === 'CONFIRMED' && inv.confirmedBy === 'ADMIN'
}

/** Rodzina (więcej niż jedna osoba) — do form „Wasz/Wy" w wiadomościach. */
function isHousehold(inv: InvitationItem): boolean {
  return inv.spouseAttending === true || (inv.children?.length ?? 0) > 0
}

/** Krótki opis konfliktu przy dodawaniu potwierdzonych. */
function conflictText(c: HouseholdConflict): string {
  switch (c.kind) {
    case 'SAME_PERSON_PENDING':
      return `${c.label} — ta osoba już jest na liście.`
    case 'SAME_PERSON_CONFIRMED':
      return `${c.label} — już potwierdzona. Zmień jej skład przyciskiem „Edytuj skład” przy tej osobie.`
    case 'SPOUSE_ON_LIST':
      return `Małżonek jest już na liście: ${c.label}. Posiłki policzyłyby się podwójnie.`
    case 'PERSON_IS_SPOUSE':
      return `Ta osoba jest już małżonkiem w rodzinie: ${c.label}. Posiłki policzyłyby się podwójnie.`
  }
}

/** Numer do wa.me: same cyfry. Puste → WhatsApp poprosi o wybór kontaktu. */
function waNumber(phone?: string | null): string {
  return (phone ?? '').replace(/\D/g, '')
}

/**
 * Treść zaproszenia wysyłanego komunikatorem — wspólna dla WhatsAppa i iMessage.
 * `register` = zwykły event: gość rejestruje się w lejku (link ma wypełnione dane).
 */
function inviteMessage(inv: InvitationItem, eventTitle: string, register = false): string {
  if (byAdmin(inv)) {
    // Potwierdzony przez organizatora — nie zapraszamy, tylko prosimy (opcjonalnie) o dietę.
    const we = isHousehold(inv)
    return [
      we
        ? `${inv.firstName}${inv.spouseFirstName ? ` i ${inv.spouseFirstName}` : ''}, Wasz udział w: ${eventTitle} jest potwierdzony.`
        : `${inv.firstName}, Twój udział w: ${eventTitle} jest potwierdzony.`,
      '',
      we
        ? 'Jeśli ktoś z Was ma wymagania żywieniowe lub alergie, podajcie je tutaj:'
        : 'Jeśli masz wymagania żywieniowe lub alergie, podaj je tutaj:',
      inviteLink(inv),
    ].join('\n')
  }
  return [
    `${inv.firstName}, zapraszamy Cię na: ${eventTitle}.`,
    '',
    register
      ? 'Zarejestrujesz się swoim osobistym linkiem — Twoje dane są już wpisane:'
      : 'To wydarzenie tylko dla zaproszonych gości — udział potwierdzisz swoim osobistym linkiem:',
    inviteLink(inv),
  ].join('\n')
}

function whatsappHref(inv: InvitationItem, eventTitle: string, register = false): string {
  const num = waNumber(inv.phone)
  return `https://wa.me/${num}?text=${encodeURIComponent(inviteMessage(inv, eventTitle, register))}`
}

/**
 * Link otwierający macOS-owe Wiadomości (iMessage) z gotową treścią do ręcznego wysłania.
 * Adresat: numer telefonu, a gdy go brak — e-mail (iMessage adresuje też po Apple ID).
 * Bez żadnego z nich otwiera puste okno z samą treścią.
 * Zapis `?&body=` to wersja działająca zarówno w macOS, jak i w iOS (różnie traktują separator).
 */
function imessageHref(inv: InvitationItem, eventTitle: string, register = false): string {
  const raw = (inv.phone ?? '').trim()
  const digits = waNumber(raw)
  // Zachowujemy „+" tylko wtedy, gdy admin sam je wpisał — doklejanie go do numeru
  // krajowego (np. „512 345 678") zrobiłoby z niego nieistniejący numer międzynarodowy.
  const num = digits ? (raw.startsWith('+') ? `+${digits}` : digits) : ''
  const recipient = num || (inv.email || '').trim()
  return `sms:${recipient}?&body=${encodeURIComponent(inviteMessage(inv, eventTitle, register))}`
}

export default function InvitedGuestsSection({
  instanceId,
  eventTitle,
  eventType = 'INVITE',
  guestInvitesEnabled = false,
}: {
  instanceId: string
  eventTitle: string
  /** INVITE = gość potwierdza udział; inne typy = gość rejestruje się w lejku (z płatnością). */
  eventType?: string
  /** Stan checkboxa „Uczestnicy mogą sami zapraszać gości" (zapisany lub nie). */
  guestInvitesEnabled?: boolean
}) {
  const isInvite = eventType === 'INVITE'
  const register = !isInvite
  const [items, setItems] = useState<InvitationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ firstName: '', lastName: '', email: '', phone: '' })
  // Personalizacja maila dla dodawanego gościa (zwinięta domyślnie).
  const [draftMail, setDraftMail] = useState<MailPersonalization>({})
  const [showDraftMail, setShowDraftMail] = useState(false)
  // Edycja treści maila istniejącego gościa (jeden wiersz naraz).
  const [editingMailId, setEditingMailId] = useState<string | null>(null)
  const [editMail, setEditMail] = useState<MailPersonalization>({})
  // Tryb formularza „Dodaj gościa" (tylko event INVITE): zaproszenie albo od razu potwierdzony.
  const [addMode, setAddMode] = useState<'invite' | 'confirmed'>(() => {
    try {
      return window.sessionStorage.getItem('icpe:addMode') === 'confirmed' ? 'confirmed' : 'invite'
    } catch {
      return 'invite'
    }
  })
  const [household, setHousehold] = useState<HouseholdDraft>(() => emptyHousehold())
  // „Wyślij mail z potwierdzeniem i prośbą o dietę" — domyślnie tak, odznaczenie = ciche dodanie.
  const [sendConfirmMail, setSendConfirmMail] = useState(true)
  // Konflikty z ostatniej próby dodania potwierdzonych + to, co trzeba ponowić po decyzji admina.
  const [conflictState, setConflictState] = useState<{
    conflicts: HouseholdConflict[]
    households: HouseholdInput[]
    clearForm: boolean
  } | null>(null)
  // Wklejana lista (masowe dodawanie potwierdzonych).
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  // „Potwierdź ręcznie" / „Edytuj skład" — jeden wiersz naraz.
  const [householdEditId, setHouseholdEditId] = useState<string | null>(null)
  const [editHousehold, setEditHousehold] = useState<HouseholdDraft>(() => emptyHousehold())
  const [editSendMail, setEditSendMail] = useState(true)

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
    enabled: !busyId && !adding && !editingMailId && !householdEditId,
  })

  /** `send=false` — dodaj bez maila (np. ważny gość: najpierw dopracować treść, potem wysłać). */
  async function handleAdd(send = true) {
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
          ...draftMail,
        },
      ], undefined, send)
      setItems(next)
      const mail = draft.email.trim().toLowerCase()
      setDraft({ firstName: '', lastName: '', email: '', phone: '' })
      setDraftMail({})
      setShowDraftMail(false)
      if (!send) {
        setInfo('Gość dodany bez wysyłania. Treść dopracujesz przyciskiem „Treść maila” przy gościu, stamtąd też wyślesz.')
      } else if (!mail) {
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

  function switchAddMode(mode: 'invite' | 'confirmed') {
    setAddMode(mode)
    setConflictState(null)
    try {
      window.sessionStorage.setItem('icpe:addMode', mode)
    } catch {
      /* prywatne okno — bez zapamiętywania */
    }
  }

  /** Podsumowanie wysyłki maili po dodaniu potwierdzonych — uczciwie, gdy poczta nie działa. */
  function mailSummary(m: { sent: number; failed: number; logged: number; noEmail: number }, send: boolean): string {
    if (!send) return 'Bez maili (wysyłka odznaczona).'
    const parts: string[] = []
    if (m.sent) parts.push(`mail z potwierdzeniem poszedł do ${m.sent}`)
    if (m.noEmail) parts.push(`${m.noEmail} bez e-maila — przekaż link ręcznie`)
    if (m.failed) parts.push(`${m.failed} maili się nie wysłało`)
    return parts.length ? parts.join(', ') + '.' : ''
  }

  /**
   * Dodanie od razu potwierdzonych (jedna rodzina z formularza albo wklejona lista).
   * Konflikty (duplikaty zawyżające catering) wracają do decyzji admina — patrz conflictState.
   */
  async function submitConfirmed(
    households: HouseholdInput[],
    opts: { confirmExisting?: boolean; ignoreWarnings?: boolean },
    clearForm: boolean,
  ) {
    setAdding(true)
    setError(null)
    setInfo(null)
    try {
      const res = await createConfirmedInvitations(instanceId, households, { sendEmails: sendConfirmMail, ...opts })
      setItems(res.items)
      const done = res.added + res.confirmedExisting
      const remaining = Array.from(new Set(res.conflicts.map((c) => c.index))).map((i) => households[i])
      if (res.conflicts.length > 0) {
        // Ponawiamy tylko gospodarstwa z konfliktem (reszta już dodana); indeksy przeliczamy na nową listę.
        const order = Array.from(new Set(res.conflicts.map((c) => c.index)))
        setConflictState({
          conflicts: res.conflicts.map((c) => ({ ...c, index: order.indexOf(c.index) })),
          households: remaining,
          clearForm,
        })
      } else {
        setConflictState(null)
        if (clearForm) {
          setDraft({ firstName: '', lastName: '', email: '', phone: '' })
          setDraftMail({})
          setShowDraftMail(false)
          setHousehold(emptyHousehold(household.mode))
        }
      }
      if (done > 0) {
        if (res.mail.logged > 0 && res.mail.sent === 0) {
          setError(`Dodano jako potwierdzonych: ${done}, ale ${MAIL_OFF_HINT.charAt(0).toLowerCase()}${MAIL_OFF_HINT.slice(1)}`)
        } else {
          setInfo(`Dodano jako potwierdzonych: ${done}${res.confirmedExisting ? ` (w tym potwierdzone istniejące zaproszenia: ${res.confirmedExisting})` : ''}. ${mailSummary(res.mail, sendConfirmMail)}`)
        }
      }
      return res
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setAdding(false)
    }
  }

  async function handleAddConfirmed() {
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setError('Podaj imię i nazwisko osoby głównej.')
      return
    }
    const herr = householdDraftError(household)
    if (herr) {
      setError(herr)
      return
    }
    const h: HouseholdInput = {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      email: draft.email.trim(),
      ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
      ...householdToInput(household),
      ...draftMail,
    }
    await submitConfirmed([h], {}, true)
  }

  /** Decyzja admina w sprawie konfliktów — ponowienie z flagą albo usunięcie zdublowanego rekordu. */
  async function resolveConflicts(action: 'confirmExisting' | 'ignoreWarnings' | 'replaceSpouseRecords') {
    if (!conflictState) return
    const { households, clearForm, conflicts } = conflictState
    if (action === 'replaceSpouseRecords') {
      const ids = Array.from(new Set(conflicts.filter((c) => c.kind === 'SPOUSE_ON_LIST' || c.kind === 'PERSON_IS_SPOUSE').map((c) => c.existingId)))
      if (!window.confirm(`Usunąć ${ids.length === 1 ? 'osobny rekord' : `${ids.length} osobne rekordy`} i dodać rodzinę jednym rekordem?`)) return
      try {
        for (const id of ids) await deleteInvitation(id)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e))
        return
      }
      await submitConfirmed(households, { ignoreWarnings: true }, clearForm)
      return
    }
    await submitConfirmed(
      households,
      action === 'confirmExisting' ? { confirmExisting: true, ignoreWarnings: false } : { ignoreWarnings: true },
      clearForm,
    )
  }

  const bulkParsed = parseHouseholdLines(bulkText)
  const bulkValid = bulkParsed.filter((p) => !p.error)

  async function handleBulkAdd() {
    if (bulkValid.length === 0) return
    const res = await submitConfirmed(bulkValid.map((p) => p.household), {}, false)
    if (res && res.conflicts.length === 0) {
      setBulkText('')
      setBulkOpen(false)
    }
  }

  function startHouseholdEdit(inv: InvitationItem) {
    setEditingMailId(null)
    setHouseholdEditId(inv.id)
    setEditHousehold(householdFromItem(inv))
    // Pierwsze potwierdzenie → domyślnie mail; edycja już potwierdzonego → bez maila.
    setEditSendMail(statusOf(inv) !== 'CONFIRMED' && !!inv.email)
  }

  async function saveHousehold(inv: InvitationItem) {
    const herr = householdDraftError(editHousehold)
    if (herr) {
      setError(herr)
      return
    }
    setBusyId(inv.id)
    setError(null)
    setInfo(null)
    try {
      const wasConfirmed = statusOf(inv) === 'CONFIRMED'
      const res = await confirmInvitationByAdmin(inv.id, householdToInput(editHousehold), editSendMail)
      setItems((prev) => prev.map((x) => (x.id === inv.id ? res.item : x)))
      setHouseholdEditId(null)
      const who = `${inv.firstName} ${inv.lastName}`
      if (res.mail === 'LOGGED') setError(`${wasConfirmed ? 'Zapisano skład' : 'Potwierdzono'}: ${who}, ale ${MAIL_OFF_HINT.charAt(0).toLowerCase()}${MAIL_OFF_HINT.slice(1)}`)
      else if (res.mail === 'FAILED') setError(`${wasConfirmed ? 'Zapisano skład' : 'Potwierdzono'}: ${who}, ale mail się nie wysłał.`)
      else setInfo(`${wasConfirmed ? 'Zapisano skład i diety' : 'Potwierdzono udział'}: ${who}.${res.mail === 'SENT' ? ` Mail z potwierdzeniem poszedł na ${inv.email}.` : ''}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleUnconfirm(inv: InvitationItem) {
    const st = statusOf(inv)
    const q =
      st === 'DECLINED'
        ? `Cofnąć odmowę: ${inv.firstName} ${inv.lastName}? Osoba wróci do „Czeka”.`
        : `Cofnąć potwierdzenie: ${inv.firstName} ${inv.lastName}? Osoba wróci do „Czeka”, a jej zgłoszenie zostanie anulowane.`
    if (!window.confirm(q)) return
    setBusyId(inv.id)
    setError(null)
    try {
      const updated = await unconfirmInvitation(inv.id)
      setItems((prev) => prev.map((x) => (x.id === inv.id ? updated : x)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDecline(inv: InvitationItem) {
    if (!window.confirm(`Oznaczyć, że ${inv.firstName} ${inv.lastName} nie przyjdzie? Osoba zniknie z licznika posiłków.`)) return
    setBusyId(inv.id)
    setError(null)
    try {
      const updated = await declineInvitationByAdmin(inv.id)
      setItems((prev) => prev.map((x) => (x.id === inv.id ? updated : x)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDietReminders(count: number) {
    if (!window.confirm(`Wysłać przypomnienie o wymaganiach żywieniowych do ${count} ${count === 1 ? 'osoby' : 'osób'}?`)) return
    setBusyId('diet')
    setError(null)
    setInfo(null)
    try {
      const res = await sendDietReminders(instanceId)
      if (res.logged > 0 && res.sent === 0) setError(MAIL_OFF_HINT)
      else setInfo(`Przypomnienie wysłane: ${res.sent}${res.failed ? `, błędy: ${res.failed}` : ''}.`)
      await load(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
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

  /**
   * Klik w „iMessage" otwiera Wiadomości przez schemat `sms:`. Niektóre wersje macOS
   * ignorują parametr `body` i otwierają pustą rozmowę, więc treść ląduje też w schowku —
   * wtedy wystarczy ⌘V. Sam link otwiera aplikację (domyślna akcja anchora), tu tylko schowek.
   */
  async function handleImessage(inv: InvitationItem) {
    setError(null)
    try {
      await navigator.clipboard.writeText(inviteMessage(inv, eventTitle, register))
      setInfo('Otwieram Wiadomości. Treść jest też w schowku — jeśli okno będzie puste, wklej ⌘V i wyślij ręcznie.')
    } catch {
      setInfo('Otwieram Wiadomości. Jeśli treść się nie wypełni, skopiuj link przyciskiem „Kopiuj link".')
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
        setInfo(`${byAdmin(inv) ? 'Mail z potwierdzeniem' : 'Zaproszenie'} wysłane na ${inv.email}.`)
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

  /** Link „Zaproś gościa" konkretnej osoby — do wysłania ręcznie (WhatsApp, SMS). */
  async function handleCopyGuestLink(inv: InvitationItem) {
    if (!inv.guestInviteLink) return
    try {
      await navigator.clipboard.writeText(inv.guestInviteLink)
      setCopiedId(`g-${inv.id}`)
      window.setTimeout(() => setCopiedId((c) => (c === `g-${inv.id}` ? null : c)), 1600)
    } catch {
      setError(`Nie udało się skopiować automatycznie. Link: ${inv.guestInviteLink}`)
    }
  }

  async function handleSendGuestLinks() {
    const who = isInvite ? 'wszystkim, którzy potwierdzili udział' : 'wszystkim zapisanym uczestnikom'
    if (!window.confirm(`Wysłać mail z linkiem „Zaproś gościa" ${who}?`)) return
    setBusyId('glinks')
    setError(null)
    setInfo(null)
    try {
      const res = await sendGuestInviteLinks(instanceId)
      if (res.logged > 0 && res.sent === 0) setError(MAIL_OFF_HINT)
      else setInfo(`Wysłano link do zapraszania: ${res.sent}. Pominięto: ${res.skipped}. Błędy: ${res.failed}.`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  function startEditMail(inv: InvitationItem) {
    setEditingMailId(inv.id)
    setEditMail({
      mailFormal: !!inv.mailFormal,
      mailSalutation: inv.mailSalutation ?? '',
      mailSubject: inv.mailSubject ?? '',
      mailNote: inv.mailNote ?? '',
    })
  }

  /** Zapis personalizacji; `andSend` = od razu wyślij (ponownie) zaproszenie z nową treścią. */
  async function saveMail(inv: InvitationItem, andSend: boolean) {
    setBusyId(inv.id)
    setError(null)
    setInfo(null)
    try {
      const updated = await updateInvitation(inv.id, editMail)
      setItems((prev) => prev.map((x) => (x.id === inv.id ? updated : x)))
      setEditingMailId(null)
      if (!andSend) {
        setInfo(`Zapisano treść maila dla: ${inv.firstName} ${inv.lastName}.`)
        return
      }
      if (!inv.email) {
        setError(`${inv.firstName} ${inv.lastName} nie ma e-maila — treść zapisana, ale nie ma gdzie wysłać.`)
        return
      }
      const res = await sendInvitation(inv.id)
      if (res.status === 'SENT') {
        setInfo(`Zapisano i wysłano ${byAdmin(inv) ? 'mail z potwierdzeniem' : 'zaproszenie'} na ${inv.email}.`)
        await load(true)
      } else if (res.status === 'LOGGED') setError(MAIL_OFF_HINT)
      else setError(`Treść zapisana, ale wysyłka na ${inv.email} nie powiodła się (status: ${res.status}).`)
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
    const q =
      statusOf(inv) === 'CONFIRMED'
        ? `Usunąć ${inv.firstName} ${inv.lastName} z listy gości? Potwierdzone zgłoszenie zostanie anulowane.`
        : `Usunąć zaproszenie dla: ${inv.firstName} ${inv.lastName}?`
    if (!window.confirm(q)) return
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

  const confirmedItems = items.filter((i) => statusOf(i) === 'CONFIRMED')
  const confirmed = confirmedItems.length
  const declinedCount = items.filter((i) => statusOf(i) === 'DECLINED').length
  // „Wyślij niewysłane" — jak na serwerze: bez odmów i bez osób, które same potwierdziły.
  const unsent = items.filter(
    (i) => i.email && !i.sentAt && statusOf(i) !== 'DECLINED' && !(statusOf(i) === 'CONFIRMED' && !byAdmin(i)),
  ).length
  const notConfirmed = items.filter((i) => statusOf(i) === 'PENDING').length
  // Potwierdzeni przez organizatora bez odpowiedzi o diecie — catering „nie wie".
  const dietUnknown = confirmedItems.filter((i) => i.dietStatus === 'UNKNOWN')
  const dietUnknownMailable = dietUnknown.filter((i) => i.email).length
  // Potwierdzeni, których jeszcze nie widać w module Zgłoszenia/Obecność (backfill nie klikany
  // albo synchronizacja przy potwierdzeniu akurat zawiodła).
  const unsynced = confirmedItems.filter((i) => !i.registrationId).length

  // Najważniejsza liczba dla organizatora: ile posiłków zamówić u cateringu.
  const spouseCount = confirmedItems.filter((i) => i.spouseAttending).length
  const childrenCount = confirmedItems.reduce((sum, i) => sum + (i.children?.length ?? 0), 0)
  const adultsCount = confirmed + spouseCount
  const mealsCount = adultsCount + childrenCount

  const fromParticipants = items.filter((i) => i.invitedByParticipant).length

  return (
    <div className="flex flex-col gap-4">
      {!isInvite && (
        <p className="text-xs px-3 py-2 rounded-[8px]" style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
          Osoby z tej listy dostają osobisty link do rejestracji z wpisanymi danymi. Po rejestracji
          pojawiają się w module Zgłoszenia jak każdy uczestnik (z ceną i płatnością).
        </p>
      )}
      {isInvite && (
      <div
        className="flex items-center justify-between gap-3 flex-wrap px-3 py-2.5 rounded-[10px]"
        style={{ background: 'var(--brand-soft)', border: '1px solid var(--brand)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
          Potwierdzeni: {adultsCount} dorosłych + {childrenCount} dzieci = {mealsCount} posiłków
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          {notConfirmed > 0 && (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Jeszcze niepotwierdzeni: {notConfirmed}
            </p>
          )}
          {declinedCount > 0 && (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Nie przyjdzie: {declinedCount}
            </p>
          )}
        </div>
      </div>
      )}

      {isInvite && dietUnknown.length > 0 && (
        <div
          className="flex items-center justify-between gap-3 flex-wrap px-3 py-2 rounded-[10px]"
          style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}
        >
          <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--warn)' }}>
            <Utensils size={13} /> Diety nieznane: {dietUnknown.length}{' '}
            {dietUnknown.length === 1 ? 'rodzina' : dietUnknown.length < 5 ? 'rodziny' : 'rodzin'} (potwierdzeni przez Ciebie, jeszcze bez odpowiedzi)
          </p>
          {dietUnknownMailable > 0 && (
            <button
              type="button"
              onClick={() => { void handleDietReminders(dietUnknownMailable) }}
              disabled={busyId === 'diet'}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-[8px]"
              style={{ background: 'var(--surface)', color: 'var(--warn)', border: '1px solid var(--warn)', cursor: 'pointer' }}
            >
              <Bell size={13} /> {busyId === 'diet' ? 'Wysyłam…' : `Przypomnij o diecie (${dietUnknownMailable})`}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {isInvite ? 'Potwierdziło' : 'Zarejestrowało się'} <strong style={{ color: 'var(--ink)' }}>{confirmed}</strong> z {items.length}
          {unsent > 0 && ` · bez wysłanego maila: ${unsent}`}
          {fromParticipants > 0 && ` · od uczestników: ${fromParticipants}`}
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
          {isInvite && (
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
          )}
          {guestInvitesEnabled && (
            <button
              type="button"
              onClick={() => { void handleSendGuestLinks() }}
              disabled={busyId === 'glinks'}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-[8px]"
              style={{ background: 'var(--surface-2)', color: 'var(--brand)', border: '1px solid var(--border)', cursor: 'pointer' }}
              title="Mail z linkiem do formularza zapraszania — dla osób, które zapisały się / potwierdziły przed włączeniem tej opcji"
            >
              <UserPlus size={13} /> {busyId === 'glinks' ? 'Wysyłam…' : 'Wyślij linki „Zaproś gościa"'}
            </button>
          )}
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

      {isInvite && unsynced > 0 && (
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
            const st = statusOf(inv)
            const isConfirmed = st === 'CONFIRMED'
            const isDeclined = st === 'DECLINED'
            const admin = byAdmin(inv)
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
                    {inv.invitedByParticipant && (
                      <p className="flex items-center gap-1 text-[11px] font-medium mt-0.5" style={{ color: 'var(--brand)' }}>
                        <UserPlus size={11} /> zaproszony przez: {inv.invitedByName || 'uczestnika'}
                      </p>
                    )}
                    {isPersonalized(inv) && (
                      <p className="flex items-center gap-1 text-[11px] font-medium mt-0.5" style={{ color: 'var(--muted)' }}>
                        <PenLine size={11} /> własna treść maila{inv.mailFormal ? ' · forma grzecznościowa' : ''}
                      </p>
                    )}
                  </div>
                  <span
                    className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full shrink-0"
                    style={
                      isConfirmed
                        ? { background: 'var(--ok-soft)', color: 'var(--ok)' }
                        : isDeclined
                          ? { background: 'var(--err-soft)', color: 'var(--err)' }
                          : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }
                    }
                    title={
                      admin
                        ? 'Dodany/potwierdzony przez organizatora — gość nie musiał nic klikać'
                        : isDeclined && inv.declinedAt
                          ? `Odmowa: ${new Date(inv.declinedAt).toLocaleString('pl-PL')}`
                          : undefined
                    }
                  >
                    {isConfirmed ? admin ? <UserCheck size={12} /> : <Check size={12} /> : isDeclined ? <UserX size={12} /> : <Clock size={12} />}
                    {isConfirmed
                      ? isInvite
                        ? admin
                          ? 'Potwierdzony · organizator'
                          : 'Potwierdził'
                        : 'Zarejestrowany'
                      : isDeclined
                        ? 'Nie przyjdzie'
                        : 'Czeka'}
                  </span>
                </div>

                {isConfirmed && (
                  <div className="flex flex-col gap-0.5">
                    {inv.spouseAttending && (
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        + małżonek: {[inv.spouseFirstName, inv.spouseLastName].filter(Boolean).join(' ') || '—'}
                        {inv.spouseDietaryNotes ? ` · dieta: ${inv.spouseDietaryNotes}` : ''}
                      </p>
                    )}
                    {(inv.children?.length ?? 0) > 0 && (
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        dzieci: {inv.children.length} (
                        {inv.children
                          .map((c) => `${c.firstName ? `${c.firstName} ` : ''}${c.age}${c.dietary ? ` — ${c.dietary}` : ''}`)
                          .join(', ')}
                        )
                      </p>
                    )}
                    {inv.dietaryNotes && (
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>dieta{isHousehold(inv) ? ` (${inv.firstName})` : ''}: {inv.dietaryNotes}</p>
                    )}
                    {isInvite && inv.dietStatus === 'UNKNOWN' && (
                      <p className="self-start flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full mt-0.5" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
                        <Utensils size={11} /> dieta: czeka na odpowiedź
                      </p>
                    )}
                    {isInvite && inv.dietStatus === 'NONE' && (
                      <p className="self-start flex items-center gap-1 text-[11px] font-medium mt-0.5" style={{ color: 'var(--ok)' }}>
                        <Utensils size={11} /> bez wymagań żywieniowych ✓
                      </p>
                    )}
                    {admin && inv.guestRespondedAt && (
                      <p className="text-[11px]" style={{ color: 'var(--faint)' }}>
                        gość odpowiedział {new Date(inv.guestRespondedAt).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                )}

                {inv.adminNote && (
                  <p className="flex items-center gap-1 text-[11px] italic" style={{ color: 'var(--muted)' }}>
                    <StickyNote size={11} /> {inv.adminNote}
                  </p>
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
                  {inv.guestInviteLink && (
                    <button
                      type="button"
                      onClick={() => { void handleCopyGuestLink(inv) }}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-[8px]"
                      style={{ background: 'var(--surface)', color: 'var(--brand)', border: '1px solid var(--border)', cursor: 'pointer' }}
                      title={`Link do formularza „Zaproś gościa" tej osoby: ${inv.guestInviteLink}`}
                    >
                      <UserPlus size={12} /> {copiedId === `g-${inv.id}` ? 'Skopiowano!' : 'Link „Zaproś gościa"'}
                    </button>
                  )}
                  <a
                    href={whatsappHref(inv, eventTitle, register)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-[8px] no-underline"
                    style={{ background: '#25D36618', color: '#128C7E', border: '1px solid #25D36655' }}
                    title={inv.phone ? `Wyślij na ${inv.phone}` : 'Otworzy WhatsApp — adresata wybierzesz w aplikacji'}
                  >
                    <MessageCircle size={12} /> WhatsApp
                  </a>
                  <a
                    href={imessageHref(inv, eventTitle, register)}
                    onClick={() => { void handleImessage(inv) }}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-[8px] no-underline"
                    style={{ background: '#007AFF18', color: '#0A6FD8', border: '1px solid #007AFF55' }}
                    title={
                      inv.phone
                        ? `Otworzy Wiadomości (iMessage) do ${inv.phone} — wysyłasz ręcznie`
                        : inv.email
                          ? `Otworzy Wiadomości (iMessage) do ${inv.email} — wysyłasz ręcznie`
                          : 'Otworzy Wiadomości — adresata wybierzesz w aplikacji'
                    }
                  >
                    <MessageSquare size={12} /> iMessage
                  </a>
                  <button
                    type="button"
                    onClick={() => { void handleSend(inv) }}
                    disabled={busyId === inv.id}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-[8px]"
                    style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
                    title={inv.sentAt ? `Ostatnia wysyłka: ${new Date(inv.sentAt).toLocaleString('pl-PL')}` : 'Mail jeszcze nie wysłany'}
                  >
                    <Mail size={12} /> {admin ? (inv.sentAt ? 'Wyślij potwierdzenie ponownie' : 'Wyślij mail z potwierdzeniem') : inv.sentAt ? 'Wyślij ponownie' : 'Wyślij mail'}
                  </button>
                  <button
                    type="button"
                    onClick={() => (editingMailId === inv.id ? setEditingMailId(null) : startEditMail(inv))}
                    className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-[8px]"
                    style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
                    title="Własny zwrot, dodatkowe zdania, temat, forma grzecznościowa"
                  >
                    <PenLine size={12} /> Treść maila
                  </button>
                  {isInvite && !inv.invitedByParticipant && !isConfirmed && (
                    <button
                      type="button"
                      onClick={() => (householdEditId === inv.id ? setHouseholdEditId(null) : startHouseholdEdit(inv))}
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-[8px]"
                      style={{ background: 'var(--ok-soft)', color: 'var(--ok)', border: '1px solid var(--ok)', cursor: 'pointer' }}
                      title="Gość potwierdził poza linkiem (np. telefonicznie) — wpisz skład i potwierdź"
                    >
                      <UserCheck size={12} /> Potwierdź ręcznie
                    </button>
                  )}
                  {isInvite && isConfirmed && (
                    <button
                      type="button"
                      onClick={() => (householdEditId === inv.id ? setHouseholdEditId(null) : startHouseholdEdit(inv))}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-[8px]"
                      style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
                      title="Małżonek, dzieci, diety, notatka"
                    >
                      <ClipboardList size={12} /> Edytuj skład i diety
                    </button>
                  )}
                  {isInvite && (isConfirmed || isDeclined) && (
                    <button
                      type="button"
                      onClick={() => { void handleUnconfirm(inv) }}
                      disabled={busyId === inv.id}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-[8px]"
                      style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
                    >
                      <Undo2 size={12} /> {isDeclined ? 'Cofnij odmowę' : 'Cofnij potwierdzenie'}
                    </button>
                  )}
                  {isInvite && !isDeclined && (
                    <button
                      type="button"
                      onClick={() => { void handleDecline(inv) }}
                      disabled={busyId === inv.id}
                      className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-[8px]"
                      style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
                      title="Gość dał znać, że nie przyjdzie"
                    >
                      <UserX size={12} /> Nie przyjdzie
                    </button>
                  )}
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

                {editingMailId === inv.id && (
                  <div className="flex flex-col gap-2.5 mt-1 px-3 py-3 rounded-[10px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>
                      Treść maila — {inv.firstName} {inv.lastName}
                    </p>
                    <InviteMailEditor
                      value={editMail}
                      onChange={setEditMail}
                      onPreview={() => previewInvitation(inv.id, editMail)}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm" onClick={() => { void saveMail(inv, true) }} disabled={busyId === inv.id || !inv.email}>
                        <Send size={14} /> {inv.sentAt ? 'Zapisz i wyślij ponownie' : 'Zapisz i wyślij'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { void saveMail(inv, false) }} disabled={busyId === inv.id}>
                        Zapisz bez wysyłania
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingMailId(null)}>
                        Anuluj
                      </Button>
                    </div>
                  </div>
                )}

                {householdEditId === inv.id && (
                  <div className="flex flex-col gap-2.5 mt-1 px-3 py-3 rounded-[10px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--ok)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>
                      {isConfirmed ? 'Skład i diety' : 'Potwierdź ręcznie'} — {inv.firstName} {inv.lastName}
                    </p>
                    <HouseholdEditor value={editHousehold} onChange={setEditHousehold} mainLastName={inv.lastName} mainFirstName={inv.firstName} />
                    {(!isConfirmed || admin) && (
                      <label className="flex items-center gap-2 text-xs" style={{ color: inv.email ? 'var(--ink)' : 'var(--faint)' }}>
                        <input type="checkbox" checked={editSendMail && !!inv.email} disabled={!inv.email} onChange={(e) => setEditSendMail(e.target.checked)} />
                        {inv.email
                          ? `Wyślij mail z potwierdzeniem i prośbą o dietę na ${inv.email}`
                          : 'Brak e-maila — link przekażesz ręcznie (Kopiuj link / WhatsApp)'}
                      </label>
                    )}
                    {isConfirmed && !admin && (
                      <p className="text-[11px]" style={{ color: 'var(--faint)' }}>
                        Ta osoba potwierdziła sama — zapiszesz korektę bez wysyłania maila.
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm" onClick={() => { void saveHousehold(inv) }} disabled={busyId === inv.id}>
                        <UserCheck size={14} /> {isConfirmed ? 'Zapisz' : 'Potwierdź udział'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setHouseholdEditId(null)}>
                        Anuluj
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div
        className="flex flex-col gap-2.5 px-3 py-3 rounded-[10px]"
        style={{ background: 'var(--surface-2)', border: '1px dashed var(--border)' }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>
            Dodaj gościa
          </p>
          {isInvite && (
            <div className="flex rounded-[10px] overflow-hidden p-0.5" style={{ background: 'var(--surface)' }} role="radiogroup" aria-label="Sposób dodania">
              {([
                ['invite', 'Zaproś (gość potwierdza)'],
                ['confirmed', 'Dodaj jako potwierdzonego'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={addMode === id}
                  onClick={() => switchAddMode(id)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-all duration-150"
                  style={{
                    background: addMode === id ? (id === 'confirmed' ? 'var(--ok-soft)' : 'var(--brand-soft)') : 'transparent',
                    color: addMode === id ? (id === 'confirmed' ? 'var(--ok)' : 'var(--brand)') : 'var(--muted)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {isInvite && addMode === 'confirmed' && (
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>
            Bez zaproszenia — osoba (albo cała rodzina jednym rekordem) od razu jest potwierdzona, liczy się do posiłków
            i pojawia w Zgłoszeniach i Obecności. Dostaje mail „udział potwierdzony” z prośbą o dietę (opcjonalnie).
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder={addMode === 'confirmed' && isInvite ? 'Imię (osoba z e-mailem)' : 'Imię'}
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

        {isInvite && addMode === 'confirmed' && (
          <>
            <HouseholdEditor value={household} onChange={setHousehold} mainLastName={draft.lastName.trim()} mainFirstName={draft.firstName.trim()} />
            {hasSpouse(household) && (household.spouseFirstName.trim() || draft.firstName.trim()) && (
              <button
                type="button"
                onClick={() => {
                  // E-mail i telefon zostają w polach osoby głównej — zamieniamy tylko, kto nią jest.
                  const main = { first: draft.firstName, last: draft.lastName }
                  const sp = { first: household.spouseFirstName, last: household.spouseLastName.trim() || draft.lastName }
                  setDraft((d) => ({ ...d, firstName: sp.first, lastName: sp.last }))
                  setHousehold((h) => ({
                    ...h,
                    spouseFirstName: main.first,
                    // To samo nazwisko → puste pole (domyślnie dziedziczy po osobie głównej).
                    spouseLastName: main.last.trim() === sp.last.trim() ? '' : main.last,
                    dietary: h.spouseDietary,
                    spouseDietary: h.dietary,
                  }))
                }}
                className="self-start flex items-center gap-1 text-[11px] font-semibold"
                style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                title="Osoba główna to ta, do której należy e-mail i link"
              >
                <ArrowLeftRight size={12} /> Zamień osobę główną z małżonkiem
              </button>
            )}
          </>
        )}

        <button
          type="button"
          onClick={() => setShowDraftMail((v) => !v)}
          className="self-start flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <PenLine size={13} /> Personalizuj treść maila (opcjonalnie)
          <ChevronDown size={13} style={{ transform: showDraftMail ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />
        </button>
        {showDraftMail && (
          <InviteMailEditor
            value={draftMail}
            onChange={setDraftMail}
            onPreview={() =>
              previewNewInvitation(instanceId, {
                firstName: draft.firstName.trim(),
                lastName: draft.lastName.trim(),
                email: draft.email.trim(),
                ...draftMail,
                ...(isInvite && addMode === 'confirmed'
                  ? { preconfirmed: true, household: householdToInput(household) }
                  : {}),
              })
            }
          />
        )}

        {isInvite && addMode === 'confirmed' ? (
          <>
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink)' }}>
              <input type="checkbox" checked={sendConfirmMail} onChange={(e) => setSendConfirmMail(e.target.checked)} />
              Wyślij mail z potwierdzeniem i prośbą o dietę
              {!draft.email.trim() && sendConfirmMail && <span style={{ color: 'var(--faint)' }}>(bez e-maila — link przekażesz ręcznie)</span>}
            </label>

            {conflictState && (
              <div className="flex flex-col gap-2 px-3 py-2.5 rounded-[10px]" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}>
                <p className="text-xs font-semibold" style={{ color: 'var(--warn)' }}>
                  {conflictState.households.length === 1
                    ? 'Nie dodano — możliwy duplikat:'
                    : `Nie dodano ${conflictState.households.length} rodzin — możliwe duplikaty:`}
                </p>
                <ul className="flex flex-col gap-1">
                  {conflictState.conflicts.map((c, i) => (
                    <li key={`${c.index}-${c.kind}-${i}`} className="text-xs" style={{ color: 'var(--ink)' }}>
                      {conflictState.households.length > 1 && (
                        <strong>{describeHousehold(conflictState.households[c.index])}: </strong>
                      )}
                      {conflictText(c)}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 flex-wrap">
                  {conflictState.conflicts.some((c) => c.kind === 'SAME_PERSON_PENDING') && (
                    <Button size="sm" onClick={() => { void resolveConflicts('confirmExisting') }} disabled={adding}>
                      <UserCheck size={14} /> Potwierdź istniejące zaproszenie
                    </Button>
                  )}
                  {conflictState.conflicts.some((c) => c.kind === 'SPOUSE_ON_LIST' || c.kind === 'PERSON_IS_SPOUSE') &&
                    !conflictState.conflicts.some((c) => c.blocking) && (
                      <>
                        <Button size="sm" onClick={() => { void resolveConflicts('replaceSpouseRecords') }} disabled={adding}>
                          Usuń osobny rekord i dodaj rodzinę
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { void resolveConflicts('ignoreWarnings') }} disabled={adding}>
                          Dodaj mimo to
                        </Button>
                      </>
                    )}
                  <Button size="sm" variant="ghost" onClick={() => setConflictState(null)}>
                    Anuluj
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={() => { void handleAddConfirmed() }} size="sm" disabled={adding}>
                <UserCheck size={14} /> {adding ? 'Dodaję…' : 'Dodaj jako potwierdzonego'}
              </Button>
              <Button onClick={() => setBulkOpen((v) => !v)} size="sm" variant="outline">
                <ClipboardList size={14} /> Wklej listę
              </Button>
            </div>

            {bulkOpen && (
              <div className="flex flex-col gap-2 px-3 py-3 rounded-[10px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Jedna rodzina w wierszu: <code>Imię Nazwisko, e-mail, telefon, małżonek, dzieci</code> — puste kolumny wolno pominąć,
                  dzieci rozdziel średnikiem (imię opcjonalne, liczba = wiek).
                </p>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={5}
                  placeholder={'Jan Kowalski, jan@example.com, +48600100200, Anna Kowalska, Ola 7; Staś 4\nEwa Nowak, ewa@example.com\nPiotr Lis,,, Maria'}
                  className="w-full rounded-[12px] px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)', resize: 'vertical' }}
                />
                {bulkParsed.length > 0 && (
                  <ul className="flex flex-col gap-0.5 max-h-48 overflow-auto">
                    {bulkParsed.map((p) => (
                      <li key={p.line} className="text-[11px]" style={{ color: p.error ? 'var(--err)' : 'var(--muted)' }}>
                        {p.line}. {p.error ? `${p.raw} — ${p.error}` : `${describeHousehold(p.household)}${p.household.email ? ` · ${p.household.email}` : ' · bez e-maila'}`}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" onClick={() => { void handleBulkAdd() }} disabled={adding || bulkValid.length === 0}>
                    <UserCheck size={14} />{' '}
                    {adding ? 'Dodaję…' : `Dodaj jako potwierdzone (${bulkValid.length})`}
                  </Button>
                  {bulkParsed.length > bulkValid.length && (
                    <span className="text-[11px]" style={{ color: 'var(--err)' }}>
                      Wiersze z błędem ({bulkParsed.length - bulkValid.length}) zostaną pominięte.
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-[11px]" style={{ color: 'var(--faint)' }}>
              Po dodaniu zaproszenie z osobistym linkiem{register ? ' do rejestracji' : ''} idzie automatycznie
              na e-mail. Telefon z numerem kierunkowym pozwala wysłać je jednym kliknięciem przez WhatsApp.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={() => { void handleAdd(true) }} size="sm" disabled={adding}>
                <Plus size={14} /> {adding ? 'Dodaję…' : 'Dodaj i wyślij zaproszenie'}
              </Button>
              <Button onClick={() => { void handleAdd(false) }} size="sm" variant="outline" disabled={adding}>
                Dodaj bez wysyłania
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
