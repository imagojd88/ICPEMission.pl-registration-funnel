import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatZl(n: number): string {
  return new Intl.NumberFormat('pl-PL').format(Math.round(n)) + ' zł'
}
