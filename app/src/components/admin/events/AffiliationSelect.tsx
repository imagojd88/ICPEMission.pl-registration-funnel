import { COMMUNITY_GROUPS, type AffiliationField } from '@/lib/communities'

const OPTIONS: { id: AffiliationField | ''; label: string; desc: string }[] = [
  { id: '', label: 'Nie pytaj', desc: 'Bez pola przynależności' },
  { id: 'parish', label: 'Parafia', desc: 'Pole tekstowe (nieobowiązkowe)' },
  { id: 'community', label: 'Wspólnota', desc: 'Lista do wyboru, „Inna” → wpis ręczny (obowiązkowe)' },
]

/**
 * Ustawienie per event: o jaką przynależność pyta formularz zapisu (krok „Dane").
 * Zapisywane w `customFields.affiliationField`.
 */
export default function AffiliationSelect({
  value,
  onChange,
}: {
  value: AffiliationField | ''
  onChange: (v: AffiliationField | '') => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {OPTIONS.map((o) => {
          const active = value === o.id
          return (
            <button
              key={o.id || 'none'}
              type="button"
              onClick={() => onChange(o.id)}
              className="flex flex-col gap-0.5 rounded-[12px] px-3 py-2.5 text-left transition-colors"
              style={{
                border: `1.5px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                background: active ? 'var(--brand-soft)' : 'var(--surface)',
                cursor: 'pointer',
              }}
            >
              <span className="text-sm font-semibold" style={{ color: active ? 'var(--brand)' : 'var(--ink)' }}>
                {o.label}
              </span>
              <span className="text-xs" style={{ color: 'var(--muted)' }}>{o.desc}</span>
            </button>
          )
        })}
      </div>
      {value === 'community' && (
        <p className="text-xs" style={{ color: 'var(--faint)' }}>
          Lista: Polska ({COMMUNITY_GROUPS[0].names.length} + „Inna”) i ICPE Worldwide (
          {COMMUNITY_GROUPS[1].names.length}). Nazwy wspólnot są takie same we wszystkich językach; zmiana listy —
          plik <code>app/src/lib/communities.ts</code>.
        </p>
      )}
    </div>
  )
}
