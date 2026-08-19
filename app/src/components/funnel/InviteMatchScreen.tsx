import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, MapPin, Check, Lock, Trash2 } from 'lucide-react'
import type { EventInstanceDto } from '@icpe/shared'
import { Input } from '../ui/Input'
import { matchInvite, pickLang, type EventContent, type ChildEntry } from '../../lib/api'
import { formatDateRange } from '../../lib/utils'
import EventContentBlocks from './EventContentBlocks'

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

export default function InviteMatchScreen({ event, slug, content }: { event: EventInstanceDto; slug: string; content?: EventContent | null }) {
  const { t, i18n } = useTranslation()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [dietary, setDietary] = useState('')
  const [spouseChoice, setSpouseChoice] = useState<'alone' | 'with' | null>(null)
  const [spouseFirstName, setSpouseFirstName] = useState('')
  const [spouseLastName, setSpouseLastName] = useState('')
  const [spouseDietary, setSpouseDietary] = useState('')
  const [children, setChildren] = useState<ChildRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmedName, setConfirmedName] = useState<string | null>(null)

  function addChild() {
    setChildren((prev) => [...prev, newChildRow()])
  }
  function updateChild(key: string, patch: Partial<ChildRow>) {
    setChildren((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  }
  function removeChild(key: string) {
    setChildren((prev) => prev.filter((c) => c.key !== key))
  }

  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError(t('invite.required'))
      return
    }
    if (!spouseChoice) {
      setError(t('invite.attendance_required'))
      return
    }
    if (spouseChoice === 'with' && (!spouseFirstName.trim() || !spouseLastName.trim())) {
      setError(t('invite.spouse_required'))
      return
    }
    const childrenPayload: ChildEntry[] = children
      .filter((c) => c.age.trim() !== '')
      .map((c) => ({ age: Number(c.age), ...(c.firstName.trim() ? { firstName: c.firstName.trim() } : {}) }))
    setBusy(true)
    setError(null)
    try {
      const res = await matchInvite(slug, {
        firstName,
        lastName,
        email,
        dietaryNotes: dietary,
        spouseAttending: spouseChoice === 'with',
        spouseFirstName: spouseChoice === 'with' ? spouseFirstName : undefined,
        spouseLastName: spouseChoice === 'with' ? spouseLastName : undefined,
        spouseDietaryNotes: spouseChoice === 'with' ? spouseDietary : undefined,
        children: childrenPayload,
      })
      setConfirmedName(res.firstName)
    } catch {
      setError(t('invite.not_found'))
    } finally {
      setBusy(false)
    }
  }

  const desc = pickLang(event.description as string | Record<string, string> | undefined, i18n.language)

  if (confirmedName) {
    return (
      <div className="flex flex-col items-center gap-4 px-[22px] py-14 text-center">
        <div className="flex items-center justify-center rounded-full" style={{ width: 60, height: 60, background: 'var(--ok-soft)' }}>
          <Check size={30} style={{ color: 'var(--ok)' }} />
        </div>
        <h2 className="font-serif" style={{ fontSize: 24, color: 'var(--ink)' }}>{t('invite.confirmed_title')}</h2>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('invite.confirmed_sub', { name: confirmedName })}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 px-[22px] py-5">
      {/* Komunikat od razu pod hero — zanim gość zacznie szukać przycisku „Zapisz się",
          którego na evencie na zaproszenie celowo nie ma. */}
      <div
        className="rounded-[15px] px-4 py-3.5 flex items-start gap-3"
        style={{ background: 'var(--brand-soft)', border: '1px solid var(--brand)' }}
        role="note"
      >
        <Lock size={18} style={{ color: 'var(--brand)', flexShrink: 0, marginTop: 2 }} />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>{t('invite.only_badge')}</p>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{t('invite.only_note')}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--ink)' }}>
          <Calendar size={16} style={{ color: 'var(--brand)' }} /> {formatDateRange(event.startsAt, event.endsAt, i18n.language)}
        </div>
        {event.location && (
          <div className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--ink)' }}>
            <MapPin size={16} style={{ color: 'var(--brand)' }} /> {event.location}
          </div>
        )}
      </div>

      {desc && <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--muted)' }}>{desc}</p>}

      <EventContentBlocks content={content} />

      <div className="rounded-[15px] p-4 flex flex-col gap-3" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t('invite.confirm_title')}</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>{t('invite.confirm_hint')}</p>
        <div className="grid grid-cols-2 gap-2">
          <Input label={t('invite.first_name')} value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jan" />
          <Input label={t('invite.last_name')} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Kowalski" />
        </div>
        <Input label={t('invite.email')} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jan@example.com" />

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
              <Input label={t('invite.spouse_first_name')} value={spouseFirstName} onChange={(e) => setSpouseFirstName(e.target.value)} placeholder="Anna" />
              <Input label={t('invite.spouse_last_name')} value={spouseLastName} onChange={(e) => setSpouseLastName(e.target.value)} placeholder="Kowalska" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{t('invite.spouse_dietary')}</label>
              <textarea
                value={spouseDietary}
                onChange={(e) => setSpouseDietary(e.target.value)}
                rows={2}
                placeholder={t('invite.dietary_ph')}
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

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{t('invite.dietary')}</label>
          <textarea
            value={dietary}
            onChange={(e) => setDietary(e.target.value)}
            rows={2}
            placeholder={t('invite.dietary_ph')}
            className="w-full rounded-[12px] px-3 py-[11px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)', resize: 'vertical' }}
          />
        </div>
        {error && <p className="text-xs font-medium" style={{ color: 'var(--err)' }}>{error}</p>}
        <button
          onClick={() => { void handleSubmit() }}
          disabled={busy}
          className="w-full text-white text-base font-semibold rounded-[16px] py-4 transition-all duration-150 active:scale-[0.98] hover:opacity-90 mt-1"
          style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
        >
          {busy ? t('invite.checking') : t('invite.submit')}
        </button>
      </div>
    </div>
  )
}
