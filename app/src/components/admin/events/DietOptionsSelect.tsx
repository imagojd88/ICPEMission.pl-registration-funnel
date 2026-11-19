import { DIETS } from '@/lib/diets'

/**
 * Ustawienie per event: które diety gość może zaznaczyć w formularzu (krok „Preferencje”).
 * Domyślnie żadna — wybór diet pojawia się dopiero po włączeniu co najmniej jednej.
 * Zapisywane w `customFields.diets` (lista kluczy z `lib/diets.ts`).
 */
export default function DietOptionsSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : DIETS.map((d) => d.key).filter((k) => k === key || value.includes(k)))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {DIETS.map((d) => {
          const on = value.includes(d.key)
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => toggle(d.key)}
              aria-pressed={on}
              className="text-sm font-medium rounded-full px-3.5 py-1.5 transition-colors"
              style={{
                border: `1.5px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
                background: on ? 'var(--brand-soft)' : 'var(--surface)',
                color: on ? 'var(--brand)' : 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              {on ? '✓ ' : ''}{d.label.pl}
            </button>
          )
        })}
      </div>
      <p className="text-xs" style={{ color: 'var(--faint)' }}>
        {value.length === 0
          ? 'Żadna dieta nie jest włączona — gość nie zobaczy wyboru diet (zostaje tylko pole na alergie).'
          : `Gość zaznacza diety osobno dla każdego uczestnika; w zgłoszeniu zobaczysz je przy osobie. Włączone: ${value.length}.`}
      </p>
    </div>
  )
}
