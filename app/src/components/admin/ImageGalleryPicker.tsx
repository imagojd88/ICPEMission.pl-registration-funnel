import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { listUploads, type UploadItem } from '@/lib/api'

export default function ImageGalleryPicker({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void
  onClose: () => void
}) {
  const [items, setItems] = useState<UploadItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listUploads()
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div
        className="w-full rounded-[18px] border flex flex-col overflow-hidden"
        style={{ maxWidth: 720, maxHeight: '80vh', background: 'var(--surface)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>Galeria wgranych obrazków</p>
          <button onClick={onClose} className="p-1.5 rounded-[8px]" style={{ color: 'var(--faint)' }}><X size={16} /></button>
        </div>
        <div className="p-5 overflow-y-auto">
          {error && (
            <div className="px-4 py-3 rounded-[12px] text-sm" style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}>
              {error}
            </div>
          )}
          {items === null ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--faint)' }}>Ładowanie…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--faint)' }}>
              Brak wgranych obrazków. Wgraj pierwszy przez „Wgraj”.
            </p>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => { onSelect(it.url); onClose() }}
                  className="rounded-[12px] overflow-hidden border transition-all hover:-translate-y-0.5"
                  style={{ borderColor: 'var(--border)', cursor: 'pointer', aspectRatio: '4/3', background: 'var(--surface-2)' }}
                  title={`${Math.round(it.size / 1024)} KB`}
                >
                  <img src={it.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
