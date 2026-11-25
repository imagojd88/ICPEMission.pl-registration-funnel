import { localInputsToIso } from '@/lib/registrationOpens'

interface Props {
  date: string
  time: string
  onDate: (v: string) => void
  onTime: (v: string) => void
}

/**
 * Start zapisów (`EventInstance.registrationOpensAt`): data + godzina w czasie lokalnym.
 * Przyszła data → strona eventu jest widoczna, ale zamiast przycisku „Zapisz się" pokazuje licznik.
 */
export default function RegistrationOpensFields({ date, time, onDate, onTime }: Props) {
  const iso = localInputsToIso(date, time)
  const future = !!iso && new Date(iso).getTime() > Date.now()
  const inputCls = 'rounded-[10px] border px-3 py-2 text-sm'
  const inputStyle = { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Otwarcie zapisów</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input type="date" value={date} onChange={(e) => onDate(e.target.value)} className={inputCls} style={inputStyle} aria-label="Data otwarcia zapisów" />
        <input type="time" value={time} onChange={(e) => onTime(e.target.value)} className={inputCls} style={inputStyle} aria-label="Godzina otwarcia zapisów" disabled={!date} />
        {date && (
          <button type="button" onClick={() => { onDate(''); onTime('') }} className="text-xs underline" style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            otwórz od razu
          </button>
        )}
      </div>
      <p className="text-xs" style={{ color: future ? 'var(--warn)' : 'var(--muted)' }}>
        {future
          ? 'Do tej chwili strona eventu jest widoczna, ale zamiast przycisku zapisu pokazuje licznik do startu. Zapisy przed terminem są zablokowane.'
          : 'Puste albo data, która już minęła = zapisy otwarte od razu. Godzina według czasu na tym komputerze.'}
      </p>
    </div>
  )
}
