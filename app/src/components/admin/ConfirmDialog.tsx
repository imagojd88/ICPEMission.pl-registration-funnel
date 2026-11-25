import type { ReactNode } from 'react'
import Button from '@/components/ui/Button'

/**
 * Okno potwierdzenia dla operacji panelu (anulowanie, przywracanie, usuwanie, operacje zbiorcze).
 * Zamyka się kliknięciem tła albo „Anuluj” — nie w trakcie wykonywania (`busy`).
 */
export default function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Anuluj',
  tone = 'default',
  busy = false,
  busyLabel = 'Wykonuję…',
  confirmDisabled = false,
  error,
  onConfirm,
  onClose,
}: {
  title: string
  children: ReactNode
  /** brak = okno tylko informacyjne (sam przycisk zamknięcia) */
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger' | 'ok'
  busy?: boolean
  busyLabel?: string
  confirmDisabled?: boolean
  error?: string | null
  onConfirm?: () => void
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)', zIndex: 70 }}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <form
        className="rounded-[15px] border p-5 flex flex-col gap-3 w-full"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
        onSubmit={(e) => { e.preventDefault(); if (!busy && !confirmDisabled) onConfirm?.() }}
      >
        <h3 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>{title}</h3>
        <div className="flex flex-col gap-2.5 text-sm" style={{ color: 'var(--ink)' }}>{children}</div>
        {error && <p className="text-sm font-medium" role="alert" style={{ color: 'var(--err)' }}>{error}</p>}
        <div className="flex justify-end gap-2 mt-1">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onClose}>{confirmLabel ? cancelLabel : 'Zamknij'}</Button>
          {confirmLabel && (
            <Button
              type="submit"
              size="sm"
              variant={tone === 'danger' ? 'destructive' : 'default'}
              disabled={busy || confirmDisabled}
              style={tone === 'ok' ? { background: 'var(--ok)' } : undefined}
            >
              {busy ? busyLabel : confirmLabel}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
