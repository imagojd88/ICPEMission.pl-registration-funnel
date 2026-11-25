import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Link2, Printer, Search, X } from 'lucide-react'
import { HELP_SECTIONS, HELP_UPDATED, type HelpArticle, type HelpBlock, type HelpSection } from './helpContent'

/** Adres zakładki: `#pomoc`, konkretna instrukcja lub sekcja: `#pomoc/<id>`. */
export const HELP_HASH = '#pomoc'

/** Bez polskich znaków i wielkości liter — żeby „platnosc” znalazło „Płatność”. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function blockText(b: HelpBlock): string {
  switch (b.type) {
    case 'p':
    case 'note':
      return b.text
    case 'steps':
    case 'list':
      return b.items.join(' ')
    case 'table':
      return [...(b.head ?? []), ...b.rows.flat()].join(' ')
  }
}

function idFromHash(): string | null {
  const h = decodeURIComponent(window.location.hash || '')
  if (!h.startsWith(HELP_HASH)) return null
  const rest = h.slice(HELP_HASH.length).replace(/^\//, '')
  return rest || null
}

function setHash(id: string | null) {
  const next = id ? `${HELP_HASH}/${id}` : HELP_HASH
  if (window.location.hash !== next) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${next}`)
}

/** Tekst z `fragmentami kodu` w odwróconych apostrofach (bez wstawiania HTML). */
function Rich({ text }: { text: string }) {
  const parts = text.split('`')
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code
            key={i}
            className="help-code"
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.9em', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 5px', wordBreak: 'break-word' }}
          >
            {part}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}

const NOTE_TONE: Record<'info' | 'warn' | 'err', { bg: string; border: string; label: string }> = {
  info: { bg: 'var(--brand-soft)', border: 'var(--brand)', label: 'Warto wiedzieć' },
  warn: { bg: 'var(--warn-soft)', border: 'var(--warn)', label: 'Uwaga' },
  err: { bg: 'var(--err-soft)', border: 'var(--err)', label: 'Ważne' },
}

function Block({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case 'p':
      return (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--ink)' }}>
          <Rich text={block.text} />
        </p>
      )
    case 'steps':
      return (
        <ol className="text-sm leading-relaxed flex flex-col gap-1.5" style={{ color: 'var(--ink)', listStyle: 'decimal', paddingLeft: 22 }}>
          {block.items.map((it, i) => (
            <li key={i} style={{ paddingLeft: 4 }}>
              <Rich text={it} />
            </li>
          ))}
        </ol>
      )
    case 'list':
      return (
        <ul className="text-sm leading-relaxed flex flex-col gap-1.5" style={{ color: 'var(--ink)', listStyle: 'disc', paddingLeft: 22 }}>
          {block.items.map((it, i) => (
            <li key={i} style={{ paddingLeft: 4 }}>
              <Rich text={it} />
            </li>
          ))}
        </ul>
      )
    case 'note': {
      const tone = NOTE_TONE[block.tone]
      return (
        <div className="help-note rounded-[10px] px-3 py-2.5 text-sm leading-relaxed" style={{ background: tone.bg, borderLeft: `3px solid ${tone.border}`, color: 'var(--ink)' }}>
          <strong>{tone.label}: </strong>
          <Rich text={block.text} />
        </div>
      )
    }
    case 'table':
      return (
        <div className="overflow-x-auto rounded-[10px] border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            {block.head && (
              <thead>
                <tr style={{ background: 'var(--surface-2)' }}>
                  {block.head.map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold" style={{ color: 'var(--faint)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} style={{ borderTop: i > 0 || block.head ? '1px solid var(--border)' : undefined }}>
                  <td className="px-3 py-2 align-top font-semibold" style={{ color: 'var(--ink)', width: '36%', minWidth: 130 }}>
                    <Rich text={row[0]} />
                  </td>
                  <td className="px-3 py-2 align-top leading-relaxed" style={{ color: 'var(--ink)' }}>
                    <Rich text={row[1]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

/** Styl druku: chowa menu i narzędzia, rozwija wszystkie instrukcje, zdejmuje przewijane kontenery panelu. */
const PRINT_CSS = `
@media print {
  aside, .help-noprint { display: none !important; }
  html, body, #root { height: auto !important; overflow: visible !important; background: #fff !important; }
  .h-screen { height: auto !important; }
  .overflow-hidden, .overflow-y-auto { overflow: visible !important; }
  .sticky { position: static !important; }
  main { padding: 0 !important; }
  .help-grid { display: block !important; }
  .help-body { display: flex !important; }
  .help-article { break-inside: avoid; box-shadow: none !important; }
  .help-section-title { break-after: avoid; }
}
`

export default function HelpScreen() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [copied, setCopied] = useState<string | null>(null)

  const q = fold(query.trim())

  const sections: HelpSection[] = useMemo(() => {
    if (!q) return HELP_SECTIONS
    const words = q.split(/\s+/)
    const hit = (a: HelpArticle, s: HelpSection) => {
      const hay = fold([s.title, a.title, ...a.blocks.map(blockText)].join(' '))
      return words.every((w) => hay.includes(w))
    }
    return HELP_SECTIONS.map((s) => ({ ...s, articles: s.articles.filter((a) => hit(a, s)) })).filter((s) => s.articles.length > 0)
  }, [q])

  const total = useMemo(() => HELP_SECTIONS.reduce((n, s) => n + s.articles.length, 0), [])
  const shown = sections.reduce((n, s) => n + s.articles.length, 0)

  const goTo = useCallback((id: string, opts?: { expand?: boolean }) => {
    setQuery('')
    if (opts?.expand !== false && HELP_SECTIONS.some((s) => s.articles.some((a) => a.id === id))) {
      setOpen((prev) => new Set(prev).add(id))
    }
    setHash(id)
    // po wyrenderowaniu (filtr mógł ukrywać element)
    window.setTimeout(() => document.getElementById(`pomoc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }, [])

  // Wejście z linku (#pomoc/<id>) i zmiana adresu w otwartej zakładce.
  useEffect(() => {
    const apply = () => {
      const id = idFromHash()
      if (id) goTo(id)
    }
    if (idFromHash()) apply()
    else setHash(null)
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [goTo])

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setHash(null)
      } else {
        next.add(id)
        setHash(id)
      }
      return next
    })
  }

  function copyLink(id: string) {
    const url = `${window.location.origin}${window.location.pathname}${HELP_HASH}/${id}`
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(id)
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000)
    })
  }

  const allOpen = shown > 0 && sections.every((s) => s.articles.every((a) => open.has(a.id)))
  function toggleAll() {
    setOpen(allOpen ? new Set() : new Set(HELP_SECTIONS.flatMap((s) => s.articles.map((a) => a.id))))
  }

  const updated = new Date(`${HELP_UPDATED}T12:00:00`).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })

  const toc = (
    <nav aria-label="Spis treści" className="flex flex-col gap-3">
      {HELP_SECTIONS.map((s) => (
        <div key={s.id} className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => goTo(s.id, { expand: false })}
            className="text-left text-sm font-bold px-2 py-1 rounded-[8px] hover:bg-[var(--surface-2)]"
            style={{ color: 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {s.title}
          </button>
          {s.articles.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => goTo(a.id)}
              className="text-left text-xs px-2 py-1 rounded-[8px] hover:bg-[var(--surface-2)]"
              style={{ color: open.has(a.id) ? 'var(--brand)' : 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1.35 }}
            >
              {a.title}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 1100 }}>
      <style>{PRINT_CSS}</style>

      {/* Pasek narzędzi */}
      <div className="flex flex-col gap-3">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Instrukcje dla administratora serwisu. Ostatnia aktualizacja: <strong style={{ color: 'var(--ink)' }}>{updated}</strong>
          {' · '}
          {total} instrukcji
        </p>
        <div className="help-noprint flex items-center gap-2 flex-wrap">
          <div
            className="flex items-center gap-2 rounded-[10px] border px-3 flex-1"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', minWidth: 200, maxWidth: 460, height: 40 }}
          >
            <Search size={15} style={{ color: 'var(--faint)', flexShrink: 0 }} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Szukaj"
              aria-label="Szukaj w instrukcjach"
              className="flex-1 min-w-0 text-sm bg-transparent outline-none"
              style={{ color: 'var(--ink)' }}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Wyczyść" style={{ background: 'none', border: 'none', color: 'var(--faint)', cursor: 'pointer', padding: 4 }}>
                <X size={15} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-[10px] border px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)', height: 40, cursor: 'pointer' }}
          >
            {allOpen ? 'Zwiń wszystkie' : 'Rozwiń wszystkie'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-[10px] border px-3 text-sm font-medium hover:bg-[var(--surface-2)]"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)', height: 40, cursor: 'pointer' }}
          >
            <Printer size={15} /> Drukuj
          </button>
        </div>
        {q && (
          <p className="help-noprint text-xs" style={{ color: 'var(--faint)' }}>
            {shown === 0 ? 'Nic nie znaleziono. Spróbuj innego słowa.' : `Pasujące instrukcje: ${shown} z ${total}`}
          </p>
        )}
      </div>

      <div className="help-grid grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)] items-start">
        {/* Spis treści: na wąskim ekranie zwijany, na szerokim przyklejony z lewej */}
        <details className="help-noprint lg:hidden rounded-[12px] border px-3 py-2" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <summary className="text-sm font-semibold cursor-pointer" style={{ color: 'var(--ink)' }}>
            Spis treści
          </summary>
          <div className="pt-3">{toc}</div>
        </details>
        <div
          className="help-noprint hidden lg:block rounded-[15px] border p-3 sticky"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', top: 0, maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' }}
        >
          <p className="px-2 pb-2 font-semibold tracking-widest uppercase" style={{ fontSize: 11, color: 'var(--faint)' }}>
            Spis treści
          </p>
          {toc}
        </div>

        {/* Instrukcje */}
        <div className="flex flex-col gap-7 min-w-0">
          {sections.map((s) => (
            <section key={s.id} id={`pomoc-${s.id}`} className="flex flex-col gap-2.5" style={{ scrollMarginTop: 12 }}>
              <div className="help-section-title">
                <h2 className="font-bold" style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: 22, color: 'var(--ink)' }}>
                  {s.title}
                </h2>
                {s.intro && (
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    {s.intro}
                  </p>
                )}
              </div>
              {s.articles.map((a) => {
                const isOpen = open.has(a.id) || !!q
                return (
                  <article
                    key={a.id}
                    id={`pomoc-${a.id}`}
                    className="help-article rounded-[15px] border overflow-hidden"
                    style={{ background: 'var(--surface)', borderColor: isOpen ? 'var(--brand)' : 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', scrollMarginTop: 12 }}
                  >
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`pomoc-tresc-${a.id}`}
                        onClick={() => toggle(a.id)}
                        className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left"
                        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        <ChevronDown
                          size={17}
                          className="help-noprint"
                          style={{ color: 'var(--faint)', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
                        />
                        <h3 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                          {a.title}
                        </h3>
                      </button>
                      <button
                        type="button"
                        onClick={() => copyLink(a.id)}
                        title="Kopiuj link do tej instrukcji"
                        aria-label={`Kopiuj link do instrukcji: ${a.title}`}
                        className="help-noprint inline-flex items-center gap-1 px-3 text-xs"
                        style={{ background: 'none', border: 'none', color: copied === a.id ? 'var(--ok)' : 'var(--faint)', cursor: 'pointer', flexShrink: 0 }}
                      >
                        <Link2 size={14} />
                        {copied === a.id ? 'Skopiowano' : ''}
                      </button>
                    </div>
                    <div
                      id={`pomoc-tresc-${a.id}`}
                      className={`help-body flex-col gap-3 px-4 pb-4 pt-1 ${isOpen ? 'flex' : 'hidden'}`}
                      style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}
                    >
                      {a.blocks.map((b, i) => (
                        <Block key={i} block={b} />
                      ))}
                    </div>
                  </article>
                )
              })}
            </section>
          ))}
          {sections.length === 0 && (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--faint)' }}>
              Brak instrukcji pasujących do „{query.trim()}”.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
