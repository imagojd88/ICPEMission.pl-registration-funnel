import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { bcp47 } from '../../lib/utils'
import { joinWaitlist } from '../../lib/api'

interface Props {
  /** Start zapisów (ISO). */
  opensAt: string
  /** Wywoływane raz, gdy licznik dojdzie do zera — strona pokazuje wtedy przycisk zapisu. */
  onOpen: () => void
  /** Id eventu — z nim pod licznikiem jest zapis na listę oczekujących. */
  instanceId?: string
}

/** Licznik do startu zapisów: dni / godziny / minuty / sekundy + data i godzina otwarcia. */
export default function RegistrationCountdown({ opensAt, onOpen, instanceId }: Props) {
  const { t, i18n } = useTranslation()
  const target = new Date(opensAt).getTime()
  const [now, setNow] = useState(() => Date.now())
  // Lista oczekujących: e-mail do jednorazowego powiadomienia o starcie zapisów.
  const [email, setEmail] = useState('')
  const [wlState, setWlState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
  const submitWaitlist = async () => {
    if (!instanceId || !emailOk || wlState === 'sending') return
    setWlState('sending')
    try {
      await joinWaitlist({ instanceId, email: email.trim(), locale: i18n.language.slice(0, 2) })
      setWlState('done')
    } catch {
      setWlState('error')
    }
  }

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const left = Math.max(0, target - now)
  useEffect(() => {
    if (left === 0) onOpen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left === 0])

  const sec = Math.floor(left / 1000)
  const parts = [
    { v: Math.floor(sec / 86400), label: t('countdown.days') },
    { v: Math.floor((sec % 86400) / 3600), label: t('countdown.hours') },
    { v: Math.floor((sec % 3600) / 60), label: t('countdown.minutes') },
    { v: sec % 60, label: t('countdown.seconds') },
  ]
  // Godzina startu zawsze w czasie polskim (tak ustawia ją organizator), z nazwą strefy: CET zimą, CEST latem.
  const EVENT_TZ = 'Europe/Warsaw'
  const whenFmt = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' } as const
  const targetDate = new Date(target)
  let when = targetDate.toLocaleString(bcp47(i18n.language), whenFmt)
  let localWhen: string | null = null
  try {
    const tzName = new Intl.DateTimeFormat('en-GB', { timeZone: EVENT_TZ, timeZoneName: 'short' })
      .formatToParts(targetDate).find((x) => x.type === 'timeZoneName')?.value ?? ''
    const zone = /^CES?T$/.test(tzName) ? tzName : 'CET'
    when = `${targetDate.toLocaleString(bcp47(i18n.language), { ...whenFmt, timeZone: EVENT_TZ })} ${zone}`
    // Gość w innej strefie dostaje dodatkowo godzinę w swoim czasie.
    const wall = (tz?: string) => targetDate.toLocaleString('en-GB', { ...whenFmt, timeZone: tz })
    if (wall(EVENT_TZ) !== wall(undefined)) {
      localWhen = targetDate.toLocaleString(bcp47(i18n.language), { ...whenFmt, timeZoneName: 'short' })
    }
  } catch {
    /* stara przeglądarka bez stref czasowych: zostaje czas lokalny bez etykiety */
  }

  return (
    <>
    <div
      className="flex flex-col gap-3 rounded-[16px] p-4"
      style={{ background: 'var(--brand-soft)', border: '1px solid var(--brand)' }}
      role="timer"
      aria-label={t('landing.opens_title')}
    >
      <p className="text-sm font-semibold text-center" style={{ color: 'var(--brand)' }}>
        {t('landing.opens_title')}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {parts.map((p) => (
          <div key={p.label} className="flex flex-col items-center rounded-[12px] py-2" style={{ background: 'var(--surface)' }}>
            <span className="text-2xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {String(p.v).padStart(2, '0')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.label}</span>
          </div>
        ))}
      </div>
      <p className="text-sm text-center" style={{ color: 'var(--ink)' }}>
        {t('landing.opens_at', { date: when })}
      </p>
      {localWhen && (
        <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
          {t('landing.opens_at_local', { date: localWhen })}
        </p>
      )}
    </div>

    {/* Lista oczekujących */}
    {instanceId && (
      <div className="flex flex-col gap-2 rounded-[16px] p-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t('waitlist.title')}</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>{t('waitlist.desc')}</p>
        {wlState === 'done' ? (
          <p className="text-sm font-medium" role="status" style={{ color: 'var(--ok)' }}>{t('waitlist.done')}</p>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void submitWaitlist()
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (wlState === 'error') setWlState('idle') }}
              placeholder={t('waitlist.email_placeholder')}
              aria-label={t('waitlist.email_placeholder')}
              autoComplete="email"
              className="flex-1 min-w-0 rounded-[12px] px-3 py-[13px] text-sm focus:outline-none focus:ring-2"
              style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }}
            />
            <button
              type="submit"
              disabled={!emailOk || wlState === 'sending'}
              className="px-4 text-sm font-semibold rounded-[12px] text-white shrink-0 transition-all duration-150 active:scale-[0.97]"
              style={{ background: 'var(--accent)', border: 'none', cursor: emailOk ? 'pointer' : 'not-allowed', opacity: emailOk && wlState !== 'sending' ? 1 : 0.6 }}
            >
              {t('waitlist.submit')}
            </button>
          </form>
        )}
        {wlState === 'error' && <p className="text-xs" role="alert" style={{ color: 'var(--err)' }}>{t('waitlist.error')}</p>}
        {wlState !== 'done' && <p style={{ fontSize: 11, color: 'var(--faint)' }}>{t('waitlist.consent')}</p>}
      </div>
    )}
    </>
  )
}
