import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { Calendar, MapPin, Check, Trash2 } from 'lucide-react'
import { getInvitation, confirmInvitation, pickLang, type InvitationView, type ChildEntry } from '../lib/api'
import { formatDateRange } from '../lib/utils'
import Spinner from '../components/ui/Spinner'
import ThemeToggle from '../components/ui/ThemeToggle'
import EventContentBlocks from '../components/funnel/EventContentBlocks'

/** Wiersz dziecka w formularzu — `age` jako string, żeby pole mogło być puste w trakcie edycji. */
interface ChildRow {
  key: string
  age: string
  firstName: string
}

let childKeyCounter = 0
function newChildRow(): ChildRow {
  return { key: `c-${++childKeyCounter}`, age: '', firstName: '' }
}

export default function InviteConfirm() {
  const { t, i18n } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const [inv, setInv] = useState<InvitationView | null>(null)
  const [error, setError] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  // Gość może wrócić i zmienić deklarację — po potwierdzeniu pokazujemy podsumowanie,
  // `editing` przełącza z powrotem na formularz wypełniony dotychczasowymi wartościami.
  const [editing, setEditing] = useState(false)
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
        setInv(v)
        if (v.confirmedAt) setConfirmed(true)
        setDietary(v.dietaryNotes ?? '')
        setSpouseChoice(v.spouseAttending === true ? 'with' : v.spouseAttending === false ? 'alone' : null)
        setSpouseFirstName(v.spouseFirstName ?? '')
        setSpouseLastName(v.spouseLastName ?? '')
        setSpouseDietary(v.spouseDietaryNotes ?? '')
        setChildren(
          (v.children ?? []).map((c) => ({ key: `c-${++childKeyCounter}`, age: String(c.age), firstName: c.firstName ?? '' })),
        )
        document.title = `Zaproszenie — ${pickLang(v.event.title as string | Record<string, string>, i18n.language)}`
      })
      .catch(() => setError(true))
  }, [token])

  function addChild() {
    setChildren((prev) => [...prev, newChildRow()])
  }
  function updateChild(key: string, patch: Partial<ChildRow>) {
    setChildren((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }
  function removeChild(key: string) {
    setChildren((prev) => prev.filter((c) => c.key !== key))
  }

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
    const childrenPayload: ChildEntry[] = children
      .filter((c) => c.age.trim() !== '')
      .map((c) => ({ age: Number(c.age), ...(c.firstName.trim() ? { firstName: c.firstName.trim() } : {}) }))
    setFormError(null)
    setConfirming(true)
    try {
      await confirmInvitation(token, {
        dietaryNotes: dietary,
        spouseAttending: spouseChoice === 'with',
        spouseFirstName: spouseChoice === 'with' ? spouseFirstName : undefined,
        spouseLastName: spouseChoice === 'with' ? spouseLastName : undefined,
        spouseDietaryNotes: spouseChoice === 'with' ? spouseDietary : undefined,
        children: childrenPayload,
      })
      setConfirmed(true)
      setEditing(false)
    } catch {
      setError(true)
    } finally {
      setConfirming(false)
    }
  }

  // Podsumowanie deklaracji na ekranie sukcesu — liczone z bieżącego stanu formularza,
  // który po potwierdzeniu odzwierciedla to, co właśnie zostało wysłane.
  const summaryChildren = children.filter((c) => c.age.trim() !== '')
  const adultsCount = 1 + (spouseChoice === 'with' ? 1 : 0)
  const adultsLabel = `${adultsCount} ${adultsCount === 1 ? 'dorosły' : 'dorosłych'}`
  const childrenLabel =
    summaryChildren.length > 0
      ? `${summaryChildren.length} ${summaryChildren.length === 1 ? 'dziecko' : 'dzieci'} (${summaryChildren.map((c) => c.age).join(', ')} lat)`
      : ''
  const summaryText = `Osoby: ${adultsLabel}${childrenLabel ? `, ${childrenLabel}` : ''}`

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
        <ThemeToggle />
        <p className="text-base font-semibold">Zaproszenie nieaktualne</p>
        <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>Ten link jest nieprawidłowy lub wygasł.</p>
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

  const hero = inv.event.theme?.heroImageUrl
  const desc = pickLang(inv.event.description as string | Record<string, string>, i18n.language)

  return (
    <div className="min-h-screen mx-auto relative" style={{ maxWidth: 452, background: 'var(--bg)' }}>
      <ThemeToggle />
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
          <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>Zaproszenie imienne</p>
          <h1 className="font-serif leading-tight" style={{ fontSize: 30, fontWeight: 500, color: inv.event.theme?.titleColor ?? '#fff' }}>
            {pickLang(inv.event.title as string | Record<string, string>, i18n.language)}
          </h1>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-[22px] py-6">
        <p className="text-base" style={{ color: 'var(--ink)' }}>
          Cześć <span className="font-semibold">{inv.firstName}</span>, serdecznie zapraszamy!
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--ink)' }}>
            <Calendar size={16} style={{ color: 'var(--brand)' }} /> {formatDateRange(inv.event.startsAt, inv.event.endsAt, i18n.language)}
          </div>
          {inv.event.location && (
            <div className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--ink)' }}>
              <MapPin size={16} style={{ color: 'var(--brand)' }} /> {inv.event.location}
            </div>
          )}
        </div>

        {desc && <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--muted)' }}>{desc}</p>}

        <EventContentBlocks content={inv.event.customFields} />

        {confirmed && !editing ? (
          <div className="rounded-[15px] px-4 py-4 text-center flex flex-col items-center gap-2" style={{ border: '1px solid var(--ok)', background: 'var(--ok-soft)' }}>
            <div className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: 'var(--ok)' }}>
              <Check size={22} color="white" />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ok)' }}>Udział potwierdzony</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Dziękujemy, {inv.firstName}! Do zobaczenia.</p>
            <p className="text-xs font-medium" style={{ color: 'var(--ink)' }}>{summaryText}</p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-semibold underline"
              style={{ color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4 }}
            >
              {t('invite.change_answer')}
            </button>
          </div>
        ) : (
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
                    <input
                      value={spouseFirstName}
                      onChange={(e) => setSpouseFirstName(e.target.value)}
                      placeholder="Anna"
                      className="w-full rounded-[12px] px-3 py-[11px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                      style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{t('invite.spouse_last_name')}</label>
                    <input
                      value={spouseLastName}
                      onChange={(e) => setSpouseLastName(e.target.value)}
                      placeholder="Kowalska"
                      className="w-full rounded-[12px] px-3 py-[11px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                      style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)' }}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{t('invite.spouse_dietary')}</label>
                  <textarea
                    value={spouseDietary}
                    onChange={(e) => setSpouseDietary(e.target.value)}
                    rows={2}
                    placeholder="np. wegetariańska, bez glutenu"
                    className="w-full rounded-[12px] px-3 py-[11px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', resize: 'vertical' }}
                  />
                </div>
              </div>
            )}

            {/* Dzieci — opcjonalne, bez wierszy sekcja to sam przycisk. */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{t('invite.children')}</label>
              {children.map((c) => (
                <div key={c.key} className="flex items-center gap-2">
                  <input
                    inputMode="numeric"
                    value={c.age}
                    onChange={(e) => updateChild(c.key, { age: e.target.value.replace(/[^0-9]/g, '') })}
                    placeholder={t('invite.child_age')}
                    className="rounded-[12px] px-3 py-[11px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    style={{ width: 76, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }}
                  />
                  <input
                    value={c.firstName}
                    onChange={(e) => updateChild(c.key, { firstName: e.target.value })}
                    placeholder={t('invite.child_name')}
                    className="flex-1 rounded-[12px] px-3 py-[11px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }}
                  />
                  <button
                    type="button"
                    onClick={() => removeChild(c.key)}
                    aria-label={t('invite.child_add')}
                    className="p-2 rounded-[8px] transition-colors duration-150 hover:bg-[var(--err-soft)]"
                    style={{ color: 'var(--muted)', border: 'none', background: 'none', cursor: 'pointer' }}
                  >
                    <Trash2 size={15} />
                  </button>
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
              <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                Alergie / wymagania żywieniowe (opcjonalnie)
              </label>
              <textarea
                value={dietary}
                onChange={(e) => setDietary(e.target.value)}
                rows={2}
                placeholder="np. wegetariańska, bez glutenu"
                className="w-full rounded-[12px] px-3 py-[11px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)', resize: 'vertical' }}
              />
            </div>
            {formError && <p className="text-xs font-medium" style={{ color: 'var(--err)' }}>{formError}</p>}
            <button
              onClick={() => { void handleConfirm() }}
              disabled={confirming}
              className="w-full text-white text-base font-semibold rounded-[16px] py-4 transition-all duration-150 active:scale-[0.98] hover:opacity-90"
              style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer', boxShadow: '0 6px 18px rgba(197,106,58,0.32)' }}
            >
              {confirming ? 'Potwierdzam…' : 'Potwierdzam udział →'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
