import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '../../ui/Input'
import type { Participant } from '../../../pages/PublicFunnel'

interface Props {
  participants: Participant[]
  onChange: (participants: Participant[]) => void
}

let idCounter = 100

function newParticipant(): Participant {
  return {
    id: `p-${++idCounter}`,
    type: 'adult',
    name: '',
    age: 30,
    gender: 'M',
    diet: '',
  }
}

interface CardProps {
  p: Participant
  index: number
  canRemove: boolean
  onUpdate: (updated: Participant) => void
  onRemove: () => void
}

function ParticipantCard({ p, index, canRemove, onUpdate, onRemove }: CardProps) {
  const { t } = useTranslation()

  const isChild = p.type === 'child'

  return (
    <div
      className="rounded-[15px] p-4 flex flex-col gap-3"
      style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        {/* Type toggle */}
        <div
          className="flex rounded-[10px] overflow-hidden p-0.5"
          style={{ background: 'var(--surface-2)' }}
        >
          {(['adult', 'child'] as const).map((type) => (
            <button
              key={type}
              onClick={() => onUpdate({ ...p, type, age: type === 'adult' ? 30 : 8 })}
              className="px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-all duration-150"
              style={{
                background: p.type === type ? 'var(--surface)' : 'transparent',
                color: p.type === type ? 'var(--ink)' : 'var(--muted)',
                boxShadow: p.type === type ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {type === 'adult' ? t('participants.adult') : t('participants.child')}
            </button>
          ))}
        </div>

        {/* Index label */}
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          #{index + 1}
        </span>

        {/* Remove */}
        {canRemove && (
          <button
            onClick={onRemove}
            className="p-1 rounded-[8px] transition-colors duration-150 hover:bg-[var(--err-soft)]"
            style={{ color: 'var(--muted)', border: 'none', background: 'none', cursor: 'pointer' }}
            aria-label={t('participants.remove')}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Child price note */}
      {isChild && (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {t('participants.child_note')}
        </p>
      )}

      {/* Name */}
      <Input
        label={t('participants.name')}
        value={p.name}
        onChange={(e) => onUpdate({ ...p, name: e.target.value })}
        placeholder="Jan Kowalski"
      />

      {/* Age + gender row */}
      <div className="flex gap-3 items-end">
        {/* Age */}
        <div className="flex flex-col gap-1.5 flex-1">
          <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {t('participants.age')}
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={120}
              value={p.age}
              onChange={(e) => onUpdate({ ...p, age: Number(e.target.value) })}
              className="w-full rounded-[12px] pr-9 pl-3 py-[13px] text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              style={{
                border: '1px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--ink)',
              }}
            />
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
              style={{ color: 'var(--muted)' }}
            >
              {t('participants.age_suffix')}
            </span>
          </div>
        </div>

        {/* Gender toggle */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {t('participants.gender')}
          </label>
          <div
            className="flex rounded-[10px] overflow-hidden p-0.5"
            style={{ background: 'var(--surface-2)' }}
          >
            {(['F', 'M'] as const).map((g) => (
              <button
                key={g}
                onClick={() => onUpdate({ ...p, gender: g })}
                className="px-4 py-[10px] text-sm font-semibold rounded-[8px] transition-all duration-150"
                style={{
                  background: p.gender === g ? 'var(--surface)' : 'transparent',
                  color: p.gender === g ? 'var(--ink)' : 'var(--muted)',
                  boxShadow: p.gender === g ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                  minWidth: 44,
                }}
              >
                {g === 'F' ? t('participants.female') : t('participants.male')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Diet */}
      <Input
        label={t('participants.diet')}
        value={p.diet}
        onChange={(e) => onUpdate({ ...p, diet: e.target.value })}
        placeholder="np. wegetariańska, bez glutenu"
      />
    </div>
  )
}

export default function Step1Participants({ participants, onChange }: Props) {
  const { t } = useTranslation()

  const update = (index: number, updated: Participant) => {
    const next = [...participants]
    next[index] = updated
    onChange(next)
  }

  const remove = (index: number) => {
    onChange(participants.filter((_, i) => i !== index))
  }

  const add = () => {
    onChange([...participants, newParticipant()])
  }

  return (
    <div className="flex flex-col gap-4 px-[22px] py-5">
      <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
        {t('participants.title')}
      </h2>

      {participants.map((p, i) => (
        <ParticipantCard
          key={p.id}
          p={p}
          index={i}
          canRemove={participants.length > 1}
          onUpdate={(updated) => update(i, updated)}
          onRemove={() => remove(i)}
        />
      ))}

      {/* Add person button */}
      <button
        onClick={add}
        className="w-full py-3 text-sm font-semibold rounded-[12px] transition-all duration-150 active:scale-[0.98]"
        style={{
          border: '1.5px dashed var(--brand)',
          color: 'var(--brand)',
          background: 'transparent',
          cursor: 'pointer',
        }}
      >
        {t('participants.add')}
      </button>
    </div>
  )
}
