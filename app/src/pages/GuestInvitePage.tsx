import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { Calendar, Check, Clock, MapPin, Send, UserPlus, X } from 'lucide-react'
import {
  addGuestInvite,
  getGuestInvites,
  pickLang,
  removeGuestInvite,
  type GuestBlockedReason,
  type GuestInviteView,
} from '../lib/api'
import { formatDateRange } from '../lib/utils'
import Spinner from '../components/ui/Spinner'
import ThemeToggle from '../components/ui/ThemeToggle'
import LanguageSwitch from '../components/ui/LanguageSwitch'

const EMPTY = { firstName: '', lastName: '', email: '', phone: '' }

const inputCls =
  'w-full rounded-[12px] px-3 py-[11px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]'
const inputStyle = { border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' } as const

/**
 * Strona „Zaproś gościa" (`/g/:token`). Token to osobisty link uczestnika:
 * token zaproszenia (event na zaproszenie) albo editToken zgłoszenia (zwykły event).
 * Gość trafia na tę samą listę co osoby dodane przez admina i dostaje mail z zaproszeniem.
 */
export default function GuestInvitePage() {
  const { t, i18n } = useTranslation()

  // Komunikat, dlaczego nie można (już) zapraszać — klucze guest.blocked_<POWÓD>.
  function blockedText(reason: GuestBlockedReason, max: number): string {
    return reason ? t(`guest.blocked_${reason}`, { max }) : ''
  }
  const { token } = useParams<{ token: string }>()
  const [view, setView] = useState<GuestInviteView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [sending, setSending] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    getGuestInvites(token)
      .then((v) => {
        setView(v)
        document.title = `${t('guest.page_title')} — ${pickLang(v.event.title as string | Record<string, string>, i18n.language)}`
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  function validate(): string | null {
    if (!form.firstName.trim() || !form.lastName.trim()) return t('guest.err_name')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return t('guest.err_email')
    if (form.phone.replace(/\D/g, '').length < 7) return t('guest.err_phone')
    return null
  }

  async function handleSubmit() {
    if (!token || sending) return
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setSending(true)
    setError(null)
    setInfo(null)
    try {
      const next = await addGuestInvite(token, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      })
      setView(next)
      const who = `${form.firstName.trim()} ${form.lastName.trim()}`
      if (next.added?.mailStatus === 'SENT') {
        setInfo(t('guest.ok_sent', { name: who, email: form.email.trim() }))
      } else {
        // Gość jest na liście — organizator widzi go w panelu i może wysłać zaproszenie inną drogą.
        setInfo(t('guest.ok_no_mail', { name: who }))
      }
      setForm(EMPTY)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  async function handleRemove(id: string, name: string) {
    if (!token) return
    if (!window.confirm(t('guest.withdraw_confirm', { name }))) return
    setBusyId(id)
    setError(null)
    setInfo(null)
    try {
      setView(await removeGuestInvite(token, id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-6" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
        <ThemeToggle />
        <p className="text-base font-semibold">{t('guest.invalid_title')}</p>
        <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>{loadError}</p>
      </div>
    )
  }

  if (!view) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <ThemeToggle />
        <Spinner size="lg" />
      </div>
    )
  }

  const hero = view.event.theme?.heroImageUrl
  const title = pickLang(view.event.title as string | Record<string, string>, i18n.language)
  const register = view.guestFlow === 'REGISTER'

  return (
    <div className="min-h-screen mx-auto relative" style={{ maxWidth: 452, background: 'var(--bg)' }}>
      <ThemeToggle />
      <LanguageSwitch locales={view.event.locales ?? []} />
      <div
        className="relative"
        style={{
          height: 200,
          ...(hero
            ? { background: `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.5)), center/cover no-repeat url(${hero})` }
            : { background: 'linear-gradient(160deg, var(--hero-1), var(--hero-2))' }),
        }}
      >
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>{t('guest.page_title')}</p>
          <h1 className="font-serif leading-tight" style={{ fontSize: 28, fontWeight: 500, color: view.event.theme?.titleColor ?? '#fff' }}>
            {title}
          </h1>
        </div>
      </div>

      <div className="flex flex-col gap-5 px-[22px] py-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--ink)' }}>
            <Calendar size={16} style={{ color: 'var(--brand)' }} /> {formatDateRange(view.event.startsAt, view.event.endsAt, i18n.language)}
          </div>
          {view.event.location && (
            <div className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--ink)' }}>
              <MapPin size={16} style={{ color: 'var(--brand)' }} /> {view.event.location}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-base" style={{ color: 'var(--ink)' }}>
            {t('invite.hello')} <span className="font-semibold">{view.inviter.firstName}</span>!
          </p>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
            {register ? t('guest.intro_register') : t('guest.intro_confirm')}
          </p>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {t('guest.remaining', { remaining: view.remaining, max: view.maxGuests })}
          </p>
        </div>

        {error && (
          <p className="text-xs font-medium px-3 py-2 rounded-[8px]" style={{ background: 'var(--err-soft)', color: 'var(--err)' }}>{error}</p>
        )}
        {info && (
          <p className="text-xs font-medium px-3 py-2 rounded-[8px]" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>{info}</p>
        )}

        {view.canInvite ? (
          <div className="flex flex-col gap-2.5 rounded-[15px] p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              <UserPlus size={16} style={{ color: 'var(--brand)' }} /> {t('guest.guest_data')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} style={inputStyle} placeholder={t('invite.first_name')} autoComplete="off"
                value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
              <input className={inputCls} style={inputStyle} placeholder={t('invite.last_name')} autoComplete="off"
                value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
            </div>
            <input className={inputCls} style={inputStyle} placeholder={t('invite.email')} type="email" inputMode="email" autoComplete="off"
              value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            <input className={inputCls} style={inputStyle} placeholder={t('guest.phone_ph')} type="tel" inputMode="tel" autoComplete="off"
              value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            <p className="text-[11px]" style={{ color: 'var(--faint)' }}>
              {t('guest.consent')}
            </p>
            <button
              type="button"
              onClick={() => { void handleSubmit() }}
              disabled={sending}
              className="w-full flex items-center justify-center gap-2 text-white text-base font-semibold rounded-[16px] py-3.5 transition-all duration-150 active:scale-[0.98] hover:opacity-90"
              style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer', boxShadow: '0 6px 18px rgba(197,106,58,0.32)' }}
            >
              <Send size={16} /> {sending ? t('guest.sending') : t('guest.send')}
            </button>
          </div>
        ) : (
          <p className="text-sm px-4 py-3 rounded-[12px]" style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            {blockedText(view.blockedReason, view.maxGuests)}
          </p>
        )}

        {view.guests.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>{t('guest.your_guests')}</p>
            {view.guests.map((g) => {
              const confirmed = g.status === 'CONFIRMED'
              const name = `${g.firstName} ${g.lastName}`
              return (
                <div key={g.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[12px]"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{name}</p>
                    <p className="text-xs truncate" style={{ color: 'var(--faint)' }}>{g.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full"
                      style={confirmed
                        ? { background: 'var(--ok-soft)', color: 'var(--ok)' }
                        : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
                    >
                      {confirmed ? <Check size={12} /> : <Clock size={12} />}
                      {confirmed ? (register ? t('guest.status_registered') : t('guest.status_confirmed')) : t('guest.status_invited')}
                    </span>
                    {!confirmed && (
                      <button
                        type="button"
                        onClick={() => { void handleRemove(g.id, name) }}
                        disabled={busyId === g.id}
                        aria-label={`${t('guest.withdraw')}: ${name}`}
                        title={t('guest.withdraw')}
                        className="p-1.5 rounded-[8px]"
                        style={{ color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', cursor: 'pointer' }}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
