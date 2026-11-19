import { useEffect, useRef, useState } from 'react'
import { ExternalLink, RotateCw } from 'lucide-react'
import type { PreviewMessage, PreviewScreen } from '@/pages/PublicFunnel'

/**
 * Podgląd na żywo ekranów zapisu w „Edytuj event" — prawdziwy lejek (`/r/:slug?preview=1`)
 * w ramce telefonu. Szkic eventu z formularza (jeszcze niezapisany) idzie do iframe'a przez
 * postMessage; przyciski pod ramką przełączają ekrany. W podglądzie nic nie jest wysyłane,
 * nie powstają szkice w przeglądarce i nie liczy się analityka.
 */
const SCREENS: { id: PreviewScreen; label: string; stay?: boolean; paid?: boolean }[] = [
  { id: 'landing', label: 'Strona' },
  { id: 'step0', label: 'Dane' },
  { id: 'step1', label: 'Uczestnicy' },
  { id: 'step2', label: 'Preferencje' },
  { id: 'step3', label: 'Nocleg', stay: true },
  { id: 'step4', label: 'Opcje' },
  { id: 'payment_method', label: 'Płatność', paid: true },
  { id: 'summary', label: 'Podsumowanie' },
  { id: 'success', label: 'Po wysłaniu' },
]

export default function EventPreviewPane({
  slug,
  draft,
  lang,
  hasRooms,
  free,
  simple,
}: {
  /** zapisany slug eventu — adres podglądu (nie zmienia się w trakcie pisania) */
  slug: string
  draft: Omit<PreviewMessage, 'type' | 'screen' | 'lang'>
  /** język treści edytowany w formularzu — podgląd przełącza się razem z nim */
  lang: string
  hasRooms: boolean
  free: boolean
  /** event bez lejka krokowego (STANDALONE / INVITE) — tylko ekran startowy */
  simple: boolean
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [screen, setScreen] = useState<PreviewScreen>('landing')
  const [reloadKey, setReloadKey] = useState(0)
  const draftJson = JSON.stringify(draft)

  // iframe zgłasza gotowość → wysyłamy szkic i ekran
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if ((e.data as { type?: string })?.type === 'icpe-preview-ready') setReady(true)
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const post = (extra: Partial<PreviewMessage>) => {
    frame.current?.contentWindow?.postMessage(
      { type: 'icpe-preview', ...JSON.parse(draftJson), lang, ...extra } satisfies PreviewMessage,
      window.location.origin,
    )
  }

  // Szkic (z opóźnieniem — nie przy każdym znaku)
  useEffect(() => {
    if (!ready) return
    const id = window.setTimeout(() => post({}), 300)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, draftJson, lang])

  // Zmiana ekranu — od razu (razem ze szkicem, żeby kroki liczyły się z aktualnego cennika)
  useEffect(() => {
    if (ready) post({ screen })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, screen])

  const visible = SCREENS.filter((s) => (simple ? s.id === 'landing' : (!s.stay || hasRooms) && (!s.paid || !free)))
  const src = `/r/${encodeURIComponent(slug || 'podglad')}?preview=1`

  return (
    <aside
      className="hidden xl:flex flex-col gap-3 sticky shrink-0"
      style={{ top: 16, width: 404 }}
      aria-label="Podgląd ekranów gościa"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>
          Podgląd dla gościa
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { setReady(false); setReloadKey((k) => k + 1) }}
            className="p-1.5 rounded-[8px]"
            style={{ color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            title="Odśwież podgląd"
          >
            <RotateCw size={14} />
          </button>
          {slug && (
            <a href={`/r/${encodeURIComponent(slug)}`} target="_blank" rel="noreferrer" className="p-1.5 rounded-[8px]" style={{ color: 'var(--muted)' }} title="Otwórz zapisaną stronę w nowej karcie">
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {visible.map((s) => {
          const on = screen === s.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setScreen(s.id)}
              className="text-xs font-semibold rounded-full px-2.5 py-1"
              style={{
                border: `1px solid ${on ? 'var(--brand)' : 'var(--border)'}`,
                background: on ? 'var(--brand)' : 'var(--surface)',
                color: on ? '#fff' : 'var(--muted)',
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          )
        })}
      </div>

      <div
        className="rounded-[36px] p-[10px]"
        style={{ background: '#1f2328', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}
      >
        <iframe
          key={reloadKey}
          ref={frame}
          src={src}
          title="Podgląd strony zapisu"
          className="block w-full rounded-[28px]"
          style={{ height: 'min(780px, calc(100vh - 150px))', border: 'none', background: 'var(--bg)' }}
        />
      </div>
      <p className="text-[11px] leading-snug" style={{ color: 'var(--faint)' }}>
        Pokazuje zmiany na bieżąco, zanim je zapiszesz. Przykładowe zgłoszenie: dorosły + dziecko 2 lata. W podglądzie nic nie jest wysyłane.
      </p>
    </aside>
  )
}
