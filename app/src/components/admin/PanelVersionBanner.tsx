import { useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { PANEL_BUILD, deployedPanelBuild, startPanelVersionWatch, usePanelStale } from '@/lib/panelVersion'

/**
 * Baner „Dostępna jest nowa wersja panelu” — nie da się go zamknąć; znika po odświeżeniu strony.
 * Pojawia się, gdy `/version.json` na serwerze ma inny znacznik niż build działający w tej karcie.
 * Zapis w „Edytuj event”, kreatorze i edycji zgłoszenia jest wtedy zablokowany (patrz `usePanelStale`).
 */
export default function PanelVersionBanner() {
  const stale = usePanelStale()
  useEffect(() => startPanelVersionWatch(), [])
  if (!stale) return null
  return (
    <div
      role="alert"
      className="flex items-center gap-3 flex-wrap px-6 py-3 text-sm"
      style={{ background: 'var(--warn-soft)', color: 'var(--ink)', borderBottom: '2px solid var(--warn)' }}
    >
      <span className="flex-1" style={{ minWidth: 240 }}>
        <strong>Dostępna jest nowa wersja panelu — odśwież stronę przed zapisaniem zmian.</strong>{' '}
        Ta karta działa w starszej wersji i mogłaby skasować nowsze ustawienia eventu, dlatego zapis w „Edytuj event”, kreatorze i edycji zgłoszenia jest zablokowany do odświeżenia.
        Niezapisane zmiany z otwartego formularza przepadną — zanotuj je przed odświeżeniem.
        <span className="block text-xs" style={{ color: 'var(--muted)' }}>
          wersja w tej karcie: {PANEL_BUILD} · wdrożona: {deployedPanelBuild() ?? '?'}
        </span>
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="flex items-center gap-1.5 font-semibold px-4 py-2 rounded-[10px]"
        style={{ background: 'var(--brand)', color: '#fff', border: 'none', cursor: 'pointer' }}
      >
        <RefreshCw size={14} /> Odśwież
      </button>
    </div>
  )
}
