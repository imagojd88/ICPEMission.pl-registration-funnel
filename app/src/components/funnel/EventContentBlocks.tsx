import type { EventContent } from '../../lib/api'

/** Renderuje program wydarzenia i gościa specjalnego (jeśli ustawione). */
export default function EventContentBlocks({ content }: { content?: EventContent | null }) {
  const program = content?.program ?? []
  const guest = content?.specialGuest

  if (!guest?.name && program.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {guest?.name && (
        <div
          className="flex items-center gap-3 rounded-[15px] p-3"
          style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
        >
          {guest.photoUrl ? (
            <img src={guest.photoUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: 52, height: 52 }} />
          ) : (
            <div className="rounded-full shrink-0" style={{ width: 52, height: 52, background: 'var(--surface-2)' }} />
          )}
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Gość specjalny</p>
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{guest.name}</p>
          </div>
        </div>
      )}

      {program.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: 'var(--faint)' }}>Program</p>
          {program.map((p, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <span className="font-mono font-semibold shrink-0" style={{ color: 'var(--brand)', minWidth: 52 }}>{p.time}</span>
              <span style={{ color: 'var(--ink)' }}>{p.item}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
