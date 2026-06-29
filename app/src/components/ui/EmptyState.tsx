import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 py-16 px-6 text-center',
        className,
      )}
    >
      {icon && (
        <div className="flex items-center justify-center w-14 h-14 rounded-[16px] bg-[var(--surface-3)] text-[var(--muted)] text-2xl">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="text-base font-semibold text-[var(--ink)]">{title}</p>
        {description && (
          <p className="text-sm text-[var(--muted)] max-w-xs">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

export default EmptyState
