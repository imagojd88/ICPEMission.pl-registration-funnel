/** Start zapisów eventu: pomocnicze funkcje dla lejka i panelu. */

/** Czas startu zapisów w ms albo null, gdy brak / nieprawidłowa data. */
export function opensAtMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** Czy zapisy jeszcze się nie zaczęły (data startu w przyszłości). */
export function notYetOpen(iso: string | null | undefined, now = Date.now()): boolean {
  const ms = opensAtMs(iso)
  return ms !== null && ms > now
}

/** ISO → wartości pól <input type="date"> i <input type="time"> w czasie lokalnym przeglądarki. */
export function isoToLocalInputs(iso: string | null | undefined): { date: string; time: string } {
  const ms = opensAtMs(iso)
  if (ms === null) return { date: '', time: '' }
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` }
}

/** Pola daty i godziny (czas lokalny) → ISO; pusta data = null. */
export function localInputsToIso(date: string, time: string): string | null {
  if (!date) return null
  const d = new Date(`${date}T${time || '00:00'}:00`)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}
