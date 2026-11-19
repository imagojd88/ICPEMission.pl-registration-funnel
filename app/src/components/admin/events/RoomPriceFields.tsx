/**
 * Cena typu pokoju + jednostka ceny (kreator i „Edytuj event").
 *  - „za osobę / noc": każda osoba w pokoju płaci tę kwotę za noc (dzieci wg zniżek wiekowych),
 *  - „za pokój / noc": stała kwota za cały pokój za noc, niezależnie od liczby osób.
 * Podpowiedź pod polami pokazuje drugi sposób liczenia, żeby łatwo sprawdzić, czy kwota ma sens.
 */
export type PriceUnit = 'person' | 'room'

export function PriceUnitSelect({
  value,
  onChange,
  className,
  style,
}: {
  value: PriceUnit
  onChange: (v: PriceUnit) => void
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as PriceUnit)} className={className} style={style} aria-label="Za co jest cena">
      <option value="person">za osobę / noc</option>
      <option value="room">za pokój / noc</option>
    </select>
  )
}

/** „= 100 zł/os przy komplecie (2 os.)" albo „= 400 zł za pokój przy komplecie (2 os.)". */
export function priceHint(price: string, capacity: string, unit: PriceUnit, currency = 'zł'): string {
  const p = parseFloat(price)
  const cap = parseInt(capacity) || 1
  if (!(p > 0)) return ''
  const fmt = (n: number) => `${Math.round(n * 100) / 100} ${currency}`
  if (cap <= 1) return unit === 'room' ? `= ${fmt(p)} za pokój (1 os.)` : `= ${fmt(p)} za pokój 1-os.`
  return unit === 'room'
    ? `= ${fmt(p / cap)}/os przy komplecie (${cap} os.); jedna osoba w pokoju płaci ${fmt(p)}`
    : `= ${fmt(p * cap)} za pokój przy komplecie (${cap} os.)`
}
