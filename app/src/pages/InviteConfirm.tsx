import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { Calendar, MapPin, Check } from 'lucide-react'
import { getInvitation, confirmInvitation, pickLang, type InvitationView } from '../lib/api'
import { formatDateRange } from '../lib/utils'
import Spinner from '../components/ui/Spinner'
import ThemeToggle from '../components/ui/ThemeToggle'
import EventContentBlocks from '../components/funnel/EventContentBlocks'

export default function InviteConfirm() {
  const { i18n } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const [inv, setInv] = useState<InvitationView | null>(null)
  const [error, setError] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [dietary, setDietary] = useState('')

  useEffect(() => {
    if (!token) return
    getInvitation(token)
      .then((v) => {
        setInv(v)
        if (v.confirmedAt) setConfirmed(true)
        document.title = `Zaproszenie — ${pickLang(v.event.title as string | Record<string, string>, i18n.language)}`
      })
      .catch(() => setError(true))
  }, [token])

  async function handleConfirm() {
    if (!token) return
    setConfirming(true)
    try {
      await confirmInvitation(token, dietary)
      setConfirmed(true)
    } catch {
      setError(true)
    } finally {
      setConfirming(false)
    }
  }

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

        {confirmed ? (
          <div className="rounded-[15px] px-4 py-4 text-center flex flex-col items-center gap-2" style={{ border: '1px solid var(--ok)', background: 'var(--ok-soft)' }}>
            <div className="flex items-center justify-center rounded-full" style={{ width: 44, height: 44, background: 'var(--ok)' }}>
              <Check size={22} color="white" />
            </div>
            <p className="text-sm font-semibold" style={{ color: 'var(--ok)' }}>Udział potwierdzony</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Dziękujemy, {inv.firstName}! Do zobaczenia.</p>
          </div>
        ) : (
          <>
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
