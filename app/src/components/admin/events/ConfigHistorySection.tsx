import { useCallback, useEffect, useState } from 'react'
import { History, RotateCcw } from 'lucide-react'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { getConfigHistory, restoreConfigVersion, type ConfigHistoryItem } from '@/lib/api'
import { clientStamp, usePanelStale, STALE_SAVE_MESSAGE } from '@/lib/panelVersion'

const SOURCE_PL: Record<string, string> = { panel: 'panel', service: 'integracja (token serwisowy)', restore: 'przywrócenie z historii', system: 'system' }

/**
 * „Edytuj event” ▸ „Historia zmian cennika”: stan cennika SPRZED każdego zapisu (ostatnie 20 wersji)
 * z możliwością przywrócenia. Przywrócenie podmienia tylko cennik (`pricingConfig`); nazwa, daty,
 * strona i dane przelewu zostają. Po przywróceniu formularz wczytuje się ponownie.
 */
export default function ConfigHistorySection({ instanceId, onRestored }: { instanceId: string; onRestored: () => void }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ConfigHistoryItem[] | null>(null)
  const [currentSummary, setCurrentSummary] = useState('')
  const [configRev, setConfigRev] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [ask, setAsk] = useState<ConfigHistoryItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<string | null>(null)
  const stale = usePanelStale()

  const load = useCallback(() => {
    setError(null)
    getConfigHistory(instanceId)
      .then((d) => { setItems(d.items); setCurrentSummary(d.currentSummary); setConfigRev(d.configRev) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [instanceId])
  useEffect(() => { if (open) load() }, [open, load])

  async function restore(item: ConfigHistoryItem) {
    if (stale) { setError(STALE_SAVE_MESSAGE); setAsk(null); return }
    setBusy(true)
    setError(null)
    try {
      await restoreConfigVersion(instanceId, item.id, clientStamp(configRev))
      setAsk(null)
      onRestored()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setAsk(null)
    } finally {
      setBusy(false)
    }
  }

  const when = (iso: string) => new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="rounded-[20px] border p-5 flex flex-col gap-3" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-2 text-sm font-semibold text-left" style={{ background: 'none', border: 'none', color: 'var(--ink)', cursor: 'pointer', padding: 0 }}>
        <History size={16} /> Historia zmian cennika {open ? '▾' : '▸'}
      </button>
      {open && (
        <>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Przy każdym zapisie, który coś zmienia, zachowujemy stan sprzed zapisu (ostatnie 20 wersji): kiedy, kto i z jakiej wersji panelu.
            „Przywróć” podmienia cały cennik (ceny, pokoje, poziomy cen, zniżki wiekowe, harmonogram, dodatki, kody) na ten z wybranej wersji;
            nazwa, daty, strona i dane przelewu zostają. Obecny stan trafia wtedy do historii, więc przywrócenie też da się cofnąć.
          </p>
          <p className="text-xs" style={{ color: 'var(--faint)' }}>Teraz: {currentSummary || '—'}</p>
          {error && <p className="text-sm" role="alert" style={{ color: 'var(--err)' }}>{error}</p>}
          {items === null && !error && <p className="text-sm" style={{ color: 'var(--faint)' }}>Wczytywanie…</p>}
          {items !== null && items.length === 0 && (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Brak wpisów — historia zbiera się od pierwszego zapisu po wdrożeniu tej funkcji (26.11.2026).</p>
          )}
          {(items ?? []).map((it) => (
            <div key={it.id} className="rounded-[12px] px-3 py-2 flex flex-col gap-1" style={{ border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Stan sprzed zapisu z {when(it.createdAt)}</span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  zapisał: {it.actor} · {SOURCE_PL[it.source] ?? it.source}{it.clientVersion ? ` · wersja panelu: ${it.clientVersion}` : ' · bez znacznika wersji panelu'}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => setShown(shown === it.id ? null : it.id)} className="text-xs underline" style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer' }}>
                    {shown === it.id ? 'ukryj szczegóły' : 'szczegóły'}
                  </button>
                  <Button size="sm" variant="outline" onClick={() => setAsk(it)} disabled={busy || stale || !it.pricingConfig}>
                    <RotateCcw size={13} /> Przywróć
                  </Button>
                </span>
              </div>
              <span className="text-xs" style={{ color: 'var(--faint)' }}>{it.summary}</span>
              {shown === it.id && (
                <pre className="text-xs overflow-auto rounded-[8px] p-2" style={{ maxHeight: 320, background: 'var(--bg)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
                  {JSON.stringify(it.pricingConfig, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </>
      )}
      {ask && (
        <ConfirmDialog
          title="Przywrócić cennik z tej wersji?"
          confirmLabel="Przywróć cennik"
          busy={busy}
          busyLabel="Przywracam…"
          onConfirm={() => { void restore(ask) }}
          onClose={() => setAsk(null)}
        >
          <p className="text-sm" style={{ color: 'var(--ink)' }}>
            Cennik eventu zostanie zastąpiony stanem sprzed zapisu z {when(ask.createdAt)} ({ask.summary}).
            Niezapisane zmiany w otwartym formularzu przepadną — formularz wczyta się od nowa. Ceny już złożonych zgłoszeń się nie zmienią.
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}
