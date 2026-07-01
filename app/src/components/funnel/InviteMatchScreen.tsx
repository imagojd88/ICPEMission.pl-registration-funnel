import { useState } from 'react'
import { Calendar, MapPin, Check } from 'lucide-react'
import type { EventInstanceDto } from '@icpe/shared'
import { Input } from '../ui/Input'
import { matchInvite } from '../../lib/api'

function resolveDesc(d: EventInstanceDto['description']): string {
  if (!d) return ''
  if (typeof d === 'string') return d
  return d.pl ?? d.en ?? d.it ?? ''
}

function dateRange(s: string, e: string): string {
  try {
    const a = new Date(s)
    const b = new Date(e)
    const full = (d: Date) => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })
    if (a.toDateString() === b.toDateString()) return full(a)
    return `${a.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })} – ${full(b)}`
  } catch {
    return ''
  }
}

export default function InviteMatchScreen({ event, slug }: { event: EventInstanceDto; slug: string }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmedName, setConfirmedName] = useState<string | null>(null)

  async function handleSubmit() {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Podaj imię, nazwisko i e-mail.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await matchInvite(slug, { firstName, lastName, email })
      setConfirmedName(res.firstName)
    } catch {
      setError('Nie znaleźliśmy zaproszenia na podane dane. Sprawdź pisownię lub użyj linku z zaproszenia.')
    } finally {
      setBusy(false)
    }
  }

  const desc = resolveDesc(event.description)

  if (confirmedName) {
    return (
      <div className="flex flex-col items-center gap-4 px-[22px] py-14 text-center">
        <div className="flex items-center justify-center rounded-full" style={{ width: 60, height: 60, background: 'var(--ok-soft)' }}>
          <Check size={30} style={{ color: 'var(--ok)' }} />
        </div>
        <h2 className="font-serif" style={{ fontSize: 24, color: 'var(--ink)' }}>Udział potwierdzony</h2>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Dziękujemy, {confirmedName}! Do zobaczenia.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 px-[22px] py-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--ink)' }}>
          <Calendar size={16} style={{ color: 'var(--brand)' }} /> {dateRange(event.startsAt, event.endsAt)}
        </div>
        {event.location && (
          <div className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--ink)' }}>
            <MapPin size={16} style={{ color: 'var(--brand)' }} /> {event.location}
          </div>
        )}
      </div>

      {desc && <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--muted)' }}>{desc}</p>}

      <div className="rounded-[15px] p-4 flex flex-col gap-3" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Potwierdź udział</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          To wydarzenie na zaproszenie. Podaj dane dokładnie takie, jak przekazałeś organizatorowi.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Imię" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jan" />
          <Input label="Nazwisko" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Kowalski" />
        </div>
        <Input label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jan@example.com" />
        {error && <p className="text-xs font-medium" style={{ color: 'var(--err)' }}>{error}</p>}
        <button
          onClick={() => { void handleSubmit() }}
          disabled={busy}
          className="w-full text-white text-base font-semibold rounded-[16px] py-4 transition-all duration-150 active:scale-[0.98] hover:opacity-90 mt-1"
          style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
        >
          {busy ? 'Sprawdzam…' : 'Potwierdzam udział →'}
        </button>
      </div>
    </div>
  )
}
