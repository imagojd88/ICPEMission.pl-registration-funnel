import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router-dom'
import { Calendar, MapPin, ArrowRight } from 'lucide-react'
import { getPublicActiveEvents, pickLang, type PublicEventTile } from '../lib/api'
import { formatDateRange } from '../lib/utils'
import Spinner from '../components/ui/Spinner'
import ThemeToggle from '../components/ui/ThemeToggle'

export default function PublicHome() {
  const { t, i18n } = useTranslation()
  const [events, setEvents] = useState<PublicEventTile[] | null>(null)

  // Tytuł karty w języku gościa (odświeża się po zmianie języka).
  useEffect(() => {
    document.title = `ICPE Mission — ${t('home.tab_title')}`
  }, [t, i18n.language])

  useEffect(() => {
    getPublicActiveEvents().then(setEvents).catch(() => setEvents([]))
  }, [])

  if (events === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <Spinner size="lg" />
      </div>
    )
  }

  // Jeden aktywny event → od razu jego strona.
  if (events.length === 1) {
    return <Navigate to={`/r/${events[0].slug}`} replace />
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <ThemeToggle />
      <div className="mx-auto px-5 py-12" style={{ maxWidth: 980 }}>
        <header className="text-center mb-10">
          <p className="text-sm font-semibold tracking-wide" style={{ color: 'var(--brand)' }}>
            {t('landing.pill')}
          </p>
          <h1 className="text-3xl md:text-4xl font-bold font-serif mt-1" style={{ color: 'var(--ink)' }}>
            {t('home.title')}
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
            {t('home.subtitle')}
          </p>
        </header>

        {events.length === 0 ? (
          <div
            className="rounded-[18px] border px-6 py-16 text-center"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <p className="text-base font-medium" style={{ color: 'var(--ink)' }}>
              {t('home.empty_title')}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              {t('home.empty_desc')}
            </p>
          </div>
        ) : (
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {events.map((ev) => (
              <Link
                key={ev.slug}
                to={`/r/${ev.slug}`}
                className="group rounded-[18px] border overflow-hidden flex flex-col transition-all duration-150 hover:-translate-y-0.5"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
              >
                <div
                  className="h-36 w-full bg-cover bg-center"
                  style={{
                    background: ev.heroImageUrl
                      ? `center/cover no-repeat url(${ev.heroImageUrl})`
                      : ev.primaryColor ?? 'var(--brand)',
                  }}
                />
                <div className="flex flex-col gap-2 p-4 flex-1">
                  <h2 className="text-lg font-bold font-serif" style={{ color: 'var(--ink)' }}>
                    {pickLang(ev.title as string | Record<string, string>, i18n.language)}
                  </h2>
                  <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
                    <Calendar size={14} /> {formatDateRange(ev.startsAt, ev.endsAt, i18n.language)}
                  </div>
                  {ev.location && (
                    <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
                      <MapPin size={14} /> <span className="truncate">{ev.location}</span>
                    </div>
                  )}
                  <span
                    className="mt-auto inline-flex items-center gap-1 text-sm font-semibold pt-2"
                    style={{ color: 'var(--brand)' }}
                  >
                    {t('home.cta')} <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
