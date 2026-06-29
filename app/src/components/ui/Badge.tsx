import { cva, type VariantProps } from 'class-variance-authority'
import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-[99px] border transition-colors',
  {
    variants: {
      variant: {
        ok: 'bg-[var(--ok-soft)] text-[var(--ok)] border-[var(--ok-soft)]',
        warn: 'bg-[var(--warn-soft)] text-[var(--warn)] border-[var(--warn-soft)]',
        err: 'bg-[var(--err-soft)] text-[var(--err)] border-[var(--err-soft)]',
        brand: 'bg-[var(--brand-soft)] text-[var(--brand)] border-[var(--brand-soft)]',
        accent: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-soft)]',
        muted: 'bg-[var(--surface-3)] text-[var(--muted)] border-[var(--border)]',
      },
    },
    defaultVariants: {
      variant: 'muted',
    },
  },
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
export default Badge
