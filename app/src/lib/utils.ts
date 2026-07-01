import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatZl(n: number): string {
  return new Intl.NumberFormat('pl-PL').format(Math.round(n)) + ' zł'
}

/** Mapuje kod języka i18n (pl/en/it) na locale BCP-47 do formatowania dat/liczb. */
export function bcp47(lng?: string): string {
  const l = (lng ?? 'pl').slice(0, 2)
  return l === 'en' ? 'en-GB' : l === 'it' ? 'it-IT' : 'pl-PL'
}

/** Zakres dat w bieżącym języku (np. „4 September – 5 September 2026"). */
export function formatDateRange(startIso?: string, endIso?: string, lng?: string): string {
  if (!startIso) return ''
  const loc = bcp47(lng)
  const s = new Date(startIso)
  const e = endIso ? new Date(endIso) : s
  const full = (d: Date) => d.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' })
  if (s.toDateString() === e.toDateString()) return full(s)
  return `${s.toLocaleDateString(loc, { day: 'numeric', month: 'long' })} – ${full(e)}`
}
