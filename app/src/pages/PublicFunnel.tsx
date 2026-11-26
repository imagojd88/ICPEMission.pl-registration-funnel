import { useState, useEffect, useRef } from 'react'
import { notYetOpen } from '../lib/registrationOpens'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router-dom'
import type { EventInstanceDto, CreateRegistrationDto, RegistrationStatus, PaymentMethod } from '@icpe/shared'
import { computePrice, DEFAULT_PRICING, validateRoomCapacity, roomLabel, hasAccommodation, roomStockShortages, buildSchedule, minDepositPctFor, warsawDate, pricingAt, onlineProviderFor, isPolishLanguage, normalizeCountryCode, hasDiscountCodes, eventAddons, visibleAddonSelection, validateAddonSelection, addonProblemMessage } from '@icpe/shared'
import type { PricingConfig } from '@icpe/shared'
import { getEventBySlug, getEventConfig, createRegistration, registerGuest, getInvitation, getRegistrationLead, saveRegistrationLead, pickLang, getPaymentsConfig, startManagedPayment, type EventConfig } from '../lib/api'
import { funnelPriceInput, isAccommodationOptional, funnelSteps, effectiveStep, showsRoomStep, ROOM_STEP } from '../lib/funnelPrice'
import { setAnalyticsContext, track } from '../lib/analytics'

/** Nazwy kroków w analityce (stałe, niezależne od języka). */
const STEP_NAMES = ['applicant', 'participants', 'preferences', 'accommodation', 'options'] as const
import { clearDraft, clearLeadKey, getLeadKey, loadDraft, pruneExpiredDrafts, saveDraft, type ResumableScreen } from '../lib/funnelDraft'

/** Rozdziela „Imię Nazwisko" na pola DTO. */
function splitName(full: string): { firstName: string; lastName?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { firstName: parts[0] ?? '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function toPaymentMethod(m: 'online' | 'transfer' | 'cash' | 'leader' | null): PaymentMethod {
  if (m === 'online') return 'ONLINE'
  if (m === 'cash') return 'CASH'
  if (m === 'leader') return 'LEADER_DEPOSIT'
  return 'BANK_TRANSFER'
}
import { Skeleton } from '../components/ui/Skeleton'
import RoomCheckDialog, { type RoomDialog } from '../components/funnel/RoomCheckDialog'
import ThemeToggle from '../components/ui/ThemeToggle'
import LanguageSwitch from '../components/ui/LanguageSwitch'

// Screen components
import RsvpScreen from '../components/funnel/RsvpScreen'
import LandingHero from '../components/funnel/LandingHero'
import InviteMatchScreen from '../components/funnel/InviteMatchScreen'
import LandingScreen from '../components/funnel/LandingScreen'
import StepperHeader from '../components/funnel/StepperHeader'
import StickyPriceBar from '../components/funnel/StickyPriceBar'
import PaymentMethodScreen from '../components/funnel/PaymentMethodScreen'
import SummaryScreen from '../components/funnel/SummaryScreen'
import SuccessScreen from '../components/funnel/SuccessScreen'

// Step components
import Step0Applicant from '../components/funnel/steps/Step0Applicant'
import Step1Participants from '../components/funnel/steps/Step1Participants'
import Step2Prefs from '../components/funnel/steps/Step2Prefs'
import Step3Room from '../components/funnel/steps/Step3Room'
import Step4Options from '../components/funnel/steps/Step4Options'
import { COMMUNITY_OTHER, type AffiliationField } from '../lib/communities'
import { participantDietaryText } from '../lib/diets'

// ─── Types ─────────────────────────────────────────────────────────────────

export type PublicScreen = 'landing' | 'stepper' | 'payment_method' | 'summary' | 'success'

export interface Applicant {
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  /** Parafia (pole tekstowe) — gdy event pyta o parafię. */
  parish: string
  /** Wybrana wspólnota z listy albo COMMUNITY_OTHER („Inna"). */
  community: string
  /** Nazwa wpisana ręcznie po wyborze „Inna". */
  communityOther: string
  /** Kraj zamieszkania — kod ISO 3166-1 alpha-2 („PL”); '' = jeszcze nie wybrano (pole wymagane). */
  countryCode: string
}

export interface Participant {
  id: string
  type: 'adult' | 'child'
  name: string
  age: number
  gender: 'F' | 'M'
  diet: string
  /** Diety zaznaczone dla tej osoby (klucze z `lib/diets.ts`, tylko włączone w evencie). */
  dietKeys?: string[]
}

/** Jeden pokój w komponowanym zgłoszeniu. */
export interface RoomEntry {
  /** lokalny id (na potrzeby UI) */
  uid: string
  /** id typu pokoju z PricingConfig.rooms */
  roomId: string
  /** indeksy uczestników z tablicy participants */
  participantIndexes: number[]
}

export interface StepperState {
  step: number
  applicant: Applicant
  participants: Participant[]
  dietaryTags: string[]
  dietaryNotes: string
  extraNotes: string
  rooms: RoomEntry[]
  /** Nocleg opcjonalny: gość zaznaczył „Nie potrzebuję noclegu" (pokoje wtedy puste). */
  noAccommodation: boolean
  options: { transport: boolean; bedding: boolean; donation: number; /** dodatki z limitem: id → sztuki */ addons?: Record<string, number> }
  discountCode: string
  discountApplied: boolean
  consents: { rodo: boolean; regulamin: boolean }
  paymentMethod: 'online' | 'transfer' | 'cash' | 'leader' | null
}

// ─── Initial state ──────────────────────────────────────────────────────────

/** Pola kontaktu dla wybranego trybu przynależności (zapisywane w `Registration.contact`). */
function affiliationContact(a: Applicant, mode: AffiliationField | null): {
  parish?: string
  community?: string
  communityOther?: boolean
} {
  if (mode === 'parish') return a.parish.trim() ? { parish: a.parish.trim() } : {}
  if (mode === 'community') {
    if (a.community === COMMUNITY_OTHER) {
      return a.communityOther.trim() ? { community: a.communityOther.trim(), communityOther: true } : {}
    }
    return a.community ? { community: a.community } : {}
  }
  return {}
}

/** Kraj wstępnie: polski interfejs → Polska; inne języki → puste (gość musi wybrać). */
function defaultCountryFor(lang?: string): string {
  return isPolishLanguage(lang) ? 'PL' : ''
}

function buildInitialStepper(lang?: string): StepperState {
  return {
    step: 0,
    applicant: { firstName: '', lastName: '', email: '', phone: '', address: '', parish: '', community: '', communityOther: '', countryCode: defaultCountryFor(lang) },
    participants: [
      { id: 'p-1', type: 'adult', name: '', age: 0, gender: 'M', diet: '' },
    ],
    dietaryTags: [],
    dietaryNotes: '',
    extraNotes: '',
    rooms: [],
    noAccommodation: false,
    options: { transport: false, bedding: false, donation: 0 },
    discountCode: '',
    discountApplied: false,
    consents: { rodo: false, regulamin: false },
    paymentMethod: null,
  }
}

const STEPS = 5

/**
 * Odtwarza StepperState z danych w localStorage. Wszystko jest scalane z domyślnym
 * stanem i sprawdzane pod kątem typu, bo draft mógł powstać na starszej wersji kodu
 * (albo zostać ręcznie zmieniony) — brakujące pole = wysypka renderu i biała strona.
 */
function normalizeStepper(raw: unknown): StepperState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const base = buildInitialStepper()
  const r = raw as Partial<StepperState>
  const obj = <T,>(v: unknown, fallback: T): T =>
    v && typeof v === 'object' && !Array.isArray(v) ? { ...fallback, ...(v as T) } : fallback
  const participants =
    Array.isArray(r.participants) && r.participants.length > 0 ? r.participants : base.participants
  const step = typeof r.step === 'number' ? Math.min(Math.max(Math.trunc(r.step), 0), STEPS - 1) : 0
  return {
    ...base,
    ...r,
    step,
    applicant: obj(r.applicant, base.applicant),
    participants,
    dietaryTags: Array.isArray(r.dietaryTags) ? r.dietaryTags : base.dietaryTags,
    rooms: Array.isArray(r.rooms) ? r.rooms : base.rooms,
    noAccommodation: r.noAccommodation === true,
    options: obj(r.options, base.options),
    consents: obj(r.consents, base.consents),
  }
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function FunnelSkeleton() {
  return (
    <div className="flex flex-col" style={{ maxWidth: 452, margin: '0 auto' }}>
      <Skeleton className="w-full" style={{ height: 300, borderRadius: 0 }} />
      <div className="flex flex-col gap-4 px-[22px] py-[22px]">
        <Skeleton className="h-4 w-32 rounded-full" />
        <Skeleton className="h-4 w-48 rounded-full" />
        <Skeleton className="h-10 w-full rounded-[12px]" />
        <Skeleton className="h-10 w-full rounded-[12px]" />
        <Skeleton className="h-12 w-full rounded-[16px]" />
      </div>
    </div>
  )
}

// ─── Error state ─────────────────────────────────────────────────────────────

function FunnelError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-4"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        {t('common.load_error')}
      </p>
      <button
        onClick={onRetry}
        className="text-sm font-semibold px-4 py-2 rounded-[12px]"
        style={{ background: 'var(--brand)', color: 'white', border: 'none', cursor: 'pointer' }}
      >
        {t('common.retry')}
      </button>
    </div>
  )
}

// ─── Stepper wrapper ─────────────────────────────────────────────────────────

function StepperView({
  state,
  event,
  pricingConfig,
  onChange,
  onBack,
  onNext,
  error,
  affiliation,
  roomAvailability,
  addonAvailability,
  dietKeys,
  lastStepLabel,
  steps,
  showDiscount,
}: {
  /** Kroki tego eventu (indeksy logiczne) — event bez pokoi nie ma kroku „Wybór pokoju”. */
  steps: number[]
  /** Czy pokazać pole „Kod rabatowy” (event ma aktywny kod). */
  showDiscount: boolean
  state: StepperState
  event: EventInstanceDto
  pricingConfig: PricingConfig
  /** Pole przynależności ustawione dla eventu (parafia / wspólnota) albo brak. */
  affiliation?: AffiliationField | null
  onChange: (patch: Partial<StepperState>) => void
  onBack: () => void
  onNext: () => void
  error?: string | null
  /** Limit pokoi: wolne pokoje per typ (brak klucza = bez limitu). */
  roomAvailability?: Record<string, number>
  /** Dodatki z limitem: wolne sztuki per dodatek (brak klucza = bez limitu). */
  addonAvailability?: Record<string, number>
  /** Diety włączone w evencie (`customFields.diets`). */
  dietKeys?: string[]
  /** Napis przycisku w ostatnim kroku (zależny od tego, czy jest jeszcze wybór płatności). */
  lastStepLabel?: string
}) {
  const renderStep = () => {
    switch (state.step) {
      case 0:
        return (
          <Step0Applicant
            value={state.applicant}
            onChange={(applicant) => onChange({ applicant })}
            affiliation={affiliation}
          />
        )
      case 1:
        return (
          <Step1Participants
            participants={state.participants}
            applicant={state.applicant}
            onChange={(participants) => onChange({ participants })}
          />
        )
      case 2:
        return (
          <Step2Prefs
            participants={state.participants}
            onParticipantsChange={(participants) => onChange({ participants })}
            dietKeys={dietKeys ?? []}
            dietaryNotes={state.dietaryNotes}
            extraNotes={state.extraNotes}
            onDietaryNotesChange={(dietaryNotes) => onChange({ dietaryNotes })}
            onExtraNotesChange={(extraNotes) => onChange({ extraNotes })}
          />
        )
      case 3:
        return (
          <Step3Room
            rooms={state.rooms}
            participants={state.participants}
            pricingConfig={pricingConfig}
            onChange={(rooms) => onChange({ rooms })}
            noAccommodation={state.noAccommodation}
            availability={roomAvailability}
            onNoAccommodationChange={(noAccommodation) =>
              onChange(noAccommodation ? { noAccommodation, rooms: [] } : { noAccommodation })
            }
          />
        )
      case 4:
        return (
          <Step4Options
            options={state.options}
            discountCode={state.discountCode}
            discountApplied={state.discountApplied}
            consents={state.consents}
            pricingConfig={pricingConfig}
            showDiscount={showDiscount}
            participants={state.participants}
            addonAvailability={addonAvailability}
            onOptionsChange={(options) => onChange({ options })}
            onDiscountChange={(discountCode) => onChange({ discountCode })}
            onDiscountApply={(discountApplied) => onChange({ discountApplied })}
            onConsentsChange={(consents) => onChange({ consents })}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* „Krok X z Y” liczy tylko kroki, które ten event ma. */}
      <StepperHeader step={Math.max(0, steps.indexOf(state.step))} totalSteps={steps.length} onBack={onBack} />
      <div style={{ paddingBottom: error ? 8 : 80 }}>{renderStep()}</div>
      {error && (
        <div
          className="mx-[22px] mb-2 px-4 py-3 rounded-[12px] text-sm font-medium"
          style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}
          role="alert"
        >
          {error}
        </div>
      )}
      <StickyPriceBar state={state} pricingConfig={pricingConfig} onNext={onNext} lastStepLabel={lastStepLabel} />
    </div>
  )
}

// ─── Niedokończone zgłoszenie ────────────────────────────────────────────────

/** Propozycja powrotu do przerwanego wypełniania (dane z localStorage). */
function DraftBanner({
  step,
  totalSteps,
  name,
  onResume,
  onDiscard,
}: {
  step: number
  totalSteps: number
  name?: string
  onResume: () => void
  onDiscard: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      className="mx-[22px] mt-5 rounded-[15px] px-4 py-3.5 flex flex-col gap-2.5"
      style={{ background: 'var(--brand-soft)', border: '1px solid var(--brand)' }}
      role="status"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
          {name ? t('draft.title_named', { name }) : t('draft.title')}
        </p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {t('draft.subtitle', { step: Math.min(step + 1, totalSteps), total: totalSteps })}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onResume}
          className="text-sm font-semibold px-4 py-2 rounded-[12px] text-white"
          style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
        >
          {t('draft.resume')}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="text-sm font-medium px-3 py-2 rounded-[12px]"
          style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
        >
          {t('draft.discard')}
        </button>
      </div>
    </div>
  )
}

// ─── Podgląd w panelu admina (iframe ?preview=1) ─────────────────────────────

/** Ekrany, które panel może pokazać w podglądzie. */
export type PreviewScreen =
  | 'landing' | 'step0' | 'step1' | 'step2' | 'step3' | 'step4'
  | 'payment_method' | 'summary' | 'success'

/** Wiadomość z panelu (EventPreviewPane) do iframe'a z lejkiem. */
export interface PreviewMessage {
  type: 'icpe-preview'
  event?: Partial<EventInstanceDto>
  config?: Partial<EventConfig>
  screen?: PreviewScreen
  lang?: string
}

/** Przykładowe zgłoszenie do podglądu kroków: dorosły + dziecko 2 lata. */
function previewStepper(cfg: PricingConfig, diets: string[] | undefined, methods: PaymentMethod[] | undefined): StepperState {
  const base = buildInitialStepper()
  const room = cfg.rooms?.[0]
  const both = room && room.cap >= 2
  const firstDiet = (diets ?? [])[0]
  const m = methods?.[0]
  return {
    ...base,
    applicant: { ...base.applicant, firstName: 'Jan', lastName: 'Kowalski', email: 'jan.kowalski@example.com', phone: '600 100 200', countryCode: 'PL' },
    participants: [
      { id: 'p-1', type: 'adult', name: 'Jan Kowalski', age: 0, gender: 'M', diet: '' },
      { id: 'p-2', type: 'child', name: 'Ola Kowalska', age: 2, gender: 'F', diet: '', dietKeys: firstDiet ? [firstDiet] : [] },
    ],
    rooms: room && showsRoomStep(cfg) && (cfg.nights ?? 0) > 0 ? [{ uid: 'preview-room', roomId: room.id, participantIndexes: both ? [0, 1] : [0] }] : [],
    consents: { rodo: true, regulamin: true },
    paymentMethod: cfg.free ? 'cash' : m === 'ONLINE' ? 'online' : m === 'BANK_TRANSFER' ? 'transfer' : 'cash',
  }
}

// ─── Main container ───────────────────────────────────────────────────────────

/** Odczytuje tytuł eventu w aktywnym języku (Localized lub string). */
function getEventTitle(title: EventInstanceDto['title'], lng = 'pl'): string {
  return pickLang(title as string | Record<string, string>, lng)
}

export default function PublicFunnel() {
  const { slug } = useParams<{ slug: string }>()
  const { t, i18n } = useTranslation()
  const lng = i18n.language
  const [screen, setScreen] = useState<PublicScreen>('landing')
  const [stepper, setStepper] = useState<StepperState>(buildInitialStepper())
  const [event, setEvent] = useState<EventInstanceDto | null>(null)
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null)
  // Pole przynależności z ustawień eventu: parafia (tekst) / wspólnota (lista) / brak.
  const affiliation: AffiliationField | null = eventConfig?.customFields?.affiliationField ?? null
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(DEFAULT_PRICING)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Ostatnia próba wysyłki padła na braku sieci → gdy połączenie wróci, podpowiadamy „wyślij jeszcze raz”.
  const [submitNetworkError, setSubmitNetworkError] = useState(false)
  useEffect(() => {
    if (!submitNetworkError) return
    const onOnline = () => setSubmitError(t('summary.network_back'))
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [submitNetworkError, t])
  // Ukryty event (`unlisted`): strona działa pod linkiem, ale prosimy wyszukiwarki, żeby jej nie indeksowały.
  // Znacznik dokładamy dynamicznie i zdejmujemy przy wyjściu ze strony (SPA — <head> jest wspólny).
  const eventUnlisted = (event as (EventInstanceDto & { unlisted?: boolean }) | null)?.unlisted === true
  useEffect(() => {
    if (!eventUnlisted) return
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    meta.setAttribute('data-unlisted-event', '1')
    document.head.appendChild(meta)
    return () => { meta.remove() }
  }, [eventUnlisted])
  const [stepError, setStepError] = useState<string | null>(null)
  // Krok „Nocleg”: okienko po „Dalej”, gdy wybór noclegu jest niepełny (łatwo przeoczyć komunikat na dole).
  const [roomDialog, setRoomDialog] = useState<RoomDialog | null>(null)
  const [result, setResult] = useState<{ regId: string; status: RegistrationStatus; total: number; guestInviteHref?: string; manageHref?: string; paymentsHref?: string; editToken?: string } | null>(null)
  // Płatności online: dostawcy skonfigurowani na serwerze (w trybie mock pusta lista → karta „online” ukryta).
  const [onlineProviders, setOnlineProviders] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    void getPaymentsConfig().then((c) => { if (alive) setOnlineProviders(c.providers) })
    return () => { alive = false }
  }, [])
  // Zgłoszenie zostało już zapisane na serwerze — „Wyślij” nie może pójść drugi raz (np. gdy płatność się nie utworzy).
  const createdRef = useRef(false)
  const [onlinePayState, setOnlinePayState] = useState<'idle' | 'redirecting' | 'failed'>('idle')
  const [onlinePayBusy, setOnlinePayBusy] = useState(false)
  // Osobiste zaproszenie z maila (`?inv=token`): dane gościa wpisujemy w formularz,
  // a token idzie z rejestracją, żeby zgłoszenie spięło się z listą gości w panelu.
  const [searchParams] = useSearchParams()
  const invToken = searchParams.get('inv')
  // Podgląd w panelu admina: dane eventu z formularza edycji (postMessage), przykładowe zgłoszenie,
  // bez wysyłki, bez szkiców w localStorage i bez analityki.
  const preview = searchParams.get('preview') === '1'
  // Podgląd: szkic z panelu już przyszedł — odpowiedź API (zapisana wersja) go nie nadpisuje.
  const previewApplied = useRef(false)
  const [invite, setInvite] = useState<{
    token: string; firstName: string; lastName: string; email: string; phone: string; invitedByName: string | null
  } | null>(null)

  useEffect(() => {
    if (!invToken) return
    getInvitation(invToken)
      .then((v) =>
        setInvite({
          token: invToken,
          firstName: v.firstName,
          lastName: v.lastName,
          email: v.email,
          phone: v.phone ?? '',
          invitedByName: v.invitedByName ?? null,
        }),
      )
      .catch(() => setInvite(null)) // nieważny link = zwykła rejestracja, bez blokowania
  }, [invToken])

  // Link z przypomnienia o niedokończonym zgłoszeniu (`?lead=token`): imię i e-mail wpisujemy w formularz.
  const leadToken = searchParams.get('lead')
  const [leadPrefill, setLeadPrefill] = useState<{ firstName: string; lastName: string; email: string } | null>(null)
  useEffect(() => {
    if (!leadToken || preview) return
    getRegistrationLead(leadToken)
      .then((v) => {
        setLeadPrefill({ firstName: v.firstName, lastName: v.lastName, email: v.email })
        track('reminder_link_opened')
      })
      .catch(() => setLeadPrefill(null))
  }, [leadToken, preview])

  /** Zapis rozpoczętego zgłoszenia — podstawa jednego przypomnienia po 3 h. Ciche, bez blokowania. */
  const saveLead = (step: number) => {
    if (preview || !event?.id) return
    const a = stepper.applicant
    const email = a.email.trim()
    if (!a.firstName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    void saveRegistrationLead({
      instanceId: event.id,
      email,
      firstName: a.firstName.trim(),
      lastName: a.lastName.trim() || undefined,
      locale: (i18n.language || 'pl').slice(0, 2),
      step,
      // Klucz sesji formularza: poprawiony e-mail przenosi lead na nowy adres (nie zostaje stary z przypomnieniem).
      ...(getLeadKey(slug ?? '') ? { leadKey: getLeadKey(slug ?? '') } : {}),
    }).catch(() => undefined)
  }
  // Niedokończone zgłoszenie z poprzedniej wizyty (localStorage) — pokazujemy je jako
  // propozycję na ekranie startowym, nie wskakujemy w lejek bez pytania.
  const [draft, setDraft] = useState<{ screen: ResumableScreen; stepper: StepperState } | null>(null)

  const draftSlug = slug ?? ''

  // Draft odczytujemy przy każdym powrocie na ekran startowy — inaczej trzymalibyśmy
  // nieaktualny snapshot i po wysłaniu zgłoszenia baner proponowałby wysłać je ponownie.
  useEffect(() => {
    if (screen !== 'landing' || preview) return
    const raw = loadDraft(draftSlug)
    const stepper = raw ? normalizeStepper(raw.stepper) : null
    if (raw && !stepper) clearDraft(draftSlug) // niezgodny kształt → wyrzucamy
    setDraft(raw && stepper ? { screen: raw.screen, stepper } : null)
  }, [draftSlug, screen])

  useEffect(() => {
    pruneExpiredDrafts()
  }, [])

  // Autozapis na każdą zmianę kroku/danych — poza ekranem startowym i sukcesem.
  useEffect(() => {
    if (!draftSlug || preview) return
    if (screen === 'landing') return
    if (screen === 'success') {
      clearDraft(draftSlug)
      return
    }
    // Pusty formularz nie jest wart proponowania przy następnej wizycie.
    const a = stepper.applicant
    const started =
      stepper.step > 0 ||
      !!(a.firstName.trim() || a.lastName.trim() || a.email.trim() || a.phone.trim() || a.address.trim()) ||
      stepper.participants.some((p) => p.name.trim())
    if (!started) return
    // Debounce: bez tego każdy wpisany znak to JSON.stringify + zapis do storage.
    const id = window.setTimeout(() => saveDraft(draftSlug, screen, stepper), 400)
    return () => window.clearTimeout(id)
  }, [draftSlug, screen, stepper])

  const loadEvent = () => {
    setLoading(true)
    setError(false)
    const effectiveSlug = slug ?? 'dzien-formacji-2026'
    Promise.all([
      getEventBySlug(effectiveSlug),
      getEventConfig(effectiveSlug),
    ])
      .then(([e, cfg]) => {
        if (previewApplied.current) {
          setLoading(false)
          return
        }
        setEvent(e)
        setEventConfig(cfg)
        // Poziom cen obowiązujący dziś (early bird / kolejne progi) — cały lejek liczy już po nim.
        setPricingConfig(pricingAt(cfg.pricing))
        setLoading(false)
        // Kontekst analityki: każde kolejne zdarzenie w tej wizycie ma slug i typ eventu.
        setAnalyticsContext({
          event_slug: effectiveSlug,
          event_type: e.type ?? cfg.type ?? 'ONE_TIME',
          event_free: !!cfg.pricing?.free,
          accommodation_optional: isAccommodationOptional(cfg.pricing),
        })
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }

  useEffect(() => {
    loadEvent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Podgląd: odbieramy szkic eventu i wybrany ekran z panelu (ta sama domena).
  // Najświeższe dane trzymamy w refie — nasłuch rejestrujemy raz (inaczej pętla „ready”).
  const previewLatest = useRef({ pricingConfig, eventConfig, event })
  previewLatest.current = { pricingConfig, eventConfig, event }
  useEffect(() => {
    if (!preview) return
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      const d = e.data as PreviewMessage
      if (!d || d.type !== 'icpe-preview') return
      if (d.lang && d.lang !== i18n.language) void i18n.changeLanguage(d.lang)
      if (d.event || d.config) previewApplied.current = true
      if (d.event) setEvent((prev) => ({ ...(prev ?? ({} as EventInstanceDto)), ...d.event }) as EventInstanceDto)
      if (d.config) {
        setEventConfig((prev) => ({ ...(prev ?? ({} as EventConfig)), ...d.config }) as EventConfig)
        if (d.config.pricing) setPricingConfig(pricingAt(d.config.pricing))
      }
      setLoading(false)
      setError(false)
      if (d.screen) {
        const sc = d.screen
        // Stan z tej samej wiadomości (setState powyżej jest asynchroniczny).
        const cur = previewLatest.current
        const pc = d.config?.pricing ? pricingAt(d.config.pricing) : cur.pricingConfig
        const diets = d.config?.customFields?.diets ?? cur.eventConfig?.customFields?.diets ?? []
        const methods = (d.event?.paymentMethods ?? cur.event?.paymentMethods) as PaymentMethod[] | undefined
        setSubmitError(null)
        setStepError(null)
        if (sc === 'landing') {
          setScreen('landing')
        } else if (sc.startsWith('step')) {
          // Krok, którego ten event nie ma (np. „Nocleg” po usunięciu pokoi) → najbliższy następny.
          setStepper({ ...previewStepper(pc, diets ?? undefined, methods), step: effectiveStep(Number(sc.slice(4)), funnelSteps(pc)) })
          setScreen('stepper')
        } else {
          setStepper({ ...previewStepper(pc, diets ?? undefined, methods), step: STEPS - 1 })
          if (sc === 'success') {
            setResult({ regId: 'PODGLĄD', status: 'AWAITING_TRANSFER' as RegistrationStatus, total: 0 })
          }
          setScreen(sc as PublicScreen)
        }
      }
    }
    window.addEventListener('message', onMsg)
    // Daj znać panelowi, że można wysyłać szkic.
    window.parent?.postMessage({ type: 'icpe-preview-ready' }, window.location.origin)
    return () => window.removeEventListener('message', onMsg)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, i18n])

  // Tytuł karty przeglądarki — w języku strony; odświeża się po zmianie języka.
  useEffect(() => {
    if (!event) return
    const title = getEventTitle(event.title, lng)
    const suffix = t('common.tab_registration')
    document.title = title ? `${title} — ${suffix}` : `${suffix} — ICPE Mission`
  }, [event, lng, t])

  const patchStepper = (patch: Partial<StepperState>) => {
    setStepper((prev) => ({ ...prev, ...patch }))
    // Każda zmiana w formularzu chowa komunikat walidacji kroku (np. po zaznaczeniu „Nie potrzebuję noclegu").
    setStepError(null)
  }

  // Kroki lejka dla TEGO eventu: bez pokoi (albo bez nocy) nie ma kroku „Wybór pokoju” — ani na żywej
  // stronie, ani w podglądzie w panelu. `stepper.step` zostaje indeksem logicznym (0–4): szkice,
  // analityka i „Zmień” w podsumowaniu wskazują ten sam krok niezależnie od eventu.
  const steps = funnelSteps(pricingConfig)
  const roomStepShown = showsRoomStep(pricingConfig)
  // Szkic zapisany na kroku, którego event już nie ma → najbliższy następny.
  const curStep = effectiveStep(stepper.step, steps)
  // Event bez kroku pokoju nie może nieść pokoi (np. ze starego szkicu) — cena i wysyłka liczą się bez nich.
  useEffect(() => {
    if (loading || roomStepShown) return
    setStepper((prev) => (prev.rooms.length > 0 || prev.noAccommodation ? { ...prev, rooms: [], noAccommodation: false } : prev))
  }, [loading, roomStepShown])
  // Dodatki z limitem: definicje eventu i wybór gościa ograniczony do dodatków widocznych dla jego składu osób.
  const addonDefs = eventAddons(pricingConfig)
  const chosenAddons = visibleAddonSelection(stepper.options.addons, addonDefs, stepper.participants)
  // Pole „Kod rabatowy” tylko, gdy event ma aktywny kod (cennik; flaga z API na wypadek, gdy kody przestaną być publiczne).
  const showDiscount = hasDiscountCodes(pricingConfig) || (!preview && eventConfig?.hasDiscountCodes === true)

  // Zapisy jeszcze nie ruszyły (licznik na stronie) → formularz niedostępny, także z wersji roboczej
  // albo bezpośredniego wejścia; podgląd w panelu (`preview`) pokazuje wszystkie ekrany.
  const registrationNotOpenYet = !preview && notYetOpen(event?.registrationOpensAt)
  useEffect(() => {
    if (registrationNotOpenYet && screen !== 'landing') setScreen('landing')
  }, [registrationNotOpenYet, screen])

  const handleStartRegister = () => {
    if (registrationNotOpenYet) return
    track('registration_started', { invited: !!invite, had_draft: !!draft })
    const base = buildInitialStepper(lng)
    if (invite) {
      base.applicant = { ...base.applicant, firstName: invite.firstName, lastName: invite.lastName, email: invite.email, phone: invite.phone }
      base.participants = [{ ...base.participants[0], name: `${invite.firstName} ${invite.lastName}`.trim() }]
    } else if (leadPrefill) {
      base.applicant = { ...base.applicant, firstName: leadPrefill.firstName, lastName: leadPrefill.lastName, email: leadPrefill.email }
      base.participants = [{ ...base.participants[0], name: `${leadPrefill.firstName} ${leadPrefill.lastName}`.trim() }]
    }
    setStepper(base)
    setScreen('stepper')
  }

  /** Powrót do niedokończonego zgłoszenia — na ten sam krok, z tymi samymi danymi. */
  const handleResumeDraft = () => {
    if (!draft) return
    track('registration_resumed', { step: draft.stepper.step, step_name: STEP_NAMES[draft.stepper.step] })
    // Szkic sprzed pola „Kraj zamieszkania” (albo z niepoprawną wartością) → wartość wstępna jak przy nowym zgłoszeniu.
    const draftCountry = normalizeCountryCode(draft.stepper.applicant.countryCode) ?? defaultCountryFor(lng)
    setStepper({ ...draft.stepper, applicant: { ...draft.stepper.applicant, countryCode: draftCountry } })
    setScreen(draft.screen)
    setDraft(null)
  }

  const handleDiscardDraft = () => {
    clearDraft(draftSlug)
    setDraft(null)
  }

  const handleStepperBack = () => {
    setStepError(null)
    const pos = steps.indexOf(curStep)
    if (pos <= 0) {
      setScreen('landing')
    } else {
      patchStepper({ step: steps[pos - 1] })
    }
  }

  /**
   * Walidacja kroku „Pokój" (3): każdy uczestnik przypisany, pojemność OK.
   * Nocleg opcjonalny: wystarczy „Nie potrzebuję noclegu" albo co najmniej jeden pokój —
   * osoby nieprzypisane do pokoju są po prostu bez noclegu.
   */
  const validateRoomStep = (): string | null => {
    if (!pricingConfig.rooms || pricingConfig.rooms.length === 0) return null // event bez pokoi
    const optional = isAccommodationOptional(pricingConfig)
    if (optional && stepper.noAccommodation) return null
    const n = stepper.participants.length
    if (n === 0) return null
    if (stepper.rooms.length === 0) return optional ? t('room.err_choose') : t('room.err_no_room')
    const assigned = new Set<number>()
    stepper.rooms.forEach((r) =>
      r.participantIndexes.forEach((i) => {
        if (i >= 0 && i < n) assigned.add(i)
      }),
    )
    if (assigned.size < n && !optional) {
      const missing = n - assigned.size
      return t('room.err_unassigned', { count: missing })
    }
    const { ok, errors } = validateRoomCapacity(
      {
        rooms: stepper.rooms.map((r) => ({
          roomId: r.roomId,
          participants: r.participantIndexes
            .filter((i) => i >= 0 && i < n)
            .map((i) => ({ type: stepper.participants[i].type, age: stepper.participants[i].age })),
        })),
      },
      pricingConfig,
    )
    // Limit pokoi: więcej pokoi danego typu niż wolnych.
    const short = roomStockShortages(pricingConfig, stepper.rooms, eventConfig?.roomAvailability ?? {})
    if (short.length) {
      const def = pricingConfig.rooms.find((x) => x.id === short[0].roomId)
      return t('room.err_sold_out', { name: def ? roomLabel(def.name, lng) : short[0].roomId })
    }
    if (!ok) {
      // Komunikaty silnika wyceny są po polsku (wspólne z API) — tu budujemy własne, przetłumaczone.
      for (const r of stepper.rooms) {
        const room = pricingConfig.rooms.find((x) => x.id === r.roomId)
        const cnt = r.participantIndexes.filter((i) => i >= 0 && i < n).length
        if (!room) continue
        const name = roomLabel(room.name, lng)
        if (cnt === 0) return t('room.err_empty', { name })
        if (cnt > room.cap) return t('room.err_over', { name, cap: room.cap, count: cnt })
      }
      return errors.length ? t('room.err_check') : null
    }
    return null
  }

  const handleStepperNext = (opts?: { partialConfirmed?: boolean }) => {
    setStepError(null)
    // Krok „Dane" (0): kraj zamieszkania jest wymagany (decyduje m.in. o płatności online).
    if (curStep === 0 && !normalizeCountryCode(stepper.applicant.countryCode)) {
      setStepError(t('applicant.country_required'))
      return
    }
    // Krok „Dane" (0): wspólnota jest wymagana, gdy event o nią pyta (lista ma opcję „Inna").
    if (curStep === 0 && affiliation === 'community') {
      const a = stepper.applicant
      if (!a.community) { setStepError(t('community.err_required')); return }
      if (a.community === COMMUNITY_OTHER && !a.communityOther.trim()) { setStepError(t('community.err_other')); return }
    }
    // Krok „Pokój" (3): nie przepuszczamy dalej bez poprawnego wyboru pokoju.
    if (curStep === ROOM_STEP) {
      const err = validateRoomStep()
      if (err) {
        setStepError(err)
        // Brak pokoju (bez „Nie potrzebuję noclegu”) albo pokój bez nikogo → okienko z jasnym komunikatem.
        const missing =
          !stepper.noAccommodation &&
          (stepper.rooms.length === 0 || stepper.rooms.some((r) => r.participantIndexes.length === 0))
        setRoomDialog(missing ? { kind: 'missing' } : { kind: 'error', detail: err })
        track('registration_step_blocked', { step: 3, step_name: 'accommodation' })
        return
      }
      // Nocleg opcjonalny, wybrany pokój, ale nie wszyscy w nim są → pytamy, czy to celowe.
      if (
        !opts?.partialConfirmed &&
        isAccommodationOptional(pricingConfig) &&
        !stepper.noAccommodation &&
        stepper.rooms.length > 0
      ) {
        const assigned = new Set(stepper.rooms.flatMap((r) => r.participantIndexes))
        const left = stepper.participants
          .map((p, i) => ({ p, i }))
          .filter(({ i }) => !assigned.has(i))
          .map(({ p, i }) => p.name.trim() || `${p.type === 'child' ? t('participants.child') : t('participants.adult')} ${i + 1}`)
        if (left.length > 0) {
          setRoomDialog({ kind: 'partial', names: left })
          return
        }
      }
      if (hasAccommodation(pricingConfig)) {
        const inRooms = new Set(stepper.rooms.flatMap((r) => r.participantIndexes)).size
        const n = stepper.participants.length
        track('accommodation_chosen', {
          choice: stepper.noAccommodation || inRooms === 0 ? 'none' : inRooms < n ? 'partial' : 'all',
          rooms: stepper.noAccommodation ? 0 : stepper.rooms.length,
          people: n,
          people_with_room: stepper.noAccommodation ? 0 : inRooms,
        })
      }
    }
    // Krok „Opcje" (4): dodatek z limitem, którego zostało mniej niż zaznaczono → komunikat z nazwą dodatku.
    if (curStep === 4) {
      const problems = validateAddonSelection(addonDefs, chosenAddons, stepper.participants, eventConfig?.addonAvailability ?? {})
      if (problems.length) {
        setStepError(addonProblemMessage(problems[0], addonDefs, lng))
        track('registration_step_blocked', { step: 4, step_name: 'options' })
        return
      }
    }
    track('registration_step_completed', { step: curStep, step_name: STEP_NAMES[curStep] })
    const pos = steps.indexOf(curStep)
    saveLead((steps[pos + 1] ?? curStep) + (pos < steps.length - 1 ? 0 : 1))
    if (pos < steps.length - 1) {
      // Następny krok TEGO eventu (event bez pokoi przeskakuje z „Preferencji” od razu do „Opcji”).
      patchStepper({ step: steps[pos + 1] })
    } else if (pricingConfig.free) {
      // Wydarzenie bezpłatne → pomijamy wybór płatności.
      patchStepper({ paymentMethod: 'cash' })
      setScreen('summary')
    } else if (onlyPaymentMethod) {
      // Tylko jeden sposób płatności (np. sama gotówka na miejscu) → nie ma czego wybierać, od razu podsumowanie.
      patchStepper({ paymentMethod: onlyPaymentMethod })
      track('payment_method_selected', { payment_method: onlyPaymentMethod })
      setScreen('summary')
    } else {
      if (stepper.paymentMethod === 'leader' && !leaderEligible) patchStepper({ paymentMethod: null })
      setScreen('payment_method')
    }
  }

  const handlePaymentMethodBack = () => {
    setScreen('stepper')
    patchStepper({ step: STEPS - 1 })
  }

  const handlePaymentMethodContinue = () => {
    // Płatność online przestała być dostępna (np. gość zmienił język po wyborze) → wybór od nowa.
    if (stepper.paymentMethod === 'online' && !onlineAvailable) {
      patchStepper({ paymentMethod: null })
      return
    }
    // Zaliczka u lidera tylko dla wspólnoty z listy — gdyby gość w międzyczasie zmienił wspólnotę.
    if (stepper.paymentMethod === 'leader' && !leaderEligible) {
      patchStepper({ paymentMethod: null })
      return
    }
    if (stepper.paymentMethod) {
      track('payment_method_selected', { payment_method: stepper.paymentMethod })
      setScreen('summary')
    }
  }

  const handleSummaryBack = () => {
    // Bez ekranu wyboru płatności (event bezpłatny / jeden sposób) → wracamy do ostatniego kroku.
    if (pricingConfig.free || onlyPaymentMethod) {
      setScreen('stepper')
      patchStepper({ step: STEPS - 1 })
      return
    }
    setScreen('payment_method')
  }

  /** Tworzy płatność online dla zapisanego zgłoszenia i przekierowuje na stronę Tpay. Zwraca false, gdy się nie udało. */
  const startOnlinePayment = async (editToken: string): Promise<boolean> => {
    setOnlinePayBusy(true)
    try {
      const p = await startManagedPayment(editToken, { mode: 'due' })
      track('online_payment_started', { mode: 'due', amount: p.amount, source: 'funnel' })
      setOnlinePayState('redirecting')
      window.location.assign(p.redirectUrl)
      return true
    } catch {
      setOnlinePayState('failed')
      setOnlinePayBusy(false)
      return false
    }
  }

  const handleSummarySubmit = async () => {
    if (!event || submitting || createdRef.current) return
    // Wybrana płatność online, ale nie jest (już) dostępna — nie wysyłamy zgłoszenia z metodą, której nie da się opłacić.
    if (!preview && stepper.paymentMethod === 'online' && !pricingConfig.free && !onlineAvailable) {
      patchStepper({ paymentMethod: onlyPaymentMethod && onlyPaymentMethod !== 'online' ? onlyPaymentMethod : null })
      if (!onlyPaymentMethod || onlyPaymentMethod === 'online') setScreen('payment_method')
      return
    }
    if (preview) {
      // Podgląd: nic nie wysyłamy — pokazujemy ekran sukcesu z wyliczoną kwotą.
      setResult({ regId: 'PODGLĄD', status: 'AWAITING_TRANSFER' as RegistrationStatus, total: finalPrice?.total ?? 0 })
      setScreen('success')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    setSubmitNetworkError(false)
    try {
      const dto: CreateRegistrationDto = {
        instanceId: event.id,
        // Język gościa → mail z potwierdzeniem w jego języku (API ma PL i EN; inne → PL).
        locale: (['pl', 'en', 'it', 'ko', 'zh'].includes(lng) ? lng : 'pl') as CreateRegistrationDto['locale'],
        contact: {
          firstName: stepper.applicant.firstName,
          lastName: stepper.applicant.lastName,
          email: stepper.applicant.email,
          phone: stepper.applicant.phone || undefined,
          address: stepper.applicant.address || undefined,
          // Kraj zamieszkania: kod ISO alpha-2 (jedyny klucz kraju w kontakcie — API czyta go przy płatności online).
          ...(normalizeCountryCode(stepper.applicant.countryCode) ? { countryCode: normalizeCountryCode(stepper.applicant.countryCode) } : {}),
          ...affiliationContact(stepper.applicant, affiliation),
        },
        participants: stepper.participants.map((p) => {
          const n = splitName(p.name)
          return {
            type: p.type,
            firstName: n.firstName,
            lastName: n.lastName,
            age: p.age,
            gender: p.gender,
            // Diety z listy eventu (tylko te, które admin włączył) + wpis ręczny osoby.
            dietary: participantDietaryText(
              (p.dietKeys ?? []).filter((k) => (eventConfig?.customFields?.diets ?? []).includes(k)),
              p.diet,
            ),
          }
        }),
        // Bez noclegu → pusta lista pokoi (API przyjmie ją, gdy nocleg jest opcjonalny).
        rooms: stepper.noAccommodation || !roomStepShown
          ? []
          : stepper.rooms
              .map((r) => ({ roomId: r.roomId, participantIndexes: r.participantIndexes }))
              .filter((r) => r.participantIndexes.length > 0),
        // „Dodatkowe uwagi” nie miały własnego pola w API i ginęły — dołączamy je do notatek zgłoszenia.
        dietaryNotes:
          [stepper.dietaryNotes.trim(), stepper.extraNotes.trim() ? `Uwagi: ${stepper.extraNotes.trim()}` : '']
            .filter(Boolean)
            .join('\n') || undefined,
        dietaryTags: [],
        options: {
          transport: stepper.options.transport,
          bedding: stepper.options.bedding,
          ...(pricingConfig.donationEnabled && stepper.options.donation > 0 ? { donation: stepper.options.donation } : {}),
          // Dodatki z limitem — tylko widoczne dla tego składu osób (usunięte dziecko → łóżeczko nie idzie).
          ...(Object.keys(chosenAddons).length ? { addons: chosenAddons } : {}),
        },
        discountCode: stepper.discountApplied ? stepper.discountCode : undefined,
        paymentMethod: toPaymentMethod(stepper.paymentMethod),
        consents: stepper.consents,
        ...(invite ? { invitationToken: invite.token } : {}),
        // Zamyka wszystkie „niedokończone zgłoszenia” tej sesji formularza (także pod wcześniej wpisanym adresem).
        ...(getLeadKey(draftSlug) ? { leadKey: getLeadKey(draftSlug) } : {}),
      }
      const res = await createRegistration(dto)
      // Od tej chwili zgłoszenie istnieje: żadnej ponownej wysyłki, szkic do kosza.
      createdRef.current = true
      if (draftSlug) {
        clearDraft(draftSlug)
        clearLeadKey(draftSlug)
      }
      const editToken = (res.registration as { editToken?: string }).editToken
      setResult({
        regId: res.registration.id,
        status: res.registration.status,
        total: res.summary?.total ?? res.registration.totalPrice ?? 0,
        guestInviteHref: res.canInviteGuests && editToken ? `/g/${editToken}` : undefined,
        // Strona zgłoszenia (zmiana / domówienie noclegu) — gdy event oferuje noclegi.
        manageHref: hasAccommodation(pricingConfig) && editToken ? `/z/${editToken}` : undefined,
        paymentsHref: !pricingConfig.free && editToken ? `/z/${editToken}` : undefined,
        editToken,
      })
      // Płatność online: od razu tworzymy płatność na kwotę wymaganą teraz i przekierowujemy do Tpay.
      // Ekran sukcesu pokazujemy tak czy inaczej — z „Przekierowujemy…” albo (gdy się nie uda) z przyciskiem „Zapłać online”.
      if (stepper.paymentMethod === 'online' && !pricingConfig.free && editToken) {
        setOnlinePayState('redirecting')
        setScreen('success')
        void startOnlinePayment(editToken)
      } else {
        setScreen('success')
      }
      // Konwersja: bez danych osobowych — tylko liczby, metoda płatności i nocleg.
      {
        const inRooms = new Set(stepper.rooms.flatMap((r) => r.participantIndexes)).size
        track('registration_submitted', {
          payment_method: pricingConfig.free ? 'free' : stepper.paymentMethod,
          total: res.summary?.total ?? res.registration.totalPrice ?? 0,
          currency: pricingConfig.currency ?? 'PLN',
          people: stepper.participants.length,
          adults: stepper.participants.filter((p) => p.type === 'adult').length,
          children: stepper.participants.filter((p) => p.type === 'child').length,
          rooms: stepper.noAccommodation ? 0 : stepper.rooms.length,
          people_without_room: hasAccommodation(pricingConfig) ? stepper.participants.length - (stepper.noAccommodation ? 0 : inRooms) : null,
          invited: !!invite,
          discount_used: !!stepper.discountApplied,
        })
      }
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e)
      const addonSoldOut = (e as { code?: string } | null)?.code === 'ADDON_SOLD_OUT'
      // Brak sieci (telefon stracił zasięg) albo serwer nieosiągalny: fetch rzuca TypeError
      // („Failed to fetch” / „Load failed” / „NetworkError…”) — dane formularza zostają, wystarczy ponowić.
      const network =
        (typeof navigator !== 'undefined' && navigator.onLine === false) ||
        e instanceof TypeError ||
        /failed to fetch|load failed|networkerror|network request failed/i.test(detail)
      track('registration_submit_failed', {
        reason: network ? 'network' : addonSoldOut ? 'addon_sold_out' : /wolnych pokoi/i.test(detail) ? 'rooms_sold_out' : /zamknięte/i.test(detail) ? 'closed' : 'error',
        payment_method: stepper.paymentMethod,
      })
      // Dodatek wyczerpał się między wyświetleniem a wysłaniem: zgłoszenie NIE przepada (dane zostają),
      // odświeżamy liczbę wolnych sztuk — w kroku „Opcje” dodatek pokaże „Brak dostępnych” i da się go odznaczyć.
      if (addonSoldOut && slug) {
        void getEventConfig(slug).then((cfg) => {
          if (cfg.addonAvailability) setEventConfig((prev) => (prev ? { ...prev, addonAvailability: cfg.addonAvailability } : prev))
        }).catch(() => undefined)
      }
      setSubmitNetworkError(network)
      setSubmitError(network ? t('summary.network_error') : t('summary.submit_error', { error: detail.replace(/[.\s]+$/, '') }))
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditStep = (step: number) => {
    patchStepper({ step: effectiveStep(step, steps) })
    setScreen('stepper')
  }

  const handleBackToLanding = () => {
    setScreen('landing')
  }

  const handleCreateAccount = async () => {
    if (preview) return
    await registerGuest({
      email: stepper.applicant.email,
      firstName: stepper.applicant.firstName,
      lastName: stepper.applicant.lastName,
      phone: stepper.applicant.phone || undefined,
      locale: ['pl', 'en', 'it', 'ko', 'zh'].includes(lng) ? lng : 'pl',
    })
  }

  // Wycena (osoby bez pokoju przy noclegu opcjonalnym = formacja + wyżywienie)
  const { input: priceInput } = funnelPriceInput(
    stepper.participants,
    stepper.rooms,
    pricingConfig,
    { transport: stepper.options.transport, bedding: stepper.options.bedding, donation: stepper.options.donation, addons: chosenAddons },
    stepper.discountApplied ? stepper.discountCode : '',
  )

  const finalPrice = event ? computePrice(priceInput, pricingConfig) : null

  // Zaliczka u lidera: event ją włączył + gość wybrał wspólnotę z listy ICPE (nie „Inna").
  const leaderEligible =
    affiliation === 'community' &&
    !!stepper.applicant.community &&
    stepper.applicant.community !== COMMUNITY_OTHER

  // Płatność online: tylko gdy API zgłasza dostawcę, kwota jest w PLN i reguła kraj / język daje Tpay.
  // NAJPIERW kraj zamieszkania z kroku „Dane” (Polska → Tpay; inny kraj → brak, niezależnie od języka),
  // dopiero gdy kraju brak — język interfejsu. Ta sama funkcja co w API, mailach i na stronie zgłoszenia.
  const onlineAvailable =
    (pricingConfig.currency ?? 'PLN') === 'PLN' &&
    onlineProviderFor(normalizeCountryCode(stepper.applicant.countryCode), lng, onlineProviders) === 'tpay'

  // Sposoby płatności, które ten gość faktycznie zobaczy (jak w PaymentMethodScreen).
  const guestPaymentMethodsRaw = (
    event?.paymentMethods && event.paymentMethods.length > 0 ? event.paymentMethods : (['ONLINE', 'BANK_TRANSFER'] as PaymentMethod[])
  ).filter((m) => (m !== 'LEADER_DEPOSIT' || leaderEligible) && (m !== 'ONLINE' || onlineAvailable))
  // Event tylko z płatnością online, a ten gość jej nie dostaje → zostaje przelew (żeby dało się zapisać).
  const guestPaymentMethods = guestPaymentMethodsRaw.length > 0 ? guestPaymentMethodsRaw : (['BANK_TRANSFER'] as PaymentMethod[])
  const onlyPaymentMethod: StepperState['paymentMethod'] =
    guestPaymentMethods.length === 1
      ? ({ CASH: 'cash', BANK_TRANSFER: 'transfer', ONLINE: 'online', LEADER_DEPOSIT: 'leader' } as const)[guestPaymentMethods[0] as 'CASH']
      : null
  // Ostatni krok: „Wybierz sposób płatności” tylko, gdy jest z czego wybierać; inaczej „Przejdź do podsumowania”.
  const lastStepLabel = pricingConfig.free || onlyPaymentMethod ? t('stepper.to_summary') : t('stepper.to_payment')

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <FunnelSkeleton />
      </div>
    )
  }

  if (error || !event) {
    return <FunnelError onRetry={loadEvent} />
  }

  // Typ eventu: pierwotnie tylko z `/r/:slug`, ale ten endpoint długo nie zwracał `type`
  // (siedzi na serii) — dlatego fallback do `/r/:slug/config`, który zwraca go od zawsze.
  const eventType = event.type ?? eventConfig?.type

  // Event typu STANDALONE (bez noclegu, bezpłatny) → prosty ekran RSVP zamiast lejka.
  if (eventType === 'STANDALONE') {
    return (
      <div className="min-h-screen mx-auto relative" style={{ maxWidth: 452, background: 'var(--bg)' }}>
        <ThemeToggle />
        <LanguageSwitch locales={eventConfig?.locales} />
        <RsvpScreen event={event} content={eventConfig?.customFields} onBack={() => window.history.back()} />
      </div>
    )
  }

  // Event „na zaproszenie" — bez linku: formularz dopasowania danych do zaproszenia.
  if (eventType === 'INVITE') {
    return (
      <div className="min-h-screen mx-auto relative" style={{ maxWidth: 452, background: 'var(--bg)' }}>
        <ThemeToggle />
        <LanguageSwitch locales={eventConfig?.locales} />
        <LandingHero
          isOpen={event.status === 'OPEN'}
          theme={eventConfig?.theme}
          title={getEventTitle(event.title, lng)}
          inviteOnly
        />
        <InviteMatchScreen event={event} slug={slug ?? ''} content={eventConfig?.customFields} />
      </div>
    )
  }

  return (
    <div
      className="min-h-screen mx-auto relative"
      style={{ maxWidth: 452, background: 'var(--bg)' }}
    >
      <ThemeToggle />
      <LanguageSwitch locales={eventConfig?.locales} />
      {preview && (
        <div
          className="fixed bottom-2 left-2 z-50 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
        >
          Podgląd · nic nie jest wysyłane
        </div>
      )}
      {screen === 'landing' && (
        <>
          <LandingHero
            isOpen={event.status === 'OPEN'}
            opensSoon={notYetOpen(event.registrationOpensAt)}
            theme={eventConfig?.theme}
            title={getEventTitle(event.title, lng)}
          />
          {invite && (
            <div className="mx-[22px] mt-4 px-4 py-3 rounded-[12px] text-sm" style={{ background: 'var(--brand-soft)', color: 'var(--ink)', border: '1px solid var(--brand)' }}>
              {invite.invitedByName ? (
                <>{t('invite.banner_by')} <strong>{invite.invitedByName}</strong>. </>
              ) : (
                <>{t('invite.banner_personal')} </>
              )}
              {t('invite.banner_prefill')}
            </div>
          )}
          {draft && !invite && (
            <DraftBanner
              step={Math.max(0, steps.indexOf(effectiveStep(draft.stepper.step, steps)))}
              totalSteps={steps.length}
              name={draft.stepper.applicant.firstName.trim()}
              onResume={handleResumeDraft}
              onDiscard={handleDiscardDraft}
            />
          )}
          <LandingScreen event={event} onRegister={handleStartRegister} pricingConfig={pricingConfig} content={eventConfig?.customFields} />
        </>
      )}

      {screen === 'stepper' && (
        <StepperView
          state={curStep === stepper.step ? stepper : { ...stepper, step: curStep }}
          steps={steps}
          showDiscount={showDiscount}
          event={event}
          pricingConfig={pricingConfig}
          onChange={patchStepper}
          onBack={handleStepperBack}
          onNext={() => handleStepperNext()}
          lastStepLabel={lastStepLabel}
          error={stepError}
          affiliation={affiliation}
          roomAvailability={eventConfig?.roomAvailability}
          addonAvailability={eventConfig?.addonAvailability}
          dietKeys={eventConfig?.customFields?.diets ?? []}
        />
      )}
      {screen === 'stepper' && roomDialog && (
        <RoomCheckDialog
          dialog={roomDialog}
          onClose={() => setRoomDialog(null)}
          onConfirmPartial={() => {
            setRoomDialog(null)
            handleStepperNext({ partialConfirmed: true })
          }}
        />
      )}

      {screen === 'payment_method' && (
        <PaymentMethodScreen
          selected={stepper.paymentMethod}
          onSelect={(method) => patchStepper({ paymentMethod: method })}
          onContinue={handlePaymentMethodContinue}
          onBack={handlePaymentMethodBack}
          availableMethods={guestPaymentMethods}
          leaderEligible={leaderEligible}
          leaderDepositPct={pricingConfig.leaderDepositPct}
          total={finalPrice?.total ?? 0}
          currency={pricingConfig.currency}
        />
      )}

      {screen === 'summary' && (
        <SummaryScreen
          state={stepper}
          event={event}
          pricingConfig={pricingConfig}
          onSubmit={handleSummarySubmit}
          onEdit={handleEditStep}
          onBack={handleSummaryBack}
          submitting={submitting}
          submitError={submitError}
          bankInfo={eventConfig?.paymentInfo}
        />
      )}

      {screen === 'success' && (
        <SuccessScreen
          paymentMethod={stepper.paymentMethod}
          leaderDepositPct={pricingConfig.leaderDepositPct}
          payNow={buildSchedule(
            preview ? finalPrice?.total ?? 0 : result?.total ?? finalPrice?.total ?? 0,
            pricingConfig.paymentPlan,
            warsawDate(),
            minDepositPctFor(pricingConfig.rooms, stepper.rooms.map((r) => r.roomId)),
          )[0]?.amount}
          email={stepper.applicant.email}
          total={preview ? finalPrice?.total ?? 0 : result?.total ?? finalPrice?.total ?? 0}
          currency={pricingConfig.currency}
          regNumber={result?.regId}
          status={result?.status}
          onBack={handleBackToLanding}
          onCreateAccount={handleCreateAccount}
          guestInviteHref={result?.guestInviteHref}
          manageHref={result?.manageHref}
          paymentsHref={result?.paymentsHref}
          onlinePay={
            !preview && stepper.paymentMethod === 'online' && result?.editToken
              ? { state: onlinePayState, busy: onlinePayBusy, onPay: () => { void startOnlinePayment(result.editToken as string) } }
              : undefined
          }
        />
      )}
    </div>
  )
}
