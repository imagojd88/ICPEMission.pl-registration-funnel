import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Calendar, MapPin, Check, Trash2, UserPlus, UserCheck, Utensils, CalendarX } from 'lucide-react'
import {
  getInvitation,
  confirmInvitation,
  declineInvitation,
  pickLang,
  eventLocation,
  type InvitationView,
  type ChildEntry,
} from '../lib/api'
import { formatDateRange } from '../lib/utils'
import Spinner from '../components/ui/Spinner'
import ThemeToggle from '../components/ui/ThemeToggle'
import LanguageSwitch from '../components/ui/LanguageSwitch'
import EventContentBlocks from '../components/funnel/EventContentBlocks'

/** Wiersz dziecka w formularzu — `age` jako string, żeby pole mogło być puste w trakcie edycji. */
interface ChildRow {
  key: string
  age: string
  firstName: string
  dietary: string
}

let childKeyCounter = 0
function newChildRow(): ChildRow {
  return { key: `c-${++childKeyCounter}`, age: '', firstName: '', dietary: '' }
}

const inputCls =
  'w-full rounded-[12px] px-3 py-[11px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]'

/**
 * Strona osobistego zaproszenia `/i/:token`.
 * Stany: czeka (formularz potwierdzenia) · potwierdzony (przez gościa albo przez organizatora —
 * wtedy od razu sekcja diet) · odmowa · wydarzenie już trwa (tylko do odczytu).
 */
export default function InviteConfirm() {
  const { t, i18n } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [inv, setInv] = useState<InvitationView | null>(null)
  const [error, setError] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [declined, setDeclined] = useState(false)
  // Gość sam zapisał odpowiedź (dla potwierdzonych przez organizatora: czy podał dietę / „brak").
  const [responded, setResponded] = useState(false)
  // Po potwierdzeniu pokazujemy podsumowanie zamiast formularza;
  // `editing` przełącza z powrotem na pełny formularz (skład + diety) wypełniony dotychczasowymi wartościami.
  const [editing, setEditing] = useState(false)
  // Sekcja „Wymagania żywieniowe" (sama dieta, bez zmiany składu).
  const [dietOpen, setDietOpen] = useState(false)
  const [dietSaved, setDietSaved] = useState(false)
  const [askDecline, setAskDecline] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [dietary, setDietary] = useState('')
  const [spouseChoice, setSpouseChoice] = useState<'alone' | 'with' | null>(null)
  const [spouseFirstName, setSpouseFirstName] = useState('')
  const [spouseLastName, setSpouseLastName] = useState('')
  const [spouseDietary, setSpouseDietary] = useState('')
  const [children, setChildren] = useState<ChildRow[]>([])
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    getInvitation(token)
      .then((v) => {
        // Zaproszenie na zwykły event realizuje się rejestracją w lejku (cena, pokój, płatność) —
        // przekierowanie z tokenem, lejek wypełni dane gościa i zepnie zgłoszenie z zaproszeniem.
        if (v.event.type && v.event.type !== 'INVITE' && v.event.slug) {
          navigate(`/r/${v.event.slug}?inv=${encodeURIComponent(token)}`, { replace: true })
          return
        }
        setInv(v)
        if (v.confirmedAt) setConfirmed(true)
        else if (v.declinedAt) setDeclined(true)
        setResponded(!!v.guestRespondedAt)
        // Potwierdzony przez organizatora i jeszcze bez odpowiedzi → od razu otwarta sekcja diet.
        setDietOpen(!!v.confirmedAt && v.confirmedBy === 'ADMIN' && !v.guestRespondedAt && !v.eventStarted)
        setDietary(v.dietaryNotes ?? '')
        setSpouseChoice(v.spouseAttending === true ? 'with' : v.spouseAttending === false ? 'alone' : null)
        setSpouseFirstName(v.spouseFirstName ?? '')
        setSpouseLastName(v.spouseLastName ?? '')
        setSpouseDietary(v.spouseDietaryNotes ?? '')
        setChildren(
          (v.children ?? []).map((c) => ({
            key: `c-${++childKeyCounter}`,
            age: String(c.age),
            firstName: c.firstName ?? '',
            dietary: c.dietary ?? '',
          })),
        )
        document.title = `${t('invite.title_prefix')} — ${pickLang(v.event.title as string | Record<string, string>, i18n.language)}`
      })
      .catch(() => setError(true))
  }, [token])

  /**
   * Pełny formularz (skład + diety). Organizator mógł wpisać małżonka bez nazwiska — wtedy
   * podpowiadamy nazwisko osoby głównej (pole jest wymagane), a gość może je poprawić
   * (np. Kowalski → Kowalska). Na karcie bez nazwiska pokazujemy samo imię.
   */
  function startEditing() {
    if (inv && spouseChoice === 'with' && !spouseLastName.trim()) setSpouseLastName(inv.lastName)
    setEditing(true)
  }

  function addChild() {
    setChildren((prev) => [...prev, newChildRow()])
  }
  function updateChild(key: string, patch: Partial<ChildRow>) {
    setChildren((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }
  function removeChild(key: string) {
    setChildren((prev) => prev.filter((c) => c.key !== key))
  }

  function childrenPayload(): ChildEntry[] {
    return children
      .filter((c) => c.age.trim() !== '')
      .map((c) => ({
        age: Number(c.age),
        ...(c.firstName.trim() ? { firstName: c.firstName.trim() } : {}),
        ...(c.dietary.trim() ? { dietary: c.dietary.trim() } : {}),
      }))
  }

  /** Pełne potwierdzenie / zmiana odpowiedzi (skład + diety). */
  async function handleConfirm() {
    if (!token) return
    if (!spouseChoice) {
      setFormError(t('invite.attendance_required'))
      return
    }
    if (spouseChoice === 'with' && (!spouseFirstName.trim() || !spouseLastName.trim())) {
      setFormError(t('invite.spouse_required'))
      return
    }
    setFormError(null)
    setConfirming(true)
    try {
      await confirmInvitation(token, {
        dietaryNotes: dietary,
        spouseAttending: spouseChoice === 'with',
        spouseFirstName: spouseChoice === 'with' ? spouseFirstName : undefined,
        spouseLastName: spouseChoice === 'with' ? spouseLastName : undefined,
        spouseDietaryNotes: spouseChoice === 'with' ? spouseDietary : undefined,
        children: childrenPayload(),
      })
      // Kto potwierdził — jak na serwerze: wcześniejsze potwierdzenie zostaje (np. organizatora),
      // nowe (także po odmowie) jest potwierdzeniem gościa.
      if (!confirmed) setInv((prev) => (prev ? { ...prev, confirmedBy: 'GUEST' } : prev))
      setConfirmed(true)
      setDeclined(false)
      setResponded(true)
      setEditing(false)
      setDietOpen(false)
    } catch {
      setFormError(t('invite.save_error'))
    } finally {
      setConfirming(false)
    }
  }

  /**
   * Zapis samych diet — bez `spouseAttending`, więc skład zostaje taki, jak jest
   * (dzieci wysyłamy w pełnym stanie, bo dieta dziecka siedzi w jego wpisie).
   * `none=true` — „Nikt z nas nie ma wymagań": czyścimy pola i zapisujemy odpowiedź.
   */
  async function handleSaveDiet(none = false) {
    if (!token) return
    const kids = none ? children.map((c) => ({ ...c, dietary: '' })) : children
    if (none) {
      setDietary('')
      setSpouseDietary('')
      setChildren(kids)
    }
    setFormError(null)
    setConfirming(true)
    try {
      await confirmInvitation(token, {
        dietaryNotes: none ? '' : dietary,
        ...(spouseChoice === 'with' ? { spouseDietaryNotes: none ? '' : spouseDietary } : {}),
        children: kids
          .filter((c) => c.age.trim() !== '')
          .map((c) => ({
            age: Number(c.age),
            ...(c.firstName.trim() ? { firstName: c.firstName.trim() } : {}),
            ...(c.dietary.trim() ? { dietary: c.dietary.trim() } : {}),
          })),
      })
      setResponded(true)
      setDietOpen(false)
      setDietSaved(true)
    } catch {
      setFormError(t('invite.save_error'))
    } finally {
      setConfirming(false)
    }
  }

  async function handleDecline() {
    if (!token) return
    setDeclining(true)
    setFormError(null)
    try {
      await declineInvitation(token)
      setInv((prev) => (prev ? { ...prev, confirmedBy: null } : prev))
      setDeclined(true)
      setConfirmed(false)
      setEditing(false)
      setDietOpen(false)
      setAskDecline(false)
    } catch {
      setFormError(t('invite.save_error'))
    } finally {
      setDeclining(false)
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
        <ThemeToggle />
        <p className="text-base font-semibold">{t('invite.invalid_title')}</p>
        <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>{t('invite.invalid_desc')}</p>
      </div>
    )
  }

  if (!inv) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <ThemeToggle />
        <Spinner size="lg" />
      </div>
    )
  }

  const started = inv.eventStarted === true
  const byAdmin = inv.confirmedBy === 'ADMIN' && confirmed
  const summaryChildren = children.filter((c) => c.age.trim() !== '')
  // „Wy" w tekstach, gdy rodzina ma więcej niż jedną osobę.
  const household = spouseChoice === 'with' || summaryChildren.length > 0
  const v = (base: string) => t(`invite.${base}_${household ? 'household' : 'single'}`)

  const adultsCount = 1 + (spouseChoice === 'with' ? 1 : 0)
  const adultsLabel = t('invite.adults', { count: adultsCount })
  const childrenLabel =
    summaryChildren.length > 0
      ? `${t('invite.kids', { count: summaryChildren.length })} (${t('invite.ages', { ages: summaryChildren.map((c) => c.age).join(', ') })})`
      : ''
  const summaryText = `${t('invite.people')}: ${adultsLabel}${childrenLabel ? `, ${childrenLabel}` : ''}`

  // Osoby w rodzinie — do listy na karcie i do pól diety.
  const childLabel = (c: ChildRow) => c.firstName.trim() || t('invite.child_label', { age: c.age })
  const peopleNames = [
    `${inv.firstName} ${inv.lastName}`.trim(),
    ...(spouseChoice === 'with' ? [`${spouseFirstName} ${spouseLastName}`.trim()] : []),
    ...summaryChildren.map((c) => (c.firstName.trim() ? `${c.firstName.trim()} (${c.age})` : t('invite.child_label', { age: c.age }))),
  ]
  const dietEntries: Array<[string, string]> = [
    [inv.firstName, dietary.trim()],
    ...(spouseChoice === 'with' ? ([[spouseFirstName || '—', spouseDietary.trim()]] as Array<[string, string]>) : []),
    ...summaryChildren.map((c) => [childLabel(c), c.dietary.trim()] as [string, string]),
  ]
  const withDiet = dietEntries.filter(([, d]) => d)
  const dietSummary = withDiet.length
    ? withDiet.map(([n, d]) => `${n} — ${d}`).join('; ')
    : byAdmin && !responded
      ? t('invite.diet_unknown')
      : t('invite.diet_none_label')

  const hero = inv.event.theme?.heroImageUrl
  const desc = pickLang(inv.event.description as string | Record<string, string>, i18n.language)

  const linkBtn = (label: string, onClick: () => void, color = 'var(--brand)') => (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-semibold underline"
      style={{ color, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      {label}
    </button>
  )

  /** Pytanie „Nie damy rady przyjść" z potwierdzeniem (bez window.confirm). */
  const declineBlock = !started && (
    askDecline ? (
      <div className="flex flex-col gap-2 rounded-[12px] p-3 w-full" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <p className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{v('decline_question')}</p>
        <div className="flex gap-2 justify-center flex-wrap">
          <button
            type="button"
            onClick={() => { void handleDecline() }}
            disabled={declining}
            className="text-xs font-semibold rounded-[10px] px-3 py-2"
            style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)', cursor: 'pointer' }}
          >
            {declining ? t('invite.declining') : v('decline_yes')}
          </button>
          <button
            type="button"
            onClick={() => setAskDecline(false)}
            className="text-xs font-semibold rounded-[10px] px-3 py-2"
            style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
          >
            {t('invite.cancel')}
          </button>
        </div>
      </div>
    ) : (
      linkBtn(v('decline_link'), () => setAskDecline(true), 'var(--muted)')
    )
  )

  /** Pola diety przy każdej osobie (sama dieta — skład bez zmian). */
  const dietSection = (
    <div className="flex flex-col gap-3 rounded-[15px] px-4 py-4 w-full text-left" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2">
        <Utensils size={16} style={{ color: 'var(--brand)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t('invite.diet_title')}</p>
      </div>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>{v('diet_hint')}</p>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{inv.firstName}</label>
        <input value={dietary} onChange={(e) => setDietary(e.target.value)} placeholder={t('invite.dietary_ph')} className={inputCls} style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }} />
      </div>
      {spouseChoice === 'with' && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{spouseFirstName || '—'}</label>
          <input value={spouseDietary} onChange={(e) => setSpouseDietary(e.target.value)} placeholder={t('invite.dietary_ph')} className={inputCls} style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }} />
        </div>
      )}
      {summaryChildren.map((c) => (
        <div key={c.key} className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: 'var(--ink)' }}>
            {childLabel(c)}{c.firstName.trim() ? ` (${c.age})` : ''}
          </label>
          <input value={c.dietary} onChange={(e) => updateChild(c.key, { dietary: e.target.value })} placeholder={t('invite.dietary_ph')} className={inputCls} style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }} />
        </div>
      ))}
      {formError && <p className="text-xs font-medium" style={{ color: 'var(--err)' }}>{formError}</p>}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => { void handleSaveDiet(false) }}
          disabled={confirming}
          className="w-full text-white text-sm font-semibold rounded-[12px] py-3"
          style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
        >
          {confirming ? t('invite.diet_saving') : t('invite.diet_save')}
        </button>
        <button
          type="button"
          onClick={() => { void handleSaveDiet(true) }}
          disabled={confirming}
          className="w-full text-sm font-semibold rounded-[12px] py-2.5"
          style={{ background: 'var(--surface-2)', color: 'var(--ink)', border: '1px solid var(--border)', cursor: 'pointer' }}
        >
          {v('diet_none')}
        </button>
        {responded && linkBtn(t('invite.cancel'), () => setDietOpen(false), 'var(--muted)')}
      </div>
    </div>
  )

  let body: JSX.Element
  if (declined && !editing) {
    body = (
      <div className="rounded-[15px] px-4 py-4 text-center flex flex-col items-center gap-2" style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <div className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: 'var(--surface)' }}>
          <CalendarX size={22} style={{ color: 'var(--muted)' }} />
        </div>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t('invite.declined_title')}</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>{v('declined_sub')}</p>
        {started ? (
          <p className="text-xs" style={{ color: 'var(--faint)' }}>{t('invite.started_note')}</p>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="mt-1 text-sm font-semibold rounded-[12px] px-4 py-2.5"
            style={{ background: 'var(--surface)', color: 'var(--brand)', border: '1px solid var(--brand)', cursor: 'pointer' }}
          >
            {v('declined_undo')}
          </button>
        )}
      </div>
    )
  } else if (confirmed && !editing) {
    body = (
      <div className="flex flex-col gap-3">
        <div className="rounded-[15px] px-4 py-4 text-center flex flex-col items-center gap-2" style={{ border: '1px solid var(--ok)', background: 'var(--ok-soft)' }}>
          <div className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: 'var(--ok)' }}>
            {byAdmin ? <UserCheck size={22} color="white" /> : <Check size={22} color="white" />}
          </div>
          <p className="text-sm font-semibold" style={{ color: 'var(--ok)' }}>
            {byAdmin ? v('pre_title') : t('invite.confirmed_title')}
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {byAdmin ? v('pre_sub') : t('invite.confirmed_sub', { name: inv.firstName })}
          </p>
          <p className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{peopleNames.join(' · ')}</p>
          <p className="text-[11px]" style={{ color: 'var(--muted)' }}>{summaryText}</p>
          {!dietOpen && (
            <p className="text-xs" style={{ color: 'var(--ink)' }}>
              <span className="font-medium">{t('invite.diet_title')}:</span> {dietSummary}
            </p>
          )}
          {dietSaved && !dietOpen && (
            <p className="text-xs font-semibold" style={{ color: 'var(--ok)' }}>{t('invite.diet_saved')}</p>
          )}
          {started ? (
            <p className="text-xs" style={{ color: 'var(--faint)' }}>{t('invite.started_note')}</p>
          ) : (
            !dietOpen && (
              <div className="flex flex-col items-center gap-1.5 mt-1">
                {linkBtn(t('invite.diet_change'), () => { setDietSaved(false); setDietOpen(true) })}
                {linkBtn(byAdmin ? t('invite.composition_change') : t('invite.change_answer'), startEditing)}
              </div>
            )
          )}
          {inv.guestInvitesEnabled && token && (
            <Link
              to={`/g/${token}`}
              className="mt-2 flex items-center justify-center gap-2 w-full text-sm font-semibold rounded-[12px] py-2.5 no-underline"
              style={{ background: 'var(--surface)', color: 'var(--brand)', border: '1px solid var(--brand)' }}
            >
              <UserPlus size={15} /> {inv.maxGuests ? t('invite.invite_guest_max', { count: inv.maxGuests }) : t('invite.invite_guest')}
            </Link>
          )}
        </div>
        {dietOpen && !started && dietSection}
        {dietOpen && !started && (
          <div className="text-center">{linkBtn(t('invite.composition_change'), startEditing)}</div>
        )}
        <div className="flex justify-center">{declineBlock}</div>
      </div>
    )
  } else if (started) {
    body = (
      <p className="text-sm text-center rounded-[12px] px-4 py-3" style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}>
        {t('invite.started_pending')}
      </p>
    )
  } else {
    body = (
      <>
        {/* Sam/z małżonkiem — kluczowe dla liczby posiłków, dlatego bez domyślnego zaznaczenia. */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{t('invite.spouse_question')}</label>
          <div className="flex rounded-[10px] overflow-hidden p-0.5" style={{ background: 'var(--surface-2)' }}>
            {(['alone', 'with'] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setSpouseChoice(choice)}
                className="flex-1 px-3 py-2 text-xs font-semibold rounded-[8px] transition-all duration-150"
                style={{
                  background: spouseChoice === choice ? 'var(--surface)' : 'transparent',
                  color: spouseChoice === choice ? 'var(--ink)' : 'var(--muted)',
                  boxShadow: spouseChoice === choice ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {choice === 'alone' ? t('invite.spouse_alone') : t('invite.spouse_with')}
              </button>
            ))}
          </div>
        </div>

        {spouseChoice === 'with' && (
          <div className="flex flex-col gap-2 rounded-[12px] p-3" style={{ background: 'var(--surface-2)' }}>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{t('invite.spouse_first_name')}</label>
                <input value={spouseFirstName} onChange={(e) => setSpouseFirstName(e.target.value)} placeholder="Anna" className={inputCls} style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{t('invite.spouse_last_name')}</label>
                <input value={spouseLastName} onChange={(e) => setSpouseLastName(e.target.value)} placeholder="Kowalska" className={inputCls} style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }} />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{t('invite.spouse_dietary')}</label>
              <textarea value={spouseDietary} onChange={(e) => setSpouseDietary(e.target.value)} rows={2} placeholder={t('invite.dietary_ph')} className={inputCls} style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', resize: 'vertical' }} />
            </div>
          </div>
        )}

        {/* Dzieci — opcjonalne, bez wierszy sekcja to sam przycisk. */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{t('invite.children')}</label>
          {children.map((c) => (
            <div key={c.key} className="flex flex-col gap-1.5 rounded-[12px] p-2" style={{ background: 'var(--surface-2)' }}>
              <div className="flex items-center gap-2">
                <input
                  inputMode="numeric"
                  value={c.age}
                  onChange={(e) => updateChild(c.key, { age: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder={t('invite.child_age')}
                  className="rounded-[12px] px-3 py-[11px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  style={{ width: 76, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}
                />
                <input
                  value={c.firstName}
                  onChange={(e) => updateChild(c.key, { firstName: e.target.value })}
                  placeholder={t('invite.child_name')}
                  className="flex-1 min-w-0 rounded-[12px] px-3 py-[11px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}
                />
                <button
                  type="button"
                  onClick={() => removeChild(c.key)}
                  aria-label={t('invite.cancel')}
                  className="p-2 rounded-[8px] transition-colors duration-150 hover:bg-[var(--err-soft)]"
                  style={{ color: 'var(--muted)', border: 'none', background: 'none', cursor: 'pointer' }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <input
                value={c.dietary}
                onChange={(e) => updateChild(c.key, { dietary: e.target.value })}
                placeholder={t('invite.child_dietary')}
                className={inputCls}
                style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addChild}
            className="self-start text-xs font-semibold"
            style={{ color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {t('invite.child_add')}
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{t('invite.dietary')}</label>
          <textarea value={dietary} onChange={(e) => setDietary(e.target.value)} rows={2} placeholder={t('invite.dietary_ph')} className={inputCls} style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)', resize: 'vertical' }} />
        </div>
        {formError && <p className="text-xs font-medium" style={{ color: 'var(--err)' }}>{formError}</p>}
        <button
          onClick={() => { void handleConfirm() }}
          disabled={confirming}
          className="w-full text-white text-base font-semibold rounded-[16px] py-4 transition-all duration-150 active:scale-[0.98] hover:opacity-90"
          style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer', boxShadow: '0 6px 18px rgba(197,106,58,0.32)' }}
        >
          {confirming ? t('invite.confirming') : t('invite.submit')}
        </button>
        <div className="flex flex-col items-center gap-2">
          {editing && linkBtn(t('invite.cancel'), () => { setEditing(false); setFormError(null) }, 'var(--muted)')}
          {!declined && declineBlock}
        </div>
      </>
    )
  }

  return (
    <div className="min-h-screen mx-auto relative" style={{ maxWidth: 452, background: 'var(--bg)' }}>
      <ThemeToggle />
      <LanguageSwitch locales={inv.event.locales ?? []} />
      {/* Hero */}
      <div
        className="relative"
        style={{
          height: 240,
          ...(hero
            ? { background: `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.5)), center/cover no-repeat url(${hero})` }
            : { background: 'linear-gradient(160deg, var(--hero-1), var(--hero-2))' }),
        }}
      >
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>{t('invite.personal')}</p>
          <h1 className="font-serif leading-tight" style={{ fontSize: 30, fontWeight: 500, color: inv.event.theme?.titleColor ?? '#fff' }}>
            {pickLang(inv.event.title as string | Record<string, string>, i18n.language)}
          </h1>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-[22px] py-6">
        <p className="text-base" style={{ color: 'var(--ink)' }}>
          {t('invite.hello')} <span className="font-semibold">{inv.firstName}</span>, {t('invite.welcome_after')}
        </p>
        {inv.invitedByName && (
          <p className="text-sm -mt-3" style={{ color: 'var(--muted)' }}>
            {t('invite.invited_by')} <span className="font-medium" style={{ color: 'var(--ink)' }}>{inv.invitedByName}</span>
          </p>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--ink)' }}>
            <Calendar size={16} style={{ color: 'var(--brand)' }} /> {formatDateRange(inv.event.startsAt, inv.event.endsAt, i18n.language)}
          </div>
          {inv.event.location && (
            <div className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--ink)' }}>
              <MapPin size={16} style={{ color: 'var(--brand)' }} /> {eventLocation(inv.event.location, inv.event.customFields, i18n.language)}
            </div>
          )}
        </div>

        {/* Potwierdzonym przez organizatora status pokazujemy wyżej niż opis — to po to weszli. */}
        {byAdmin && !editing && body}

        {desc && <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--muted)' }}>{desc}</p>}

        <EventContentBlocks content={inv.event.customFields} />

        {!(byAdmin && !editing) && body}
      </div>
    </div>
  )
}
