import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { bcp47 } from '../../lib/utils'

interface Props {
  /** Start zapisów (ISO). */
  opensAt: string
  /** Wywoływane raz, gdy licznik dojdzie do zera — strona pokazuje wtedy przycisk zapisu. */
  onOpen: () => void
}

/** Licznik do startu zapisów: dni / godziny / minuty / sekundy + data i godzina otwarcia. */
export default function RegistrationCountdown({ opensAt, onOpen }: Props) {
  const { t, i18n } = useTranslation()
  const target = new Date(opensAt).getTime()
  const [now, setNow] = useState(() => Date.now())

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
  const when = new Date(target).toLocaleString(bcp47(i18n.language), {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
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
    </div>
  )
}
