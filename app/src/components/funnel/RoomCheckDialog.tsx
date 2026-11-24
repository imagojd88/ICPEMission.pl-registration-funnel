import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { BedDouble } from 'lucide-react'

/**
 * Okienko w kroku „Nocleg” po kliknięciu „Dalej”, gdy wybór noclegu jest niepełny.
 * - `missing`: nie wybrano pokoju (i nie zaznaczono „Nie potrzebuję noclegu”) albo pokój jest pusty → tylko „Popraw”.
 * - `error`: inny błąd pokoi (pojemność, brak wolnych) → tylko „Popraw”.
 * - `partial`: nocleg opcjonalny, część osób bez pokoju → „Przypiszę do pokoju” albo „Tak, bez noclegu dla nich”.
 */
export type RoomDialog =
  | { kind: 'missing'; detail?: string }
  | { kind: 'error'; detail: string }
  | { kind: 'partial'; names: string[] }

export default function RoomCheckDialog({
  dialog,
  onClose,
  onConfirmPartial,
}: {
  dialog: RoomDialog
  onClose: () => void
  onConfirmPartial: () => void
}) {
  const { t } = useTranslation()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const partial = dialog.kind === 'partial'
  const title = partial ? t('room.partial_title') : t('room.dialog_title')

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="room-dialog-title"
        className="w-full rounded-[18px] p-5 flex flex-col gap-3"
        style={{ maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span
            className="flex items-center justify-center rounded-full shrink-0"
            style={{ width: 40, height: 40, background: partial ? 'var(--warn-soft)' : 'var(--err-soft)', color: partial ? 'var(--warn)' : 'var(--err)' }}
          >
            <BedDouble size={20} />
          </span>
          <h3 id="room-dialog-title" className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
            {title}
          </h3>
        </div>

        {dialog.kind === 'missing' && (
          <>
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{t('room.dialog_missing')}</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('room.dialog_missing_hint')}</p>
          </>
        )}
        {dialog.kind === 'error' && (
          <p className="text-sm" style={{ color: 'var(--ink)' }}>{dialog.detail}</p>
        )}
        {dialog.kind === 'partial' && (
          <>
            <p className="text-sm" style={{ color: 'var(--ink)' }}>{t('room.partial_desc')}</p>
            <ul className="text-sm font-semibold pl-5 list-disc" style={{ color: 'var(--ink)' }}>
              {dialog.names.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="w-full text-white text-sm font-semibold rounded-[14px] py-3"
            style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
          >
            {partial ? t('room.partial_back') : t('room.dialog_fix')}
          </button>
          {partial && (
            <button
              type="button"
              onClick={onConfirmPartial}
              className="w-full text-sm font-medium rounded-[14px] py-3"
              style={{ background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
            >
              {t('room.partial_ok')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
