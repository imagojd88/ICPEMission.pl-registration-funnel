import { useState, useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Calendar, MapPin, ArrowRight } from 'lucide-react'
import { getPublicActiveEvents, type PublicEventTile } from '../lib/api'
import Spinner from '../components/ui/Spinner'
import ThemeToggle from '../components/ui/ThemeToggle'

function title(t: PublicEventTile['title']): string {
  if (typeof t === 'string') return t
  return t.pl ?? t.en ?? t.it ?? ''
}

function dateRange(startIso: string, endIso: string): string {
  try {
    const s = new Date(startIso)
    const e = new Date(endIso)
    const fmt = (d: Date) => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
    if (s.toDateString() === e.toDateString()) return fmt(s)
    return `${s.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })} – ${fmt(e)}`
  } catch {
    return ''
  }
}

export default function PublicHome() {
  const [events, setEvents] = useState<PublicEventTile[] | null>(null)

  useEffect(() => {
    document.title = 'ICPE Mission — Rejestracje'
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
            ICPE Mission Polska
          </p>
          <h1 className="text-3xl md:text-4xl font-bold font-serif mt-1" style={{ color: 'var(--ink)' }}>
            Rejestracje na wydarzenia
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
            Wybierz wydarzenie, na które chcesz się zapisać.
          </p>
        </header>

        {events.length === 0 ? (
          <div
            className="rounded-[18px] border px-6 py-16 text-center"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <p className="text-base font-medium" style={{ color: 'var(--ink)' }}>
              Brak otwartych zapisów
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              Obecnie nie ma aktywnych wydarzeń. Zajrzyj później.
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
                    {title(ev.title)}
                  </h2>
                  <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--muted)' }}>
                    <Calendar size={14} /> {dateRange(ev.startsAt, ev.endsAt)}
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
                    Zapisz się <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
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
