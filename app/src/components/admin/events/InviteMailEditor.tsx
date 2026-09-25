import { useState } from 'react'
import { Eye, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import type { MailPersonalization, MailPreview } from '@/lib/api'

const NOTE_MAX = 3000

/** Czy gość ma cokolwiek niestandardowego w mailu (do znacznika na liście). */
export function isPersonalized(p: MailPersonalization): boolean {
  return !!(p.mailFormal || (p.mailSalutation ?? '').trim() || (p.mailNote ?? '').trim() || (p.mailSubject ?? '').trim())
}

/**
 * Personalizacja maila z zaproszeniem dla jednej osoby: forma grzecznościowa, własny zwrot
 * na początku, dodatkowe zdania i temat. Podgląd renderuje serwer — dokładnie ten HTML,
 * który wyjdzie w mailu.
 */
export default function InviteMailEditor({
  value,
  onChange,
  onPreview,
}: {
  value: MailPersonalization
  onChange: (next: MailPersonalization) => void
  onPreview: () => Promise<MailPreview>
}) {
  const [preview, setPreview] = useState<MailPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<MailPersonalization>) => onChange({ ...value, ...patch })
  const note = value.mailNote ?? ''

  async function showPreview() {
    setLoading(true)
    setError(null)
    try {
      setPreview(await onPreview())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
        <input
          type="checkbox"
          checked={!!value.mailFormal}
          onChange={(e) => set({ mailFormal: e.target.checked })}
          className="accent-[var(--brand)] w-4 h-4"
        />
        Forma grzecznościowa (bez „Ty”, np. dla biskupa, gościa honorowego)
      </label>
      <Input
        placeholder="Zwrot na początku, np. „Szanowny Księże Biskupie,” (puste = imię)"
        value={value.mailSalutation ?? ''}
        onChange={(e) => set({ mailSalutation: e.target.value })}
      />
      <Input
        placeholder="Temat maila (puste = „Zaproszenie — nazwa wydarzenia”)"
        value={value.mailSubject ?? ''}
        onChange={(e) => set({ mailSubject: e.target.value })}
      />
      <div className="flex flex-col gap-1">
        <textarea
          rows={4}
          maxLength={NOTE_MAX}
          placeholder="Dodatkowe zdania od organizatora — trafią do maila po terminie i miejscu wydarzenia. Enter = nowy akapit."
          value={note}
          onChange={(e) => set({ mailNote: e.target.value })}
          className="w-full rounded-[12px] border px-3 py-2 text-sm"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)', resize: 'vertical' }}
        />
        <p className="text-[11px] text-right" style={{ color: 'var(--faint)' }}>{note.length}/{NOTE_MAX}</p>
      </div>
      <div>
        <Button size="sm" variant="outline" onClick={() => { void showPreview() }} disabled={loading}>
          <Eye size={14} /> {loading ? 'Przygotowuję…' : 'Podgląd maila'}
        </Button>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--err)' }}>{error}</p>}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full flex flex-col rounded-[15px] overflow-hidden"
            style={{ maxWidth: 640, maxHeight: '90vh', background: 'var(--surface)', border: '1px solid var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="min-w-0">
                <p className="text-xs" style={{ color: 'var(--faint)' }}>Do: {preview.to || '—'}</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{preview.subject}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Zamknij podgląd"
                className="p-1.5 rounded-[8px] shrink-0"
                style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
            {/* Mail renderowany w izolowanej ramce — style maila nie mieszają się z panelem. */}
            <iframe
              title="Podgląd maila"
              srcDoc={`<!doctype html><html><body style="margin:16px;background:#fff">${preview.html}</body></html>`}
              sandbox=""
              style={{ width: '100%', height: 520, border: 'none', background: '#fff' }}
            />
            <p className="px-4 py-2 text-[11px]" style={{ color: 'var(--faint)', borderTop: '1px solid var(--border)' }}>
              Tak wygląda mail. Przycisk w podglądzie jest nieaktywny — w wysłanym mailu prowadzi do osobistego linku.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
