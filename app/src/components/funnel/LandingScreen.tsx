import { useState } from 'react'
import { Calendar, MapPin, Clock, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { EventInstanceDto, PricingConfig } from '@icpe/shared'
import type { EventContent } from '../../lib/api'

interface Props {
  event: EventInstanceDto
  onRegister: () => void
  pricingConfig?: PricingConfig
  content?: EventContent | null
}

function fmtDateRange(startIso?: string, endIso?: string): string {
  if (!startIso) return ''
  const s = new Date(startIso)
  const e = endIso ? new Date(endIso) : s
  const full = (d: Date) => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
  if (s.toDateString() === e.toDateString()) return full(s)
  return `${s.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })} – ${full(e)}`
}

function MetaRow({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Calendar
  title: string
  subtitle?: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 38,
          height: 38,
          background: 'var(--brand-soft)',
          borderRadius: 11,
        }}
      >
        <Icon size={18} style={{ color: 'var(--brand)' }} />
      </div>
      <div className="flex flex-col gap-0.5 pt-0.5">
        <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {title}
        </span>
        {subtitle && (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  )
}

export default function LandingScreen({ event, onRegister, pricingConfig, content }: Props) {
  const { t } = useTranslation()
  const [showProgram, setShowProgram] = useState(false)

  const isOpen = event.status === 'OPEN'
  const capacity = event.capacity ?? 0
  const hasCapacity = capacity > 0
  const free = Math.max(0, capacity - (event.registeredCount ?? 0))
  const filledPct = capacity > 0 ? Math.min(100, Math.round(((event.registeredCount ?? 0) / capacity) * 100)) : 0

  const nights = pricingConfig?.nights ?? 1
  const program = content?.program ?? []

  if (!isOpen) {
    return (
      <div className="flex flex-col gap-5 px-[22px] py-[22px]">
        {/* Closed icon */}
        <div
          className="flex items-center justify-center mx-auto"
          style={{
            width: 56,
            height: 56,
            background: 'var(--brand-soft)',
            borderRadius: 16,
            fontSize: 28,
          }}
        >
          🕊️
        </div>

        {/* Badge */}
        <div className="flex justify-center">
          <span
            className="text-sm font-semibold px-3 py-1.5"
            style={{
              background: 'var(--warn-soft)',
              color: 'var(--warn)',
              borderRadius: 99,
            }}
          >
            {t('landing.badge_closed')}
          </span>
        </div>

        {/* Title */}
        <h2
          className="font-serif text-center"
          style={{ fontSize: 26, fontWeight: 500, color: 'var(--ink)' }}
        >
          {t('landing.title')}
        </h2>

        {/* Description */}
        <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>
          {t('landing.closed_desc')}
        </p>

        {/* Next date card */}
        <div
          className="rounded-[15px] p-4"
          style={{ background: 'var(--brand-soft)' }}
        >
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--brand)' }}>
            {t('landing.next_date_title')}
          </p>
          <p className="text-sm" style={{ color: 'var(--ink)' }}>
            {t('landing.date')}
          </p>
        </div>

        {/* Notify CTA */}
        <button
          onClick={() => {}}
          className="w-full py-4 text-sm font-semibold rounded-[16px] transition-all duration-150 active:scale-[0.98]"
          style={{
            border: '1.5px solid var(--brand)',
            color: 'var(--brand)',
            background: 'transparent',
          }}
        >
          {t('landing.notify_me')}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 px-[22px] py-[22px]">
      {/* Meta rows */}
      <div className="flex flex-col gap-3">
        <MetaRow
          icon={Calendar}
          title={`${fmtDateRange(event.startsAt, event.endsAt)}${nights > 0 ? ` · ${nights} ${nights === 1 ? 'noc' : 'nocy'}` : ''}`}
        />
        <MetaRow icon={MapPin} title={event.location || t('landing.place_name')} />
      </div>

      {/* Description — opis eventu z bazy (gdy ustawiony) */}
      {(() => {
        const desc =
          typeof event.description === 'string'
            ? event.description
            : event.description
              ? (event.description.pl ?? event.description.en ?? event.description.it ?? '')
              : ''
        return desc ? (
          <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--muted)' }}>
            {desc}
          </p>
        ) : null
      })()}

      {/* Program (popup) + miejsca */}
      {(program.length > 0 || hasCapacity) && (
        <div className="flex items-center justify-between gap-3">
          {program.length > 0 ? (
            <button
              onClick={() => setShowProgram(true)}
              className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-[12px] transition-colors hover:bg-[var(--brand-soft)]"
              style={{ border: '1.5px solid var(--brand)', color: 'var(--brand)', background: 'transparent', cursor: 'pointer' }}
            >
              <Clock size={15} /> Zobacz program
            </button>
          ) : (
            <span />
          )}
          {hasCapacity && (
            <div className="text-right">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {free} {t('landing.spots_free')}
              </p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {t('landing.spots_of', { total: capacity })}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Spots bar — tylko gdy ustawiono limit miejsc */}
      {hasCapacity && (
        <div
          className="w-full rounded-full overflow-hidden"
          style={{ height: 8, background: 'var(--surface-3)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${filledPct}%`,
              background: 'linear-gradient(90deg, var(--brand), var(--brand-2))',
            }}
          />
        </div>
      )}

      {/* CTA button */}
      <button
        onClick={onRegister}
        className="w-full text-white text-base font-semibold transition-all duration-150 active:scale-[0.98] hover:opacity-90"
        style={{
          background: 'var(--accent)',
          borderRadius: 16,
          padding: '16px 24px',
          boxShadow: '0 6px 18px rgba(197,106,58,0.32)',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {t('landing.cta')}
      </button>

      {/* Hint */}
      <p className="text-center" style={{ fontSize: 12, color: 'var(--faint)' }}>
        {t('landing.cta_hint')}
      </p>

      {/* Popup: program godzinowy */}
      {showProgram && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowProgram(false)}
        >
          <div
            className="w-full rounded-[18px] overflow-hidden"
            style={{ maxWidth: 380, background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>Program</p>
              <button
                onClick={() => setShowProgram(false)}
                className="p-1.5 rounded-[8px]"
                style={{ color: 'var(--faint)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-2.5" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {program.map((p, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="font-mono font-semibold shrink-0" style={{ color: 'var(--brand)', minWidth: 52 }}>{p.time}</span>
                  <span style={{ color: 'var(--ink)' }}>{p.item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
