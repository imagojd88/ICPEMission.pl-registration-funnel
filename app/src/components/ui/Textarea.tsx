import { forwardRef, type TextareaHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  hint?: ReactNode
  error?: string
  label?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
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
        <textarea
          id={inputId}
          ref={ref}
          className={cn(
            'w-full rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)]',
            'px-3 py-[13px] text-sm text-[var(--ink)] placeholder:text-[var(--faint)]',
            'transition-all duration-150 resize-y min-h-[100px]',
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
Textarea.displayName = 'Textarea'

export { Textarea }
export default Textarea
