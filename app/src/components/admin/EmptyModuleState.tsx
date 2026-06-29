import { Wrench } from 'lucide-react'

interface EmptyModuleStateProps {
  description?: string
}

export default function EmptyModuleState({
  description = 'Ten moduł jest aktualnie w przygotowaniu. Wróć wkrótce.',
}: EmptyModuleStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5 text-center">
      <div
        className="flex items-center justify-center rounded-[18px]"
        style={{ width: 64, height: 64, background: 'var(--brand-soft)' }}
      >
        <Wrench size={28} style={{ color: 'var(--brand)' }} />
      </div>
      <div>
        <p className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
          Moduł w przygotowaniu
        </p>
        <p className="mt-1 text-sm max-w-[340px]" style={{ color: 'var(--muted)' }}>
          {description}
        </p>
      </div>
    </div>
  )
}
