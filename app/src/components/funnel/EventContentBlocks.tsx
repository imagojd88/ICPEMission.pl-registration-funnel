import { useTranslation } from 'react-i18next'
import { groupGuests, guestGroupI18nKey, pickHeadingText } from '@icpe/shared'
import { pickLang, eventGuests, type EventContent } from '../../lib/api'

/** Renderuje gości specjalnych i program wydarzenia (jeśli ustawione). */
export default function EventContentBlocks({ content }: { content?: EventContent | null }) {
  const { t, i18n } = useTranslation()
  const program = content?.program ?? []
  const guests = eventGuests(content)
    .map((g) => ({ ...g, nameText: pickLang(g.name, i18n.language), bioText: pickLang(g.bio, i18n.language) }))
    .filter((g) => g.nameText)

  if (guests.length === 0 && program.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {guests.length > 0 && <SpecialGuestsBlock content={content} />}

      {program.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: 'var(--faint)' }}>{t('content.program')}</p>
          {program.map((p, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <span className="font-mono font-semibold shrink-0" style={{ color: 'var(--brand)', minWidth: 52 }}>{p.time}</span>
              <span style={{ color: 'var(--ink)' }}>{pickLang(p.item, i18n.language)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Goście specjalni eventu — nagłówek i karta (portret, imiona, opis) dla każdego. */
export function SpecialGuestsBlock({ content }: { content?: EventContent | null }) {
  const { t, i18n } = useTranslation()
  const guests = eventGuests(content)
    .map((g) => ({ ...g, nameText: pickLang(g.name, i18n.language), bioText: pickLang(g.bio, i18n.language) }))
    .filter((g) => g.nameText)
  if (guests.length === 0) return null
  // Goście pod nagłówkami („Goście specjalni”, „Wykładowcy”, „Paneliści” albo własny tekst), w kolejności
  // pierwszego wystąpienia grupy. Bez ustawionych nagłówków wychodzi jedna grupa — dokładnie jak dawniej.
  // Liczba mnoga nagłówka: kilka wpisów w grupie albo wpis oznaczony jako para / kilka osób.
  const groups = groupGuests(guests)
  const titleOf = (grp: (typeof groups)[number]) => {
    const key = guestGroupI18nKey(grp)
    return key ? t(key) : pickHeadingText(grp.text, i18n.language)
  }
  // Jedna grupa → ten sam układ co przed wprowadzeniem nagłówków (bez dodatkowego opakowania).
  if (groups.length === 1) return <GuestGroupBlock title={titleOf(groups[0])} guests={groups[0].guests} />
  return (
    <div className="flex flex-col gap-4">
      {groups.map((grp) => (
        <GuestGroupBlock key={grp.key} title={titleOf(grp)} guests={grp.guests} />
      ))}
    </div>
  )
}

function GuestGroupBlock({
  title,
  guests,
}: {
  title: string
  guests: Array<{ photoUrl?: string; nameText: string; bioText: string }>
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--faint)' }}>
        {title}
      </p>
      {guests.map((g, i) => (
        <div
          key={i}
          className={`flex gap-3 rounded-[15px] p-3 ${g.bioText ? 'items-start' : 'items-center'}`}
          style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
        >
          {g.photoUrl ? (
            <img src={g.photoUrl} alt="" className="rounded-full object-cover shrink-0" style={{ width: 52, height: 52 }} />
          ) : (
            <div className="rounded-full shrink-0" style={{ width: 52, height: 52, background: 'var(--surface-2)' }} />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{g.nameText}</p>
            {g.bioText && (
              <p className="text-sm leading-relaxed mt-1 whitespace-pre-line" style={{ color: 'var(--muted)' }}>{g.bioText}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
