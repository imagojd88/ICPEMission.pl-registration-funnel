import { useTranslation } from 'react-i18next'
import { Textarea } from '../../ui/Textarea'

interface Props {
  dietaryTags: string[]
  dietaryNotes: string
  extraNotes: string
  onTagsChange: (tags: string[]) => void
  onDietaryNotesChange: (value: string) => void
  onExtraNotesChange: (value: string) => void
}

// Wartości zapisywane w zgłoszeniu zostają po polsku (czyta je organizator);
// gość widzi etykiety w swoim języku (`prefs.diets` — ta sama kolejność).
const DIET_OPTIONS = [
  'Wegetariańska',
  'Wegańska',
  'Bezglutenowa',
  'Bez laktozy',
  'Bez orzechów',
  'Koszerna',
]

export default function Step2Prefs({
  dietaryTags,
  dietaryNotes,
  extraNotes,
  onTagsChange,
  onDietaryNotesChange,
  onExtraNotesChange,
}: Props) {
  const { t } = useTranslation()
  const dietLabels = t('prefs.diets', { returnObjects: true }) as unknown
  const labelFor = (i: number, fallback: string) =>
    Array.isArray(dietLabels) && typeof dietLabels[i] === 'string' ? (dietLabels[i] as string) : fallback

  const toggleTag = (tag: string) => {
    if (dietaryTags.includes(tag)) {
      onTagsChange(dietaryTags.filter((t) => t !== tag))
    } else {
      onTagsChange([...dietaryTags, tag])
    }
  }

  return (
    <div className="flex flex-col gap-5 px-[22px] py-5">
      <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
        {t('prefs.title')}
      </h2>

      {/* Diet chips */}
      <div className="flex flex-wrap gap-2">
        {DIET_OPTIONS.map((option, i) => {
          const isSelected = dietaryTags.includes(option)
          return (
            <button
              key={option}
              onClick={() => toggleTag(option)}
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
              {labelFor(i, option)}
            </button>
          )
        })}
      </div>

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
