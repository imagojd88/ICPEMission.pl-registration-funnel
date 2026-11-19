import { useTranslation } from 'react-i18next'
import { Textarea } from '../../ui/Textarea'
import type { Participant } from '../../../pages/PublicFunnel'
import { enabledDiets } from '../../../lib/diets'

interface Props {
  /** Uczestnicy — diety zaznacza się osobno dla każdej osoby. */
  participants: Participant[]
  onParticipantsChange: (participants: Participant[]) => void
  /** Diety włączone w evencie przez admina (`customFields.diets`). Pusta = brak wyboru diet. */
  dietKeys: string[]
  dietaryNotes: string
  extraNotes: string
  onDietaryNotesChange: (value: string) => void
  onExtraNotesChange: (value: string) => void
}

export default function Step2Prefs({
  participants,
  onParticipantsChange,
  dietKeys,
  dietaryNotes,
  extraNotes,
  onDietaryNotesChange,
  onExtraNotesChange,
}: Props) {
  const { t, i18n } = useTranslation()
  const lng = (i18n.language || 'pl').slice(0, 2) as 'pl' | 'en' | 'it'
  const diets = enabledDiets(dietKeys)

  const toggle = (pIdx: number, key: string) =>
    onParticipantsChange(
      participants.map((p, i) => {
        if (i !== pIdx) return p
        const cur = p.dietKeys ?? []
        return { ...p, dietKeys: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] }
      }),
    )

  const personLabel = (p: Participant, i: number) =>
    p.name.trim() || `#${i + 1} ${p.type === 'adult' ? t('participants.adult') : t('participants.child')}`

  return (
    <div className="flex flex-col gap-5 px-[22px] py-5">
      <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
        {t('prefs.title')}
      </h2>

      {/* Diety włączone w evencie — osobno dla każdej osoby */}
      {diets.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm -mt-2" style={{ color: 'var(--muted)' }}>
            {t('prefs.diets_hint')}
          </p>
          {participants.map((p, pi) => (
            <div
              key={p.id}
              className="flex flex-col gap-2 rounded-[15px] px-4 py-3"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                {personLabel(p, pi)}
              </span>
              <div className="flex flex-wrap gap-2">
                {diets.map((d) => {
                  const isSelected = (p.dietKeys ?? []).includes(d.key)
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => toggle(pi, d.key)}
                      aria-pressed={isSelected}
                      className="text-sm font-medium transition-all duration-150 active:scale-[0.97]"
                      style={{
                        padding: '6px 14px',
                        borderRadius: 99,
                        border: isSelected ? '1.5px solid var(--brand)' : '1.5px solid var(--border)',
                        background: isSelected ? 'var(--brand-soft)' : 'var(--surface-2)',
                        color: isSelected ? 'var(--brand)' : 'var(--ink)',
                        cursor: 'pointer',
                      }}
                    >
                      {isSelected ? '✓ ' : ''}{d.label[lng] ?? d.label.pl}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Allergies textarea */}
      <Textarea
        label={t('prefs.allergies_label')}
        value={dietaryNotes}
        onChange={(e) => onDietaryNotesChange(e.target.value)}
        placeholder={t('prefs.allergies_placeholder')}
        rows={3}
      />

      {/* Extra notes textarea */}
      <Textarea
        label={t('prefs.notes_label')}
        value={extraNotes}
        onChange={(e) => onExtraNotesChange(e.target.value)}
        placeholder={t('prefs.notes_placeholder')}
        rows={3}
      />
    </div>
  )
}
