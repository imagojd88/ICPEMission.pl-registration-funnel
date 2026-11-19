/**
 * Ustawienie „Nocleg opcjonalny" (kreator i „Edytuj event").
 * Event dzienny (np. 9:00–17:00) z noclegiem dla przyjezdnych: gość może zaznaczyć
 * „Nie potrzebuję noclegu", a nocleg domówić później przez link z maila.
 */
export default function OptionalStayFields({
  optional,
  onOptional,
  overnightMeals,
  onOvernightMeals,
  nights,
  hasRooms,
  onNights,
}: {
  optional: boolean
  onOptional: (v: boolean) => void
  overnightMeals: string
  onOvernightMeals: (v: string) => void
  nights: number
  hasRooms: boolean
  /** Gdy podane — przy 0 nocach pokazujemy pole „Liczba nocy” od razu tutaj (to samo co w Szczegółach). */
  onNights?: (v: string) => void
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-[12px] px-3 py-3"
      style={{ background: optional ? 'var(--brand-soft)' : 'var(--surface-2)', border: `1px solid ${optional ? 'var(--brand)' : 'var(--border)'}` }}
    >
      <label className="flex items-start gap-2 text-sm font-medium cursor-pointer" style={{ color: 'var(--ink)' }}>
        <input
          type="checkbox"
          checked={optional}
          onChange={(e) => onOptional(e.target.checked)}
          className="accent-[var(--brand)] w-4 h-4 mt-0.5"
        />
        <span className="flex flex-col">
          Nocleg opcjonalny
          <span className="text-xs font-normal" style={{ color: 'var(--muted)' }}>
            Gość może zaznaczyć „Nie potrzebuję noclegu” (np. event 9:00–17:00, nocleg dla przyjezdnych).
            Osoby bez noclegu płacą opłatę formacyjną + wyżywienie. Nocleg można domówić później linkiem z maila.
          </span>
        </span>
      </label>
      {optional && (
        <div className="flex flex-col gap-1 pl-6">
          <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
            Posiłki tylko dla nocujących — za osobę za noc (np. kolacja + śniadanie; 0 = brak)
          </label>
          <input
            value={overnightMeals}
            onChange={(e) => onOvernightMeals(e.target.value)}
            inputMode="numeric"
            className="w-full rounded-[10px] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', maxWidth: 140 }}
          />
          {nights < 1 && onNights && (
            <label className="flex items-center gap-2 text-xs font-medium mt-1" style={{ color: 'var(--warn)' }}>
              Liczba nocy (teraz 0 — wpisz co najmniej 1):
              <input
                defaultValue=""
                onChange={(e) => onNights(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="1"
                className="rounded-[10px] px-3 py-1.5 text-sm"
                style={{ border: '1.5px solid var(--warn)', background: 'var(--surface)', color: 'var(--ink)', width: 70 }}
              />
            </label>
          )}
          {(nights < 1 || !hasRooms) && (
            <p className="text-xs" style={{ color: 'var(--warn)' }}>
              Żeby goście widzieli wybór noclegu, ustaw liczbę nocy ≥ 1 (pole „Liczba nocy” w sekcji Szczegóły) i dodaj co najmniej jeden pokój.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
