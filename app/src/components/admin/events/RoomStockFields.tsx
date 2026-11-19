/**
 * Limit pokoi danego typu + rezerwa dla gości specjalnych (kreator i „Edytuj event").
 *  - Liczba pokoi: ile pokoi tego typu jest do wynajęcia (puste = bez limitu).
 *  - Rezerwa: ile z nich nie trafia do zapisu publicznego — przydzielasz je w panelu
 *    („Edytuj zgłoszenie" → „Pokoje z rezerwy dla gości specjalnych").
 * Zajętość liczona po zgłoszeniach (wszystkie poza anulowanymi).
 */
export default function RoomStockFields({
  stock,
  reserved,
  onStock,
  onReserved,
  usedPublic = 0,
  usedReserved = 0,
}: {
  stock: string
  reserved: string
  onStock: (v: string) => void
  onReserved: (v: string) => void
  usedPublic?: number
  usedReserved?: number
}) {
  const st = parseInt(stock) || 0
  const rs = Math.min(parseInt(reserved) || 0, st)
  const freePublic = Math.max(0, st - Math.max(rs, usedReserved) - usedPublic)
  const freeReserve = Math.max(0, rs - usedReserved)
  const box = 'rounded-[10px] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]'
  const boxStyle = { border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', width: 74 } as const
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: 'var(--muted)' }}>
      <label className="flex items-center gap-1.5">
        Liczba pokoi
        <input value={stock} onChange={(e) => onStock(e.target.value.replace(/\D/g, ''))} placeholder="bez limitu" inputMode="numeric" className={box} style={{ ...boxStyle, width: 92 }} />
      </label>
      {st > 0 && (
        <label className="flex items-center gap-1.5">
          w tym dla gości specjalnych
          <input value={reserved} onChange={(e) => onReserved(e.target.value.replace(/\D/g, ''))} placeholder="0" inputMode="numeric" className={box} style={boxStyle} />
        </label>
      )}
      {st > 0 && (
        <span className="w-full" style={{ color: freePublic === 0 ? 'var(--err)' : 'var(--muted)' }}>
          Zajęte: {usedPublic} z zapisów{usedReserved || rs ? ` + ${usedReserved} gości specjalnych` : ''} · wolne w zapisach: <strong>{freePublic}</strong>
          {rs > 0 ? ` · wolne w rezerwie: ${freeReserve}` : ''}
          {(parseInt(reserved) || 0) > st ? ' · rezerwa obcięta do liczby pokoi' : ''}
        </span>
      )}
    </div>
  )
}
