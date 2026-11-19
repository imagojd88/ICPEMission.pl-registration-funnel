/**
 * Metoda płatności „Zaliczka u lidera wspólnoty" (LEADER_DEPOSIT) — kreator i „Edytuj event".
 * Gość widzi ją TYLKO, gdy w kroku „Dane" wybierze wspólnotę z listy ICPE (nie „Inna");
 * wymaga więc pola przynależności „Wspólnota". Zaliczkę (domyślnie 50%) przekazuje liderowi,
 * resztę płaci gotówką przy rejestracji na miejscu.
 */
export default function LeaderDepositFields({
  enabled,
  onEnabled,
  pct,
  onPct,
  communityField,
}: {
  enabled: boolean
  onEnabled: (v: boolean) => void
  pct: string
  onPct: (v: string) => void
  /** czy formularz pyta o wspólnotę (customFields.affiliationField === 'community') */
  communityField: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--ink)' }}>
        <input type="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} className="accent-[var(--brand)] w-4 h-4 mt-0.5" />
        <span className="flex flex-col">
          Zaliczka u lidera wspólnoty
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            Widoczna tylko dla osób, które w kroku „Dane” wybiorą wspólnotę z listy ICPE (nie „Inna”). Zaliczkę przekazują liderowi, resztę płacą gotówką na miejscu.
          </span>
        </span>
      </label>
      {enabled && (
        <div className="flex items-center gap-2 pl-6 text-xs flex-wrap" style={{ color: 'var(--muted)' }}>
          Wysokość zaliczki
          <input
            value={pct}
            onChange={(e) => onPct(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="50"
            className="rounded-[10px] border px-2.5 py-1.5 text-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)', width: 64 }}
            aria-label="Zaliczka w %"
          />
          % kwoty zgłoszenia
        </div>
      )}
      {enabled && !communityField && (
        <p className="text-xs pl-6" style={{ color: 'var(--warn)' }}>
          Formularz nie pyta o wspólnotę — ustaw „Przynależność: Wspólnota” w sekcji „Formularz zapisu”, inaczej nikt nie zobaczy tej opcji.
        </p>
      )}
    </div>
  )
}
