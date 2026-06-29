import { useTranslation } from 'react-i18next'
import { DEFAULT_PRICING } from '@icpe/shared'

interface Props {
  roomId: string
  onChange: (roomId: string) => void
}

export default function Step3Room({ roomId, onChange }: Props) {
  const { t } = useTranslation()

  const rooms = DEFAULT_PRICING.rooms

  return (
    <div className="flex flex-col gap-4 px-[22px] py-5">
      <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
        {t('room.title')}
      </h2>

      {rooms.map((room) => {
        const isSelected = roomId === room.id

        return (
          <button
            key={room.id}
            onClick={() => onChange(room.id)}
            className="w-full text-left rounded-[15px] p-4 flex gap-3 transition-all duration-150 active:scale-[0.99]"
            style={{
              border: isSelected ? '2px solid var(--brand)' : '1.5px solid var(--border)',
              background: isSelected ? 'var(--brand-soft)' : 'var(--surface)',
              cursor: 'pointer',
            }}
          >
            {/* Radio circle */}
            <div
              className="shrink-0 mt-0.5 flex items-center justify-center rounded-full"
              style={{
                width: 20,
                height: 20,
                border: isSelected ? '2px solid var(--brand)' : '2px solid var(--border)',
                background: isSelected ? 'var(--brand)' : 'transparent',
              }}
            >
              {isSelected && (
                <div
                  className="rounded-full"
                  style={{ width: 8, height: 8, background: 'white' }}
                />
              )}
            </div>

            {/* Content */}
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              {/* Name + tag */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-sm font-semibold"
                  style={{ color: isSelected ? 'var(--brand)' : 'var(--ink)' }}
                >
                  {room.name}
                </span>
                {room.tag && (
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--accent-soft)',
                      color: 'var(--accent)',
                    }}
                  >
                    {room.tag}
                  </span>
                )}
              </div>

              {/* Description */}
              {room.desc && (
                <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
                  {room.desc}
                </p>
              )}

              {/* Capacity + price */}
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {t('room.capacity', { n: room.cap })}
                </span>
                <div className="flex items-baseline gap-1">
                  <span
                    className="font-serif font-bold"
                    style={{ fontSize: 18, color: 'var(--brand)' }}
                  >
                    {room.perPerson} zł
                  </span>
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    {room.model === 'noc' ? t('room.per_night') : t('room.per_person_night')}
                  </span>
                </div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
