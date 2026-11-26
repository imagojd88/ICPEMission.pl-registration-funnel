import { useMemo, useState } from 'react'
import { Copy, Download, Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import {
  summarizeDiets, dietSummaryText, eventAddons, addonReport, addonLabel,
  type PricingConfig, type RegistrationDto,
} from '@icpe/shared'
import { buildCsv, copyText, csvDateTime, downloadCsv, registrationStatusLabel, registrationsCsvFilename } from '@/lib/registrationsExport'

/**
 * Panel ▸ Zgłoszenia ▸ „Diety i dodatki”: zestawienie dla ośrodka.
 *  - liczba OSÓB (nie zgłoszeń) na każdej diecie i bez diety, w rozbiciu na grupy wiekowe z cennika eventu,
 *    z sumą kontrolną = liczba osób w aktywnych zgłoszeniach (bez anulowanych i listy rezerwowej),
 *  - lista imienna osób z dietą / wpisem ręcznym (alergie) i uwagi do całych zgłoszeń,
 *  - tabela „Dodatki z limitem”: zamówiono / limit, zgłoszenia w kolejności zamówienia.
 * Liczy w przeglądarce z listy zgłoszeń, którą ekran już ma (funkcje czyste w `shared/src/diets.ts`, `addons.ts`).
 */
export default function DietSummaryPanel({
  regs,
  pricingConfig,
  eventTitle,
  startsAt,
  endsAt,
  location,
  onOpen,
}: {
  regs: RegistrationDto[]
  pricingConfig: PricingConfig
  eventTitle: string
  startsAt?: string
  endsAt?: string
  location?: string | null
  onOpen: (r: RegistrationDto) => void
}) {
  const [copied, setCopied] = useState<boolean | null>(null)
  const nameOf = (r: RegistrationDto) => `${r.contact.firstName ?? ''} ${r.contact.lastName ?? ''}`.trim()

  const summary = useMemo(
    () => summarizeDiets(
      regs.map((r) => ({ id: r.id, status: r.status, registrant: nameOf(r), dietaryNotes: r.dietaryNotes, participants: r.participants })),
      pricingConfig.childBrackets,
    ),
    [regs, pricingConfig.childBrackets],
  )
  const addonDefs = useMemo(() => eventAddons(pricingConfig), [pricingConfig])
  const addons = useMemo(
    () => addonReport(addonDefs, regs.map((r) => ({ id: r.id, status: r.status, registrant: nameOf(r), createdAt: r.createdAt, options: r.options }))),
    [addonDefs, regs],
  )

  const day = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }
  const dates = startsAt ? (endsAt && day(endsAt) !== day(startsAt) ? `${day(startsAt)} – ${day(endsAt)}` : day(startsAt)) : ''
  const asOf = new Date().toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  function summaryText(): string {
    let text = dietSummaryText(summary, { eventTitle, dates, place: location ?? undefined, asOf })
    const ordered = addons.filter((a) => a.ordered > 0)
    if (ordered.length) {
      text += `\n\nDodatki:\n${ordered.map((a) => `- ${a.name}: ${a.ordered}${a.limit ? ` (limit ${a.limit})` : ''}`).join('\n')}`
    }
    return text
  }

  async function handleCopy() {
    setCopied(await copyText(summaryText()))
    window.setTimeout(() => setCopied(null), 4000)
  }

  function handleCsv() {
    const g = summary.groups
    const rows: unknown[][] = [
      ['Zestawienie diet', eventTitle],
      ['Termin', dates],
      ['Stan na dzień', asOf],
      [],
      ['Dieta', 'Nazwa wg ośrodka', ...g.map((x) => x.label), 'Razem'],
      ...summary.rows.map((r) => [r.label, r.kitchen, ...g.map((x) => r.counts[x.id] ?? 0), r.total]),
      ['Suma (osoby w aktywnych zgłoszeniach)', '', ...g.map((x) => summary.totals[x.id] ?? 0), summary.people],
      [],
      ['Lista imienna'],
      ['Osoba', 'Grupa wiekowa', 'Wiek dziecka', 'Dieta', 'Alergie / wpis uczestnika', 'Zgłaszający', 'Nr zgłoszenia', 'Uwagi do zgłoszenia'],
      ...summary.persons.map((p) => [p.person, p.groupLabel, p.age ?? '', p.diets, p.note, p.registrant, p.registrationId, p.registrationNote]),
      [],
      ['Uwagi do całych zgłoszeń'],
      ['Zgłaszający', 'Nr zgłoszenia', 'Uwagi'],
      ...summary.registrationNotes.map((n) => [n.registrant, n.registrationId, n.note]),
    ]
    if (addons.length) {
      rows.push([], ['Dodatki z limitem'], ['Dodatek', 'Zamówiono', 'Limit', 'Zgłaszający', 'Nr zgłoszenia', 'Sztuk', 'Zamówiono dnia', 'Status zgłoszenia', 'W limicie'])
      for (const a of addons) {
        if (!a.orders.length) rows.push([a.name, a.ordered, a.limit || 'bez limitu'])
        for (const o of a.orders) {
          rows.push([a.name, a.ordered, a.limit || 'bez limitu', o.registrant, o.registrationId, o.qty, csvDateTime(o.orderedAt), registrationStatusLabel(o.status), o.inactive ? 'nie zajmuje' : o.withinLimit ? 'tak' : 'PONAD LIMIT'])
        }
      }
    }
    downloadCsv(registrationsCsvFilename(eventTitle, new Date(), 'diety'), buildCsv(rows))
  }

  const th = 'text-left text-xs font-semibold uppercase tracking-wider px-3 py-2'
  const td = 'px-3 py-2 text-sm'
  const num = `${td} text-right tabular-nums`
  const byId = new Map(regs.map((r) => [r.id, r]))
  const openLink = (id: string, label: string) => {
    const r = byId.get(id)
    return r ? (
      <button type="button" onClick={() => onOpen(r)} className="text-left underline" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--brand)', cursor: 'pointer' }}>
        {label || id}
      </button>
    ) : <>{label || id}</>
  }

  return (
    <div className="rounded-[16px] border p-4 flex flex-col gap-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1" style={{ minWidth: 260 }}>
          <p className="text-base font-semibold" style={{ color: 'var(--ink)' }}>Diety i dodatki — zestawienie dla ośrodka</p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            Liczone są osoby z aktywnych zgłoszeń (bez anulowanych i listy rezerwowej): {summary.people} os. w {summary.registrations} zgłoszeniach.
            Ośrodek potrzebuje tych liczb na 1–2 tygodnie przed pobytem. Stan na: {asOf}.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { void handleCopy() }}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Skopiowano' : copied === false ? 'Nie udało się skopiować' : 'Kopiuj podsumowanie'}
        </Button>
        <Button size="sm" variant="outline" onClick={handleCsv}>
          <Download size={14} /> Eksport CSV
        </Button>
      </div>

      {/* Liczby */}
      <div className="overflow-x-auto rounded-[12px] border" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', color: 'var(--faint)' }}>
              <th className={th}>Dieta</th>
              {summary.groups.map((g) => <th key={g.id} className={`${th} text-right`}>{g.label}</th>)}
              <th className={`${th} text-right`}>Razem</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((r) => (
              <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className={td} style={{ color: 'var(--ink)' }}>
                  {r.label}
                  {r.kitchen && <span className="text-xs" style={{ color: 'var(--faint)' }}> · w ośrodku: {r.kitchen}</span>}
                </td>
                {summary.groups.map((g) => <td key={g.id} className={num} style={{ color: 'var(--ink)' }}>{r.counts[g.id] ?? 0}</td>)}
                <td className={`${num} font-semibold`} style={{ color: 'var(--ink)' }}>{r.total}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--surface-2)' }}>
              <td className={`${td} font-semibold`} style={{ color: 'var(--ink)' }}>Suma kontrolna (osoby w aktywnych zgłoszeniach)</td>
              {summary.groups.map((g) => <td key={g.id} className={`${num} font-semibold`} style={{ color: 'var(--ink)' }}>{summary.totals[g.id] ?? 0}</td>)}
              <td className={`${num} font-semibold`} style={{ color: 'var(--ink)' }}>{summary.people}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs -mt-3" style={{ color: 'var(--faint)' }}>
        Osoba z kilkoma dietami jest w jednym wierszu łączonym (np. „Bez glutenu + Bez mleka”), dlatego suma wierszy równa się liczbie osób.
        Wcześniejsza nazwa „Bez laktozy” liczy się do diety „Bez mleka”. Wpis ręczny (alergie) nie jest dietą z listy — takie osoby są w wierszu „Standard” i na liście imiennej niżej.
      </p>

      {/* Lista imienna */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>
          Lista imienna: osoby z dietą lub wpisem o alergiach ({summary.persons.length})
        </p>
        {summary.persons.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Nikt nie zaznaczył diety ani nie wpisał alergii.</p>
        ) : (
          <div className="overflow-x-auto rounded-[12px] border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', color: 'var(--faint)' }}>
                  <th className={th}>Osoba</th>
                  <th className={th}>Dieta</th>
                  <th className={th}>Alergie / wpis uczestnika</th>
                  <th className={th}>Zgłaszający</th>
                </tr>
              </thead>
              <tbody>
                {summary.persons.map((p, i) => (
                  <tr key={`${p.registrationId}-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                    <td className={td} style={{ color: 'var(--ink)' }}>
                      {p.person || '—'}
                      {p.age !== null && <span className="text-xs" style={{ color: 'var(--faint)' }}> · dziecko, {p.age} l.</span>}
                    </td>
                    <td className={td} style={{ color: 'var(--ink)' }}>{p.diets || '—'}</td>
                    <td className={td} style={{ color: p.note ? 'var(--ink)' : 'var(--faint)', overflowWrap: 'anywhere' }}>{p.note || '—'}</td>
                    <td className={td}>{openLink(p.registrationId, p.registrant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {summary.registrationNotes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>
            Uwagi wpisane do całego zgłoszenia ({summary.registrationNotes.length})
          </p>
          <p className="text-xs -mt-1" style={{ color: 'var(--faint)' }}>
            Pole „Alergie i nietolerancje” oraz „Dodatkowe uwagi” z formularza — przeczytaj je, bo nie da się ich policzyć. Do skopiowanego podsumowania trafia tylko część o jedzeniu (bez wierszy „Uwagi:”) i bez nazwisk.
          </p>
          <ul className="flex flex-col gap-1.5">
            {summary.registrationNotes.map((n) => (
              <li key={n.registrationId} className="text-sm rounded-[10px] px-3 py-2" style={{ background: 'var(--surface-2)', color: 'var(--ink)', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                {openLink(n.registrationId, n.registrant)}: {n.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dodatki z limitem */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Dodatki z limitem</p>
        {addons.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Ten event nie ma dodatków. Dodasz je w „Edytuj event” ▸ Cennik ▸ „Dodatki z limitem” (np. dostawka, łóżeczko turystyczne).
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {addons.map((a) => {
              const over = a.limit > 0 && a.ordered > a.limit
              return (
                <div key={a.id} className="rounded-[12px] border" style={{ borderColor: over ? 'var(--err)' : 'var(--border)' }}>
                  <div className="flex items-center justify-between gap-3 px-3 py-2" style={{ background: 'var(--surface-2)', borderRadius: '12px 12px 0 0' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{addonLabel(addonDefs.find((d) => d.id === a.id)?.name ?? a.name, 'pl')}</span>
                    <span className="text-sm font-semibold tabular-nums" style={{ color: over ? 'var(--err)' : 'var(--ink)' }}>
                      zamówiono {a.ordered}{a.limit ? ` / ${a.limit}` : ' (bez limitu)'}{a.left !== null ? ` · zostało ${a.left}` : ''}{over ? ' · LIMIT PRZEKROCZONY' : ''}
                    </span>
                  </div>
                  {a.orders.length === 0 ? (
                    <p className="text-sm px-3 py-2" style={{ color: 'var(--muted)' }}>Brak zamówień.</p>
                  ) : (
                    <ol className="flex flex-col">
                      {a.orders.map((o, i) => (
                        <li key={o.registrationId} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm" style={{ borderTop: '1px solid var(--border)', opacity: o.inactive ? 0.55 : 1 }}>
                          <span style={{ color: 'var(--ink)' }}>
                            <span className="tabular-nums" style={{ color: 'var(--faint)' }}>{o.inactive ? '–' : `${i + 1}.`}</span>{' '}
                            {openLink(o.registrationId, o.registrant)}{o.qty > 1 ? ` × ${o.qty}` : ''}
                          </span>
                          <span className="text-xs text-right" style={{ color: o.inactive ? 'var(--faint)' : o.withinLimit ? 'var(--muted)' : 'var(--err)' }}>
                            {csvDateTime(o.orderedAt)} · {registrationStatusLabel(o.status)}
                            {o.inactive ? ' · nie zajmuje sztuk' : o.withinLimit ? '' : ' · ponad limit'}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )
            })}
            <p className="text-xs" style={{ color: 'var(--faint)' }}>
              Kolejność = chwila zamówienia dodatku. Sztuki zajmują zgłoszenia aktywne; anulowanie zgłoszenia zwalnia je od razu, lista rezerwowa ich nie zajmuje.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
