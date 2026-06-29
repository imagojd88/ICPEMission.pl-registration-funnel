import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hint?: ReactNode
  error?: string
  label?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, hint, error, label, id, ...props }, ref) => {
    const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[var(--ink)]"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            'w-full rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)]',
            'px-3 py-[13px] text-sm text-[var(--ink)] placeholder:text-[var(--faint)]',
            'transition-all duration-150',
            'focus:outline-none focus:border-[var(--brand)] focus:bg-[var(--surface)]',
            'focus:ring-2 focus:ring-[var(--ring)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error && 'border-[var(--err)] focus:border-[var(--err)] focus:ring-[var(--err-soft)]',
            className,
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-[var(--err)] font-medium">{error}</p>
        )}
        {hint && !error && (
          <p className="text-xs text-[var(--muted)]">{hint}</p>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'

export { Input }
export default Input
