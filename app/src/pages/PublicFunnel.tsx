import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import type { EventInstanceDto } from '@icpe/shared'
import { computePrice, DEFAULT_PRICING } from '@icpe/shared'
import type { PricingConfig } from '@icpe/shared'
import { getEventBySlug, getEventConfig } from '../lib/api'
import { Skeleton } from '../components/ui/Skeleton'

// Screen components
import RsvpScreen from '../components/funnel/RsvpScreen'
import LandingHero from '../components/funnel/LandingHero'
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

// ─── Types ─────────────────────────────────────────────────────────────────

export type PublicScreen = 'landing' | 'stepper' | 'payment_method' | 'summary' | 'success'

export interface Applicant {
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
}

export interface Participant {
  id: string
  type: 'adult' | 'child'
  name: string
  age: number
  gender: 'F' | 'M'
  diet: string
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
  options: { transport: boolean; bedding: boolean }
  discountCode: string
  discountApplied: boolean
  consents: { rodo: boolean; regulamin: boolean }
  paymentMethod: 'online' | 'transfer' | null
}

// ─── Initial state ──────────────────────────────────────────────────────────

function buildInitialStepper(): StepperState {
  return {
    step: 0,
    applicant: { firstName: '', lastName: '', email: '', phone: '', address: '' },
    participants: [
      { id: 'p-1', type: 'adult', name: '', age: 30, gender: 'M', diet: '' },
    ],
    dietaryTags: [],
    dietaryNotes: '',
    extraNotes: '',
    rooms: [],
    options: { transport: false, bedding: false },
    discountCode: '',
    discountApplied: false,
    consents: { rodo: false, regulamin: false },
    paymentMethod: null,
  }
}

const STEPS = 5

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
  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-4"
      style={{ background: 'var(--bg)', color: 'var(--ink)' }}
    >
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        Nie udało się załadować danych eventu.
      </p>
      <button
        onClick={onRetry}
        className="text-sm font-semibold px-4 py-2 rounded-[12px]"
        style={{ background: 'var(--brand)', color: 'white', border: 'none', cursor: 'pointer' }}
      >
        Spróbuj ponownie
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
}: {
  state: StepperState
  event: EventInstanceDto
  pricingConfig: PricingConfig
  onChange: (patch: Partial<StepperState>) => void
  onBack: () => void
  onNext: () => void
}) {
  const renderStep = () => {
    switch (state.step) {
      case 0:
        return (
          <Step0Applicant
            value={state.applicant}
            onChange={(applicant) => onChange({ applicant })}
          />
        )
      case 1:
        return (
          <Step1Participants
            participants={state.participants}
            onChange={(participants) => onChange({ participants })}
          />
        )
      case 2:
        return (
          <Step2Prefs
            dietaryTags={state.dietaryTags}
            dietaryNotes={state.dietaryNotes}
            extraNotes={state.extraNotes}
            onTagsChange={(dietaryTags) => onChange({ dietaryTags })}
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
      <StepperHeader step={state.step} totalSteps={STEPS} onBack={onBack} />
      <div style={{ paddingBottom: 80 }}>{renderStep()}</div>
      <StickyPriceBar state={state} pricingConfig={pricingConfig} onNext={onNext} />
    </div>
  )
}

// ─── Main container ───────────────────────────────────────────────────────────

export default function PublicFunnel() {
  const { slug } = useParams<{ slug: string }>()
  const [screen, setScreen] = useState<PublicScreen>('landing')
  const [stepper, setStepper] = useState<StepperState>(buildInitialStepper())
  const [event, setEvent] = useState<EventInstanceDto | null>(null)
  const [pricingConfig, setPricingConfig] = useState<PricingConfig>(DEFAULT_PRICING)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const loadEvent = () => {
    setLoading(true)
    setError(false)
    const effectiveSlug = slug ?? 'dzien-formacji-2026'
    Promise.all([
      getEventBySlug(effectiveSlug),
      getEventConfig(effectiveSlug),
    ])
      .then(([e, cfg]) => {
        setEvent(e)
        setPricingConfig(cfg.pricing)
        setLoading(false)
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

  const patchStepper = (patch: Partial<StepperState>) => {
    setStepper((prev) => ({ ...prev, ...patch }))
  }

  const handleStartRegister = () => {
    setStepper(buildInitialStepper())
    setScreen('stepper')
  }

  const handleStepperBack = () => {
    if (stepper.step === 0) {
      setScreen('landing')
    } else {
      patchStepper({ step: stepper.step - 1 })
    }
  }

  const handleStepperNext = () => {
    if (stepper.step < STEPS - 1) {
      patchStepper({ step: stepper.step + 1 })
    } else {
      setScreen('payment_method')
    }
  }

  const handlePaymentMethodBack = () => {
    setScreen('stepper')
    patchStepper({ step: STEPS - 1 })
  }

  const handlePaymentMethodContinue = () => {
    if (stepper.paymentMethod) {
      setScreen('summary')
    }
  }

  const handleSummaryBack = () => {
    setScreen('payment_method')
  }

  const handleSummarySubmit = () => {
    setScreen('success')
  }

  const handleEditStep = (step: number) => {
    patchStepper({ step })
    setScreen('stepper')
  }

  const handleBackToLanding = () => {
    setScreen('landing')
  }

  // Buduj PriceInput z nowego formatu rooms
  const priceInput = {
    rooms: stepper.rooms.map((r) => ({
      roomId: r.roomId,
      participants: r.participantIndexes
        .filter((idx) => idx >= 0 && idx < stepper.participants.length)
        .map((idx) => ({
          type: stepper.participants[idx].type,
          age: stepper.participants[idx].age,
        })),
    })),
    options: { transport: stepper.options.transport, bedding: stepper.options.bedding },
    discountCode: stepper.discountApplied ? stepper.discountCode : '',
  }

  const finalPrice = event ? computePrice(priceInput, pricingConfig) : null

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

  // Event typu STANDALONE (bez noclegu, bezpłatny) → prosty ekran RSVP zamiast lejka.
  if (event.type === 'STANDALONE') {
    return (
      <div className="min-h-screen mx-auto relative" style={{ maxWidth: 452, background: 'var(--bg)' }}>
        <RsvpScreen event={event} onBack={() => window.history.back()} />
      </div>
    )
  }

  return (
    <div
      className="min-h-screen mx-auto relative"
      style={{ maxWidth: 452, background: 'var(--bg)' }}
    >
      {screen === 'landing' && (
        <>
          <LandingHero isOpen={event.status === 'OPEN'} />
          <LandingScreen event={event} onRegister={handleStartRegister} />
        </>
      )}

      {screen === 'stepper' && (
        <StepperView
          state={stepper}
          event={event}
          pricingConfig={pricingConfig}
          onChange={patchStepper}
          onBack={handleStepperBack}
          onNext={handleStepperNext}
        />
      )}

      {screen === 'payment_method' && (
        <PaymentMethodScreen
          selected={stepper.paymentMethod}
          onSelect={(method) => patchStepper({ paymentMethod: method })}
          onContinue={handlePaymentMethodContinue}
          onBack={handlePaymentMethodBack}
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
        />
      )}

      {screen === 'success' && (
        <SuccessScreen
          paymentMethod={stepper.paymentMethod}
          email={stepper.applicant.email}
          total={finalPrice?.total ?? 0}
          onBack={handleBackToLanding}
        />
      )}
    </div>
  )
}
