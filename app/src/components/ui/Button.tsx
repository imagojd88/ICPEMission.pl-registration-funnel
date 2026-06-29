import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // base
  'inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
  {
    variants: {
      variant: {
        default: [
          'bg-[var(--brand)] text-white',
          'hover:bg-[var(--brand-2)] active:scale-[0.98]',
        ],
        cta: [
          'bg-[var(--accent)] text-white',
          'hover:bg-[var(--accent-2)] active:scale-[0.98]',
          'shadow-[0_4px_20px_rgba(197,106,58,0.35)]',
          'hover:shadow-[0_6px_28px_rgba(197,106,58,0.45)]',
        ],
        outline: [
          'border border-[var(--border)] bg-transparent text-[var(--ink)]',
          'hover:bg-[var(--surface-2)] active:scale-[0.98]',
        ],
        ghost: [
          'bg-transparent text-[var(--ink)]',
          'hover:bg-[var(--surface-2)] active:scale-[0.98]',
        ],
        destructive: [
          'bg-[var(--err)] text-white',
          'hover:opacity-90 active:scale-[0.98]',
        ],
      },
      size: {
        sm: 'h-8 px-3 text-sm rounded-[10px]',
        default: 'h-10 px-4 text-sm rounded-[12px]',
        lg: 'h-12 px-6 text-base rounded-[14px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
)
Button.displayName = 'Button'

export { Button, buttonVariants }
export default Button
