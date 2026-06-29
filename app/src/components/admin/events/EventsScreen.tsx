import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EventWizard from './EventWizard'

type FilterTab = 'all' | 'one_time' | 'evergreen'

interface EventRow {
  id: string
  name: string
  slug: string
  type: 'jednorazowy' | 'cykliczny'
  registrations: number
  capacity: number
  status: 'Otwarty' | 'Wkrótce' | 'Szkic'
}

const MOCK_EVENTS: EventRow[] = [
  {
    id: '1',
    name: 'Dzień Formacji 2026',
    slug: 'dzien-formacji-2026',
    type: 'jednorazowy',
    registrations: 52,
    capacity: 80,
    status: 'Otwarty',
  },
  {
    id: '2',
    name: 'Rekolekcje Adwentowe',
    slug: 'rekolekcje-adwentowe-2026',
    type: 'jednorazowy',
    registrations: 12,
    capacity: 40,
    status: 'Wkrótce',
  },
  {
    id: '3',
    name: 'Wyjazd Misyjny',
    slug: 'wyjazd-misyjny',
    type: 'cykliczny',
    registrations: 8,
    capacity: 20,
    status: 'Szkic',
  },
]

function statusBadge(status: EventRow['status']) {
  if (status === 'Otwarty') return <Badge variant="ok">{status}</Badge>
  if (status === 'Wkrótce') return <Badge variant="warn">{status}</Badge>
  return <Badge variant="muted">{status}</Badge>
}

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'one_time', label: 'Jednorazowe' },
  { id: 'evergreen', label: 'Cykliczne' },
]

interface EventsScreenProps {
  onOpenWizard: () => void
  showWizard: boolean
  onCloseWizard: () => void
}

export default function EventsScreen({ onOpenWizard, showWizard, onCloseWizard }: EventsScreenProps) {
  const [filter, setFilter] = useState<FilterTab>('all')

  const filtered = MOCK_EVENTS.filter((ev) => {
    if (filter === 'one_time') return ev.type === 'jednorazowy'
    if (filter === 'evergreen') return ev.type === 'cykliczny'
    return true
  })

  if (showWizard) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onCloseWizard}
            className="text-sm hover:underline"
            style={{ color: 'var(--brand)' }}
          >
            ← Eventy
          </button>
          <span style={{ color: 'var(--faint)' }}>/</span>
          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            Nowy event
          </span>
        </div>
        <EventWizard onCancel={onCloseWizard} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 p-1 rounded-[12px] self-start" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className="px-4 py-1.5 rounded-[9px] text-sm font-medium transition-all duration-150"
            style={
              filter === tab.id
                ? { background: 'var(--surface)', color: 'var(--brand)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                : { color: 'var(--muted)' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div
        className="rounded-[15px] border overflow-hidden"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <p className="font-bold text-base" style={{ color: 'var(--ink)' }}>
            Eventy ({filtered.length})
          </p>
          <Button size="sm" onClick={onOpenWizard}>
            + Nowy event
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {['Nazwa', 'Typ', 'Zgłoszenia', 'Status', ''].map((h) => (
                  <th
                    key={h}
                    className="px-5 py-2.5 text-left text-xs font-semibold"
                    style={{ color: 'var(--faint)' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((ev, i) => (
                <tr
                  key={ev.id}
                  className="hover:bg-[var(--surface-2)] transition-colors"
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border-2)' : undefined }}
                >
                  <td className="px-5 py-3.5">
                    <p className="font-medium" style={{ color: 'var(--ink)' }}>{ev.name}</p>
                    <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--faint)', fontSize: 11 }}>
                      /r/{ev.slug}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    {ev.type === 'jednorazowy' ? (
                      <Badge variant="brand">Jednorazowy</Badge>
                    ) : (
                      <Badge variant="accent">Cykliczny</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                        {ev.registrations}
                      </span>
                      <span style={{ color: 'var(--faint)' }}>/</span>
                      <span style={{ color: 'var(--muted)' }}>{ev.capacity}</span>
                      {/* Progress bar */}
                      <div
                        className="rounded-full overflow-hidden"
                        style={{ width: 50, height: 4, background: 'var(--border)' }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round((ev.registrations / ev.capacity) * 100)}%`,
                            background: 'var(--brand)',
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">{statusBadge(ev.status)}</td>
                  <td className="px-5 py-3.5">
                    <button
                      className="flex items-center gap-1 text-xs font-medium transition-colors hover:text-[var(--brand)]"
                      style={{ color: 'var(--muted)' }}
                    >
                      Otwórz <ExternalLink size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
