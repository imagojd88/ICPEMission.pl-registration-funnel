import { cn } from '@/lib/utils'

interface SpinnerProps {
  size?: 'sm' | 'default' | 'lg'
  className?: string
}

const sizeMap = {
  sm: 'w-4 h-4 border-2',
  default: 'w-6 h-6 border-2',
  lg: 'w-10 h-10 border-[3px]',
}

export function Spinner({ size = 'default', className }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Ładowanie"
      className={cn(
        'rounded-full border-[var(--border-2)] border-t-[var(--brand)] animate-spin',
        sizeMap[size],
        className,
      )}
    />
  )
}

export default Spinner
