import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { getAdminLeads, type RegistrationLeadItem } from '@/lib/api'

const STEP_LABEL = ['Dane', 'Uczestnicy', 'Preferencje', 'Nocleg', 'Opcje', 'Płatność']

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function reminderBadge(l: RegistrationLeadItem) {
  if (l.convertedAt) return <Badge variant="ok">Dokończone</Badge>
  switch (l.reminderStatus) {
    case 'SENT': return <Badge variant="warn">Przypomnienie wysłane {l.reminderSentAt ? fmt(l.reminderSentAt) : ''}</Badge>
    case 'FAILED': return <Badge variant="err">Błąd wysyłki</Badge>
    case 'SKIPPED_CLOSED': return <Badge>Bez przypomnienia (zapisy zamknięte)</Badge>
    case 'SKIPPED_FULL': return <Badge>Bez przypomnienia (brak miejsc)</Badge>
    default: return <Badge>Przypomnienie po 3 h braku aktywności</Badge>
  }
}

/**
 * „Rozpoczęte, niedokończone" — kto zaczął zapis (podał imię i e-mail), ale go nie wysłał.
 * Każda taka osoba dostaje jedno przypomnienie 3 h po ostatniej aktywności.
 */
export default function UnfinishedRegistrations({ instanceId, refreshKey }: { instanceId: string; refreshKey?: unknown }) {
  const [open, setOpen] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [leads, setLeads] = useState<RegistrationLeadItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!instanceId) return
    setError(null)
    getAdminLeads(instanceId)
      .then(setLeads)
      .catch((e: Error) => setError(e.message))
  }, [instanceId, refreshKey])

  const unfinished = (leads ?? []).filter((l) => !l.convertedAt)
  const rows = showDone ? leads ?? [] : unfinished
  const done = (leads ?? []).length - unfinished.length

  return (
    <div className="rounded-[16px] border" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        style={{ color: 'var(--ink)', cursor: 'pointer', background: 'transparent', border: 0 }}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="font-semibold text-sm">Rozpoczęte, niedokończone</span>
        <span className="text-sm" style={{ color: 'var(--muted)' }}>
          {leads === null ? '…' : `${unfinished.length}${done ? ` · dokończyło ${done}` : ''}`}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Osoby, które podały imię i e-mail, ale nie wysłały zgłoszenia. Każda dostaje jedno przypomnienie
            z linkiem do formularza 3 godziny po ostatniej aktywności (tylko gdy zapisy są otwarte i są miejsca).
          </p>
          {error && <p className="text-sm" style={{ color: 'var(--err)' }}>Nie udało się wczytać: {error}</p>}
          {done > 0 && (
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="accent-[var(--brand)]" />
              Pokaż też dokończone
            </label>
          )}
          {leads !== null && rows.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--faint)' }}>Brak niedokończonych zgłoszeń.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--faint)' }} className="text-xs text-left">
                    <th className="py-2 pr-4 font-medium">Osoba</th>
                    <th className="py-2 pr-4 font-medium">Doszła do kroku</th>
                    <th className="py-2 pr-4 font-medium">Ostatnia aktywność</th>
                    <th className="py-2 font-medium">Przypomnienie</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-2 pr-4">
                        <p className="font-medium" style={{ color: 'var(--ink)' }}>{l.firstName} {l.lastName}</p>
                        <a href={`mailto:${l.email}`} className="text-xs" style={{ color: 'var(--faint)' }}>{l.email}</a>
                      </td>
                      <td className="py-2 pr-4" style={{ color: 'var(--muted)' }}>
                        {STEP_LABEL[Math.min(l.step, STEP_LABEL.length - 1)]}
                      </td>
                      <td className="py-2 pr-4" style={{ color: 'var(--muted)' }}>{fmt(l.lastActivityAt)}</td>
                      <td className="py-2">{reminderBadge(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
