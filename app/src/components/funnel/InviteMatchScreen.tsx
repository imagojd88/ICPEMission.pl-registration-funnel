import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calendar, MapPin, Check, Lock } from 'lucide-react'
import type { EventInstanceDto } from '@icpe/shared'
import { Input } from '../ui/Input'
import { matchInvite, pickLang, type EventContent } from '../../lib/api'
import { formatDateRange } from '../../lib/utils'
import EventContentBlocks from './EventContentBlocks'

export default function InviteMatchScreen({ event, slug, content }: { event: EventInstanceDto; slug: string; content?: EventContent | null }) {
  const { t, i18n } = useTranslation()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [dietary, setDietary] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmedName, setConfirmedName] = useState<string | null>(null)

  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError(t('invite.required'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await matchInvite(slug, { firstName, lastName, email, dietaryNotes: dietary })
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
