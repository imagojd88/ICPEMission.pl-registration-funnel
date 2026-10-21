import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EventInstanceDto } from '@icpe/shared'
import { buildIcs, googleCalendarUrl } from '@icpe/shared'
import { createRsvp, pickLang, eventLocation, type EventContent } from '../../lib/api'
import { bcp47 } from '../../lib/utils'

type Response = 'YES' | 'NO'

function formatRange(startsAt: string, endsAt: string, lng: string): string {
  const loc = bcp47(lng)
  const s = new Date(startsAt)
  const e = new Date(endsAt)
  const d = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric' }).format(s)
  const t = (x: Date) =>
    new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' }).format(x)
  return `${d} · ${t(s)}–${t(e)}`
}

export default function RsvpScreen({
  event,
  onBack,
  content,
}: {
  event: EventInstanceDto
  onBack: () => void
  content?: EventContent | null
}) {
  const [response, setResponse] = useState<Response | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<Response | null>(null)
  const { t, i18n } = useTranslation()
  const lng = i18n.language

  const title = pickLang(event.title as string | Record<string, string>, lng) || t('rsvp.event_fallback')

  const submit = async () => {
    if (!response || !name.trim()) return
    setSubmitting(true)
    try {
      await createRsvp({
        instanceId: event.id,
        name: name.trim(),
        email: email.trim() || undefined,
        response,
        locale: lng,
      })
      setDone(response)
    } finally {
      setSubmitting(false)
    }
  }

  const downloadIcs = () => {
    const ics = buildIcs({
      uid: `rsvp-${event.id}@icpe`,
      title,
      startsAt: new Date(event.startsAt),
      endsAt: new Date(event.endsAt),
      location: event.location ?? undefined,
      details: 'ICPE Mission',
    })
    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${event.slug || 'spotkanie'}.ics`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 500)
  }

  const gcalUrl = googleCalendarUrl({
    uid: `rsvp-${event.id}@icpe`,
    title,
    startsAt: new Date(event.startsAt),
    endsAt: new Date(event.endsAt),
    location: event.location ?? undefined,
    details: 'ICPE Mission',
  })

  // ── Potwierdzenie ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
        <div className="flex flex-col items-center text-center gap-4 px-[22px] pt-16">
          <div
            className="flex items-center justify-center"
            style={{ width: 64, height: 64, borderRadius: '50%', background: done === 'YES' ? 'var(--ok-soft)' : 'var(--surface-3)' }}
          >
            <span style={{ fontSize: 28, color: done === 'YES' ? 'var(--ok)' : 'var(--muted)' }}>
              {done === 'YES' ? '✓' : '–'}
            </span>
          </div>
          <h2 className="font-serif" style={{ fontSize: 25, fontWeight: 500, color: 'var(--ink)' }}>
            {done === 'YES' ? t('rsvp.thanks_yes') : t('rsvp.thanks_no')}
          </h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {done === 'YES'
              ? t('rsvp.see_you', { title })
              : t('rsvp.maybe_next')}
          </p>

          {done === 'YES' && (
            <div className="flex flex-col gap-2.5 w-full mt-2">
              <a
                href={gcalUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full text-center text-sm font-semibold py-3 rounded-[14px]"
                style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border)' }}
              >
                📆 {t('rsvp.add_gcal')}
              </a>
              <button
                onClick={downloadIcs}
                className="w-full text-sm font-semibold py-3 rounded-[14px]"
                style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                ⬇ {t('rsvp.download_ics')}
              </button>
            </div>
          )}

          <button
            onClick={onBack}
            className="text-sm font-semibold mt-2"
            style={{ color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← {t('rsvp.back')}
          </button>
        </div>
      </div>
    )
  }

  // ── Formularz RSVP ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      {/* Hero */}
      <div
        className="relative overflow-hidden px-[22px] flex flex-col justify-end"
        style={{ height: 200, background: 'linear-gradient(160deg, var(--hero-1), var(--hero-2))' }}
      >
        <span
          className="absolute top-4 left-[22px] text-white text-xs font-semibold px-3 py-1.5"
          style={{ background: 'var(--accent)', borderRadius: 99 }}
        >
          {t('rsvp.free_entry')}
        </span>
        <div className="pb-5">
          <p className="text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.85)' }}>
            {t('rsvp.open_event')}
          </p>
          <h1 className="font-serif" style={{ fontSize: 30, fontWeight: 500, color: 'var(--hero-title)', lineHeight: 1.1 }}>
            {title}
          </h1>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-[22px] py-[22px]">
        {/* Meta */}
        <div className="flex flex-col gap-1">
          <p className="text-sm" style={{ color: 'var(--ink)', fontWeight: 600 }}>
            {formatRange(event.startsAt, event.endsAt, i18n.language)}
          </p>
          {event.location && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {eventLocation(event.location, content, lng)}
            </p>
          )}
        </div>

        {event.description && (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {pickLang(event.description as string | Record<string, string>, lng)}
          </p>
        )}

        {/* RSVP buttons */}
        <p className="text-xs font-semibold mt-1" style={{ color: 'var(--faint)' }}>
          {t('rsvp.question')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(['YES', 'NO'] as Response[]).map((r) => {
            const active = response === r
            return (
              <button
                key={r}
                onClick={() => setResponse(r)}
                className="py-4 rounded-[15px] text-sm font-bold transition-colors"
                style={{
                  background: active ? (r === 'YES' ? 'var(--brand-soft)' : 'var(--surface-3)') : 'var(--surface)',
                  color: active ? (r === 'YES' ? 'var(--brand)' : 'var(--ink)') : 'var(--muted)',
                  border: `1.5px solid ${active ? (r === 'YES' ? 'var(--brand)' : 'var(--faint)') : 'var(--border)'}`,
                  cursor: 'pointer',
                }}
              >
                {r === 'YES' ? `✓ ${t('rsvp.yes')}` : `✕ ${t('rsvp.no')}`}
              </button>
            )
          })}
        </div>

        {/* Minimal data */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{t('rsvp.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('rsvp.name_ph')}
            className="px-3 py-3 rounded-[12px] text-sm"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{t('rsvp.email')}</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('rsvp.email_ph')}
            className="px-3 py-3 rounded-[12px] text-sm"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          />
        </label>

        <button
          onClick={submit}
          disabled={!response || !name.trim() || submitting}
          className="w-full py-4 rounded-[16px] text-sm font-bold mt-1"
          style={{
            background: !response || !name.trim() ? 'var(--surface-3)' : 'var(--accent)',
            color: !response || !name.trim() ? 'var(--faint)' : 'white',
            border: 'none',
            cursor: !response || !name.trim() ? 'not-allowed' : 'pointer',
            boxShadow: !response || !name.trim() ? 'none' : '0 6px 18px rgba(197,106,58,.32)',
          }}
        >
          {submitting ? t('rsvp.sending') : t('rsvp.confirm')}
        </button>

        <button
          onClick={onBack}
          className="text-sm font-semibold"
          style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ← {t('rsvp.back')}
        </button>
      </div>
    </div>
  )
}
