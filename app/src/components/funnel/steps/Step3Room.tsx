import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { formatMoney, roomLabel } from '@icpe/shared'
import type { PricingConfig } from '@icpe/shared'
import type { Participant, RoomEntry } from '../../../pages/PublicFunnel'
import { X, Plus } from 'lucide-react'
import { isAccommodationOptional } from '../../../lib/funnelPrice'

interface Props {
  rooms: RoomEntry[]
  participants: Participant[]
  pricingConfig: PricingConfig
  onChange: (rooms: RoomEntry[]) => void
  /** Nocleg opcjonalny: zaznaczone „Nie potrzebuję noclegu". */
  noAccommodation?: boolean
  onNoAccommodationChange?: (v: boolean) => void
  /** Ukryj nagłówek kroku (strona zgłoszenia gościa ma własny). */
  hideTitle?: boolean
}

let uidCounter = 0
function newRoomUid() {
  return `room-${++uidCounter}-${Date.now()}`
}

export default function Step3Room({ rooms, participants, pricingConfig, onChange, noAccommodation = false, onNoAccommodationChange, hideTitle }: Props) {
  const { t, i18n } = useTranslation()
  const money = (n: number) => formatMoney(n, pricingConfig.currency, i18n.language)

  const roomTypes = pricingConfig.rooms
  // Nocleg opcjonalny: wybór pokoju nie jest wymagany (checkbox „Nie potrzebuję noclegu").
  const optional = isAccommodationOptional(pricingConfig)

  // Auto-dodaj pierwszy pokój, gdy jeszcze żadnego nie ma (czytelny start doboru pokoju).
  // Przy noclegu opcjonalnym nie — gość sam decyduje, czy chce nocleg.
  useEffect(() => {
    if (!optional && rooms.length === 0 && roomTypes.length > 0) {
      onChange([{ uid: newRoomUid(), roomId: roomTypes[0].id, participantIndexes: [] }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Które indeksy uczestników są już przypisane do jakiegokolwiek pokoju
  const assignedIndexes = new Set(rooms.flatMap((r) => r.participantIndexes))
  const unassignedIndexes = participants
    .map((_, idx) => idx)
    .filter((idx) => !assignedIndexes.has(idx))

  // Walidacja pojemności — per pokój (po uid), komunikaty w języku strony.
  // (Silnik `validateRoomCapacity` z @icpe/shared zwraca teksty po polsku — wspólny z API.)
  const roomErrors = new Map<string, string>()
  for (const r of rooms) {
    const rt = pricingConfig.rooms.find((x) => x.id === r.roomId)
    if (!rt) continue
    const cnt = r.participantIndexes.filter((idx) => idx >= 0 && idx < participants.length).length
    const name = roomLabel(rt.name, i18n.language)
    if (cnt === 0) roomErrors.set(r.uid, t('room.err_empty', { name }))
    else if (cnt > rt.cap) roomErrors.set(r.uid, t('room.err_over', { name, cap: rt.cap, count: cnt }))
  }

  function addRoom() {
    const defaultRoomId = roomTypes[0]?.id ?? ''
    onChange([...rooms, { uid: newRoomUid(), roomId: defaultRoomId, participantIndexes: [] }])
  }

  function removeRoom(uid: string) {
    onChange(rooms.filter((r) => r.uid !== uid))
  }

  function setRoomType(uid: string, roomId: string) {
    onChange(rooms.map((r) => (r.uid === uid ? { ...r, roomId } : r)))
  }

  function toggleParticipant(uid: string, pIdx: number, checked: boolean) {
    onChange(
      rooms.map((r) => {
        if (r.uid !== uid) return r
        const next = checked
          ? [...r.participantIndexes, pIdx]
          : r.participantIndexes.filter((i) => i !== pIdx)
        return { ...r, participantIndexes: next }
      }),
    )
  }

  function participantLabel(p: Participant, idx: number) {
    const name = p.name.trim() || (p.type === 'adult' ? t('participants.adult') : t('participants.child'))
    return `#${idx + 1} ${name}${p.type === 'child' ? ` (${p.age} ${t('participants.age_suffix')})` : ''}`
  }

  const many = participants.length > 1

  return (
    <div className={hideTitle ? 'flex flex-col gap-4' : 'flex flex-col gap-4 px-[22px] py-5'}>
      {!hideTitle && (
        <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
          {optional ? t('room.title_optional') : t('room.title')}
        </h2>
      )}
      <p className={hideTitle ? 'text-sm' : 'text-sm -mt-2'} style={{ color: 'var(--muted)' }}>
        {optional ? t('room.optional_hint') : t('room.assign_hint')}
      </p>

      {/* Nocleg opcjonalny: „Nie potrzebuję noclegu" — zaznaczenie czyści wybrane pokoje */}
      {optional && (
        <label
          className="flex items-center gap-3 rounded-[15px] px-4 py-3.5 cursor-pointer"
          style={{
            border: noAccommodation ? '1.5px solid var(--brand)' : '1.5px solid var(--border)',
            background: noAccommodation ? 'var(--brand-soft)' : 'var(--surface)',
          }}
        >
          <input
            type="checkbox"
            checked={noAccommodation}
            onChange={(e) => {
              onNoAccommodationChange?.(e.target.checked)
              // Odznaczenie → od razu pusty pokój do wyboru (czytelny start).
              if (!e.target.checked && rooms.length === 0 && roomTypes.length > 0) {
                onChange([{ uid: newRoomUid(), roomId: roomTypes[0].id, participantIndexes: [] }])
              }
            }}
            style={{ width: 18, height: 18, accentColor: 'var(--brand)' }}
          />
          <span className="flex flex-col">
            <span className="text-sm font-semibold" style={{ color: noAccommodation ? 'var(--brand)' : 'var(--ink)' }}>
              {many ? t('room.no_accommodation_many') : t('room.no_accommodation')}
            </span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              {t('room.no_accommodation_desc')}
            </span>
          </span>
        </label>
      )}

      {optional && noAccommodation ? null : (<>

      {/* Nieprzypisane osoby (przy noclegu opcjonalnym: informacyjnie — „bez noclegu") */}
      {optional && rooms.length > 0 && unassignedIndexes.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5 px-3 py-2.5 rounded-[10px]"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <span className="text-xs font-semibold w-full" style={{ color: 'var(--muted)' }}>
            {t('room.without_room_list')}
          </span>
          {unassignedIndexes.map((idx) => (
            <span
              key={idx}
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: 'var(--surface-3)', color: 'var(--ink)' }}
            >
              {participantLabel(participants[idx], idx)}
            </span>
          ))}
        </div>
      )}
      {!optional && unassignedIndexes.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5 px-3 py-2.5 rounded-[10px]"
          style={{ background: 'var(--err-soft)', border: '1px solid var(--err)' }}
        >
          <span className="text-xs font-semibold w-full" style={{ color: 'var(--err)' }}>
            {t('room.unassigned')}
          </span>
          {unassignedIndexes.map((idx) => (
            <span
              key={idx}
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: 'var(--err)', color: 'white' }}
            >
              {participantLabel(participants[idx], idx)}
            </span>
          ))}
        </div>
      )}

      {/* Lista pokoi */}
      {rooms.map((room, roomIdx) => {
        const selectedType = roomTypes.find((rt) => rt.id === room.roomId) ?? roomTypes[0]
        // Błędy pojemności dotyczące tego pokoju
        const roomCapError = roomErrors.get(room.uid)

        return (
          <div
            key={room.uid}
            className="rounded-[15px] p-4 flex flex-col gap-3"
            style={{
              border: roomCapError ? '1.5px solid var(--err)' : '1.5px solid var(--border)',
              background: 'var(--surface)',
            }}
          >
            {/* Header pokoju */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {t('summary.room_n', { n: roomIdx + 1 })}
              </span>
              <button
                onClick={() => removeRoom(room.uid)}
                className="p-1 rounded-[8px] transition-colors hover:bg-[var(--err-soft)]"
                style={{ color: 'var(--muted)', border: 'none', background: 'none', cursor: 'pointer' }}
                aria-label={t('room.remove')}
              >
                <X size={16} />
              </button>
            </div>

            {/* Wybór typu pokoju */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                {t('room.type')}
              </label>
              <select
                value={room.roomId}
                onChange={(e) => setRoomType(room.uid, e.target.value)}
                className="w-full rounded-[12px] px-3 py-[11px] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                style={{
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--ink)',
                }}
              >
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {roomLabel(rt.name, i18n.language)} — {money(rt.perPerson)} {t('room.per_person_night')} · {t('room.max_n', { n: rt.cap })}
                  </option>
                ))}
              </select>
            </div>

            {/* Szczegóły wybranego typu */}
            {selectedType && (
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {t('room.capacity', { n: selectedType.cap })}
                  {selectedType.tag ? ` · ${selectedType.tag}` : ''}
                </span>
                <span className="text-sm font-bold font-serif" style={{ color: 'var(--brand)' }}>
                  {money(selectedType.perPerson)}
                  <span className="text-xs font-sans font-normal" style={{ color: 'var(--muted)' }}>
                    {' '}
                    {selectedType.model === 'noc'
                      ? t('room.per_night')
                      : t('room.per_person_night')}
                  </span>
                </span>
              </div>
            )}

            {/* Przypisanie osób */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                {t('room.people')}
              </label>
              <div className="flex flex-col gap-1">
                {participants.map((p, pIdx) => {
                  const isChecked = room.participantIndexes.includes(pIdx)
                  // Czy ta osoba jest przypisana do INNEGO pokoju
                  const isInOther = !isChecked && assignedIndexes.has(pIdx)

                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 cursor-pointer transition-all duration-100"
                      style={{
                        background: isChecked
                          ? 'var(--brand-soft)'
                          : isInOther
                          ? 'var(--surface-2)'
                          : 'transparent',
                        opacity: isInOther ? 0.5 : 1,
                        border: isChecked ? '1px solid var(--brand)' : '1px solid transparent',
                      }}
                    >
                      {/* Custom checkbox */}
                      <div
                        className="flex items-center justify-center shrink-0 rounded-[6px] transition-all duration-150"
                        style={{
                          width: 18,
                          height: 18,
                          border: isChecked ? '2px solid var(--brand)' : '2px solid var(--border)',
                          background: isChecked ? 'var(--brand)' : 'transparent',
                        }}
                      >
                        {isChecked && (
                          <svg width="10" height="7" viewBox="0 0 11 8" fill="none">
                            <path
                              d="M1 4L4 7L10 1"
                              stroke="white"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isChecked}
                        disabled={isInOther}
                        onChange={(e) => {
                          if (!isInOther) toggleParticipant(room.uid, pIdx, e.target.checked)
                        }}
                      />
                      <span className="text-sm" style={{ color: isChecked ? 'var(--brand)' : 'var(--ink)' }}>
                        {participantLabel(p, pIdx)}
                      </span>
                      {isInOther && (
                        <span className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>
                          ({t('room.other_room')})
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Błąd pojemności */}
            {roomCapError && (
              <p className="text-xs font-medium" style={{ color: 'var(--err)' }}>
                {roomCapError}
              </p>
            )}
          </div>
        )
      })}

      {/* Dodaj pokój */}
      <button
        onClick={addRoom}
        className="w-full py-3 text-sm font-semibold rounded-[12px] flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.98]"
        style={{
          border: '1.5px dashed var(--brand)',
          color: 'var(--brand)',
          background: 'transparent',
          cursor: 'pointer',
        }}
      >
        <Plus size={16} />
        {optional && rooms.length === 0 ? t('room.add_first') : t('room.add')}
      </button>
      </>)}

    </div>
  )
}
