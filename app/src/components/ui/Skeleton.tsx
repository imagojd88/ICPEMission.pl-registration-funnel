import { type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-[10px] bg-[var(--surface-3)]',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
export default Skeleton
