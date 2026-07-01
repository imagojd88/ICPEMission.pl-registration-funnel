import { useTranslation } from 'react-i18next'
import { validateRoomCapacity, formatMoney } from '@icpe/shared'
import type { PricingConfig, PriceInput } from '@icpe/shared'
import type { Participant, RoomEntry } from '../../../pages/PublicFunnel'
import { X, Plus } from 'lucide-react'

interface Props {
  rooms: RoomEntry[]
  participants: Participant[]
  pricingConfig: PricingConfig
  onChange: (rooms: RoomEntry[]) => void
}

let uidCounter = 0
function newRoomUid() {
  return `room-${++uidCounter}-${Date.now()}`
}

export default function Step3Room({ rooms, participants, pricingConfig, onChange }: Props) {
  const { t, i18n } = useTranslation()
  const money = (n: number) => formatMoney(n, pricingConfig.currency, i18n.language)

  const roomTypes = pricingConfig.rooms

  // Które indeksy uczestników są już przypisane do jakiegokolwiek pokoju
  const assignedIndexes = new Set(rooms.flatMap((r) => r.participantIndexes))
  const unassignedIndexes = participants
    .map((_, idx) => idx)
    .filter((idx) => !assignedIndexes.has(idx))

  // Walidacja pojemności
  const validationInput: PriceInput = {
    rooms: rooms.map((r) => ({
      roomId: r.roomId,
      participants: r.participantIndexes
        .filter((idx) => idx >= 0 && idx < participants.length)
        .map((idx) => ({ type: participants[idx].type, age: participants[idx].age })),
    })),
  }
  const { errors: capErrors } = validateRoomCapacity(validationInput, pricingConfig)

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
    const name = p.name.trim() || (p.type === 'adult' ? 'Dorosły' : 'Dziecko')
    return `#${idx + 1} ${name}${p.type === 'child' ? ` (${p.age} lat)` : ''}`
  }

  return (
    <div className="flex flex-col gap-4 px-[22px] py-5">
      <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
        {t('room.title')}
      </h2>

      {/* Nieprzypisane osoby */}
      {unassignedIndexes.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5 px-3 py-2.5 rounded-[10px]"
          style={{ background: 'var(--err-soft)', border: '1px solid var(--err)' }}
        >
          <span className="text-xs font-semibold w-full" style={{ color: 'var(--err)' }}>
            Nieprzypisane osoby:
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
        const roomCapError = capErrors.find((e) => selectedType && e.includes(selectedType.name))

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
                Pokój {roomIdx + 1}
              </span>
              <button
                onClick={() => removeRoom(room.uid)}
                className="p-1 rounded-[8px] transition-colors hover:bg-[var(--err-soft)]"
                style={{ color: 'var(--muted)', border: 'none', background: 'none', cursor: 'pointer' }}
                aria-label="Usuń pokój"
              >
                <X size={16} />
              </button>
            </div>

            {/* Wybór typu pokoju */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                Typ pokoju
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
                    {rt.name} — {money(rt.perPerson)}/os/noc · maks. {rt.cap} os.
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
                Osoby w pokoju
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
                          (inny pokój)
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
        Dodaj pokój
      </button>

      {/* Globalne błędy walidacji */}
      {capErrors.length > 0 && (
        <div className="flex flex-col gap-1">
          {capErrors
            .filter(
              (e) =>
                !rooms.some((r) => {
                  const rt = pricingConfig.rooms.find((t) => t.id === r.roomId)
                  return rt && e.includes(rt.name)
                }),
            )
            .map((e, i) => (
              <p key={i} className="text-xs font-medium" style={{ color: 'var(--err)' }}>
                {e}
              </p>
            ))}
        </div>
      )}
    </div>
  )
}
