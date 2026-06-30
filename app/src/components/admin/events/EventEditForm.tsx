import { useState, useEffect, type ChangeEvent } from 'react'
import { Plus, Trash2, Upload, Images } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import ImageGalleryPicker from '@/components/admin/ImageGalleryPicker'
import {
  getEventEditConfig,
  updateEventInstance,
  configureSeriesPage,
  uploadImage,
  listPlaces,
  createPlace,
  type EventEditConfig,
  type Place,
} from '@/lib/api'
import { DEFAULT_PRICING } from '@icpe/shared'
import type { PricingConfig } from '@icpe/shared'

interface EditTarget {
  instanceId: string
  seriesId: string
  slug: string
}

type PricingModel = 'os/noc' | 'za pokój' | 'za osobę' | 'dopłata 1-os'

interface RoomRow {
  id: string
  name: string
  model: PricingModel
  capacity: string
  price: string
  tag: string
}
interface BracketRow { id: string; ltAge: string; multiplier: string }
interface DiscountRow { id: string; code: string; pct: string }

const COLOR_OPTIONS = [
  { hex: '#1C5D99', label: 'Niebieski' },
  { hex: '#C56A3A', label: 'Bursztyn' },
  { hex: '#3E7D5A', label: 'Leśna' },
  { hex: '#7B52A8', label: 'Fiolet' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[15px] border overflow-hidden"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
    >
      <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{title}</p>
      </div>
      <div className="px-5 py-4 flex flex-col gap-4">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>{label}</span>
      {children}
    </label>
  )
}

export default function EventEditForm({
  editTarget,
  onCancel,
  onSaved,
}: {
  editTarget: EditTarget
  onCancel: () => void
  onSaved: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Pola
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [nights, setNights] = useState('1')
  const [location, setLocation] = useState('')
  const [capacity, setCapacity] = useState('')
  const [payOnline, setPayOnline] = useState(false)
  const [payTransfer, setPayTransfer] = useState(false)
  const [payCash, setPayCash] = useState(false)
  const [isFree, setIsFree] = useState(false)
  const [formationFee, setFormationFee] = useState(String(DEFAULT_PRICING.formationFee))
  const [mealsFee, setMealsFee] = useState(String(DEFAULT_PRICING.mealsFee))
  const [transport, setTransport] = useState(String(DEFAULT_PRICING.options.transport))
  const [bedding, setBedding] = useState(String(DEFAULT_PRICING.options.bedding))
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [brackets, setBrackets] = useState<BracketRow[]>([])
  const [discounts, setDiscounts] = useState<DiscountRow[]>([])
  const [slug, setSlug] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#1C5D99')
  const [titleColor, setTitleColor] = useState('#FFFFFF')
  const [heroImageUrl, setHeroImageUrl] = useState('')
  const [uploadingHero, setUploadingHero] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [bankRecipient, setBankRecipient] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [badge, setBadge] = useState('')
  const [supertitle, setSupertitle] = useState('')
  const [places, setPlaces] = useState<Place[]>([])

  useEffect(() => {
    listPlaces().then(setPlaces).catch(() => {})
  }, [])

  async function handleSavePlace() {
    const v = location.trim()
    if (!v) return
    try {
      const p = await createPlace(v)
      setPlaces((prev) =>
        prev.some((x) => x.id === p.id)
          ? prev
          : [...prev, p].sort((a, b) => a.label.localeCompare(b.label)),
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  const [langPL, setLangPL] = useState(true)
  const [langEN, setLangEN] = useState(false)
  const [langIT, setLangIT] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getEventEditConfig(editTarget.slug)
      .then((cfg: EventEditConfig) => {
        if (cancelled) return
        const pc = cfg.pricingConfig
        setName(cfg.title?.pl ?? '')
        setDescription(cfg.description?.pl ?? '')
        setDateStart(cfg.startsAt ? cfg.startsAt.slice(0, 10) : '')
        setDateEnd(cfg.endsAt ? cfg.endsAt.slice(0, 10) : '')
        setNights(String(cfg.nights ?? 1))
        setLocation(cfg.location ?? '')
        setCapacity(cfg.capacity != null ? String(cfg.capacity) : '')
        const pm = cfg.paymentMethods ?? []
        setPayOnline(pm.includes('ONLINE'))
        setPayTransfer(pm.includes('BANK_TRANSFER'))
        setPayCash(pm.includes('CASH'))
        setIsFree(!!pc?.free)
        setFormationFee(String(pc?.formationFee ?? DEFAULT_PRICING.formationFee))
        setMealsFee(String(pc?.mealsFee ?? DEFAULT_PRICING.mealsFee))
        setTransport(String(pc?.options?.transport ?? DEFAULT_PRICING.options.transport))
        setBedding(String(pc?.options?.bedding ?? DEFAULT_PRICING.options.bedding))
        setRooms(
          (pc?.rooms ?? []).map((r, i) => ({
            id: `r-${i}`,
            name: r.name,
            model: (r.model as PricingModel) || 'os/noc',
            capacity: String(r.cap ?? 1),
            price: String(r.perPerson ?? 0),
            tag: r.tag || '',
          })),
        )
        setBrackets(
          (pc?.childBrackets ?? []).map((b, i) => ({
            id: `b-${i}`,
            ltAge: String(b.ltAge),
            multiplier: String(b.multiplier),
          })),
        )
        setDiscounts(
          Object.entries(pc?.discountCodes ?? {}).map(([code, frac], i) => ({
            id: `d-${i}`,
            code,
            pct: String(Math.round((frac as number) * 100)),
          })),
        )
        setSlug(editTarget.slug)
        setPrimaryColor(cfg.theme?.primaryColor ?? '#1C5D99')
        setTitleColor(cfg.theme?.titleColor ?? '#FFFFFF')
        setHeroImageUrl(cfg.theme?.heroImageUrl ?? '')
        setBankRecipient(cfg.paymentInfo?.recipient ?? '')
        setBankAccount(cfg.paymentInfo?.account ?? '')
        setBadge(cfg.theme?.badge || 'ICPE Mission Polska')
        setSupertitle(cfg.theme?.supertitle ?? '')
        const loc = cfg.locales ?? ['pl']
        setLangPL(loc.includes('pl'))
        setLangEN(loc.includes('en'))
        setLangIT(loc.includes('it'))
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [editTarget.slug])

  async function handleHeroUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingHero(true)
    setError(null)
    try {
      const url = await uploadImage(file)
      setHeroImageUrl(url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploadingHero(false)
    }
  }

  function buildPricing(): PricingConfig {
    const n = parseInt(nights) || 0
    return {
      free: isFree,
      formationFee: parseFloat(formationFee) || 0,
      mealsFee: parseFloat(mealsFee) || 0,
      nights: n,
      childBrackets: brackets
        .map((b) => ({ ltAge: parseInt(b.ltAge) || 0, multiplier: parseFloat(b.multiplier) || 0 }))
        .sort((a, b) => a.ltAge - b.ltAge),
      rooms: rooms.map((r, i) => ({
        id: String(i + 1),
        name: r.name,
        cap: parseInt(r.capacity) || 1,
        perPerson: parseFloat(r.price) || 0,
        model: r.model,
        tag: r.tag || '',
      })),
      options: { transport: parseFloat(transport) || 0, bedding: parseFloat(bedding) || 0 },
      discountCodes: Object.fromEntries(
        discounts
          .filter((d) => d.code.trim())
          .map((d) => [d.code.trim(), (parseFloat(d.pct) || 0) / 100]),
      ),
    }
  }

  async function handleSave() {
    if (!name) { setError('Podaj nazwę eventu.'); return }
    if (!slug) { setError('Podaj slug (adres strony).'); return }
    if (!dateStart) { setError('Podaj datę rozpoczęcia.'); return }
    setSaving(true)
    setError(null)
    try {
      const n = parseInt(nights) || 0
      const paymentMethods: string[] = []
      if (payOnline) paymentMethods.push('ONLINE')
      if (payTransfer) paymentMethods.push('BANK_TRANSFER')
      if (payCash) paymentMethods.push('CASH')
      const startsAt = new Date(`${dateStart}T14:00:00`).toISOString()
      const endsAt = dateEnd
        ? new Date(`${dateEnd}T22:00:00`).toISOString()
        : new Date(new Date(`${dateStart}T14:00:00`).getTime() + n * 86400000 + 8 * 3600000).toISOString()

      await updateEventInstance(editTarget.instanceId, {
        title: { pl: name },
        description: description.trim() ? { pl: description } : null,
        startsAt,
        endsAt,
        location: location || null,
        nights: n,
        capacity: capacity ? parseInt(capacity) : null,
        paymentMethods,
        pricingConfig: buildPricing(),
      })

      const locales: string[] = []
      if (langPL) locales.push('pl')
      if (langEN) locales.push('en')
      if (langIT) locales.push('it')
      if (locales.length === 0) locales.push('pl')
      const theme: Record<string, string> = { primaryColor }
      if (heroImageUrl) theme.heroImageUrl = heroImageUrl
      if (titleColor) theme.titleColor = titleColor
      theme.badge = badge
      theme.supertitle = supertitle.trim()

      await configureSeriesPage(editTarget.seriesId, {
        slug,
        theme,
        enabledFields: { phone: true, address: true, dietary: true, children: true },
        paymentInfo: { recipient: bankRecipient.trim(), account: bankAccount.trim() },
        locales,
        isEvergreen: false,
      })
      setDone(true)
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'rounded-[12px] border px-3 py-2 text-sm w-full'
  const inputStyle = { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--ink)' } as const

  if (loading) {
    return (
      <div className="rounded-[20px] border px-6 py-16 text-center" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--faint)' }}>Wczytywanie ustawień eventu…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 760 }}>
      {error && (
        <div className="px-4 py-3 rounded-[12px] text-sm" style={{ background: 'var(--err-soft)', color: 'var(--err)', border: '1px solid var(--err)' }}>
          {error}
        </div>
      )}
      {done && (
        <div className="px-4 py-3 rounded-[12px] text-sm" style={{ background: 'var(--ok-soft, #e8f5e9)', color: 'var(--ok)', border: '1px solid var(--ok)' }}>
          Zapisano zmiany. <a href={`https://rejestracja.icpemission.pl/r/${slug}`} target="_blank" rel="noreferrer" className="underline">Otwórz stronę</a>
        </div>
      )}

      <Section title="Szczegóły">
        <Field label="Nazwa eventu">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="np. Dzień Formacji Wspólnoty" />
        </Field>
        <Field label="Opis (pokazywany na stronie zapisów)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Krótki opis wydarzenia — np. zaproszenie, program, miejsce…"
            className={inputCls}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data rozpoczęcia">
            <input type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Data zakończenia">
            <input type="date" value={dateEnd} min={dateStart || undefined} onChange={(e) => setDateEnd(e.target.value)} className={inputCls} style={inputStyle} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Liczba nocy">
            <Input value={nights} onChange={(e) => setNights(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Limit miejsc (puste = bez limitu)">
            <Input value={capacity} onChange={(e) => setCapacity(e.target.value)} inputMode="numeric" placeholder="—" />
          </Field>
        </div>
        <Field label="Lokalizacja">
          <div className="flex flex-col gap-2">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Centrum…, ul. …, miasto" />
            <div className="flex items-center gap-2 flex-wrap">
              {places.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) setLocation(e.target.value) }}
                  className={inputCls}
                  style={{ ...inputStyle, maxWidth: 340 }}
                >
                  <option value="">— wybierz zapisane miejsce —</option>
                  {places.map((p) => (
                    <option key={p.id} value={p.label}>{p.label}</option>
                  ))}
                </select>
              )}
              <Button size="sm" variant="outline" onClick={() => { void handleSavePlace() }} disabled={!location.trim()}>
                Zapisz to miejsce
              </Button>
            </div>
          </div>
        </Field>
      </Section>

      <Section title="Metody płatności">
        <label className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--ink)' }}>
          <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} className="accent-[var(--brand)] w-4 h-4" />
          Bezpłatne — bez opłat (ukrywa ceny i pomija krok płatności)
        </label>
        {!isFree && (
          <div className="flex flex-col gap-2">
            {[
              { v: payCash, set: setPayCash, label: 'Gotówka (na miejscu)' },
              { v: payTransfer, set: setPayTransfer, label: 'Przelew bankowy' },
              { v: payOnline, set: setPayOnline, label: 'Płatność online' },
            ].map((p) => (
              <label key={p.label} className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                <input type="checkbox" checked={p.v} onChange={(e) => p.set(e.target.checked)} className="accent-[var(--brand)] w-4 h-4" />
                {p.label}
              </label>
            ))}
          </div>
        )}
      </Section>

      <Section title="Cennik">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opłata formacyjna (zł)"><Input value={formationFee} onChange={(e) => setFormationFee(e.target.value)} inputMode="numeric" /></Field>
          <Field label="Wyżywienie / doba (zł)"><Input value={mealsFee} onChange={(e) => setMealsFee(e.target.value)} inputMode="numeric" /></Field>
          <Field label="Transport (zł)"><Input value={transport} onChange={(e) => setTransport(e.target.value)} inputMode="numeric" /></Field>
          <Field label="Pościel / os (zł)"><Input value={bedding} onChange={(e) => setBedding(e.target.value)} inputMode="numeric" /></Field>
        </div>

        {/* Pokoje */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Pokoje</span>
          {rooms.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <Input value={r.name} onChange={(e) => setRooms((p) => p.map((x) => x.id === r.id ? { ...x, name: e.target.value } : x))} placeholder="Nazwa" />
              <input value={r.capacity} onChange={(e) => setRooms((p) => p.map((x) => x.id === r.id ? { ...x, capacity: e.target.value } : x))} placeholder="os." inputMode="numeric" className={inputCls} style={{ ...inputStyle, width: 70 }} />
              <input value={r.price} onChange={(e) => setRooms((p) => p.map((x) => x.id === r.id ? { ...x, price: e.target.value } : x))} placeholder="zł/os" inputMode="numeric" className={inputCls} style={{ ...inputStyle, width: 90 }} />
              <button onClick={() => setRooms((p) => p.filter((x) => x.id !== r.id))} className="p-2 rounded-[8px]" style={{ color: 'var(--err)' }}><Trash2 size={15} /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setRooms((p) => [...p, { id: `r-new-${Date.now()}`, name: '', model: 'os/noc', capacity: '2', price: '80', tag: '' }])}>
            <Plus size={14} /> Dodaj pokój
          </Button>
        </div>

        {/* Progi wiekowe */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Zniżki wiekowe (dzieci)</span>
          {brackets.map((b) => (
            <div key={b.id} className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
              <span>do</span>
              <input value={b.ltAge} onChange={(e) => setBrackets((p) => p.map((x) => x.id === b.id ? { ...x, ltAge: e.target.value } : x))} inputMode="numeric" className={inputCls} style={{ ...inputStyle, width: 70 }} />
              <span>lat → mnożnik</span>
              <input value={b.multiplier} onChange={(e) => setBrackets((p) => p.map((x) => x.id === b.id ? { ...x, multiplier: e.target.value } : x))} inputMode="decimal" className={inputCls} style={{ ...inputStyle, width: 80 }} />
              <button onClick={() => setBrackets((p) => p.filter((x) => x.id !== b.id))} className="p-2 rounded-[8px]" style={{ color: 'var(--err)' }}><Trash2 size={15} /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setBrackets((p) => [...p, { id: `b-new-${Date.now()}`, ltAge: '18', multiplier: '0.9' }])}>
            <Plus size={14} /> Dodaj próg
          </Button>
        </div>

        {/* Kody rabatowe */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Kody rabatowe</span>
          {discounts.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-sm">
              <input value={d.code} onChange={(e) => setDiscounts((p) => p.map((x) => x.id === d.id ? { ...x, code: e.target.value } : x))} placeholder="KOD" className={inputCls} style={{ ...inputStyle, width: 140 }} />
              <input value={d.pct} onChange={(e) => setDiscounts((p) => p.map((x) => x.id === d.id ? { ...x, pct: e.target.value } : x))} placeholder="%" inputMode="numeric" className={inputCls} style={{ ...inputStyle, width: 70 }} />
              <span style={{ color: 'var(--faint)' }}>%</span>
              <button onClick={() => setDiscounts((p) => p.filter((x) => x.id !== d.id))} className="p-2 rounded-[8px]" style={{ color: 'var(--err)' }}><Trash2 size={15} /></button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setDiscounts((p) => [...p, { id: `d-new-${Date.now()}`, code: '', pct: '10' }])}>
            <Plus size={14} /> Dodaj kod
          </Button>
        </div>
      </Section>

      <Section title="Strona">
        <Field label="Slug (adres: /r/…)">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="np. dzien-formacji-2026" />
        </Field>
        <Field label="Tag / kategoria (pigułka u góry strony)">
          <select value={badge} onChange={(e) => setBadge(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="ICPE Mission">ICPE Mission</option>
            <option value="ICPE Mission Polska">ICPE Mission Polska</option>
            <option value="ICPE Mission Warszawa">ICPE Mission Warszawa</option>
          </select>
        </Field>
        <Field label="Nadtytuł (nad nazwą eventu)">
          <Input value={supertitle} onChange={(e) => setSupertitle(e.target.value)} placeholder="np. Wyjazd formacyjny" />
        </Field>
        <Field label="Kolor główny">
          <div className="flex items-center gap-2">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c.hex}
                onClick={() => setPrimaryColor(c.hex)}
                title={c.label}
                className="rounded-full"
                style={{ width: 28, height: 28, background: c.hex, outline: primaryColor === c.hex ? '2px solid var(--ink)' : 'none', outlineOffset: 2 }}
              />
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3 items-end">
          <Field label="Kolor tytułu">
            <input type="color" value={titleColor} onChange={(e) => setTitleColor(e.target.value)} className="w-full h-10 rounded-[10px] border" style={{ borderColor: 'var(--border)' }} />
          </Field>
          <Field label="Zdjęcie w tle (URL lub upload)">
            <div className="flex items-center gap-2">
              <Input value={heroImageUrl} onChange={(e) => setHeroImageUrl(e.target.value)} placeholder="https://…" />
              <label className="flex items-center gap-1 px-3 py-2 rounded-[10px] text-sm cursor-pointer shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                <Upload size={14} /> {uploadingHero ? '…' : 'Wgraj'}
                <input type="file" accept="image/*" className="hidden" onChange={handleHeroUpload} />
              </label>
              <button
                type="button"
                onClick={() => setShowGallery(true)}
                className="flex items-center gap-1 px-3 py-2 rounded-[10px] text-sm shrink-0"
                style={{ background: 'var(--surface-2)', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                <Images size={14} /> Galeria
              </button>
            </div>
          </Field>
        </div>
        <Field label="Języki strony">
          <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--ink)' }}>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={langPL} onChange={(e) => setLangPL(e.target.checked)} className="accent-[var(--brand)] w-4 h-4" /> PL</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={langEN} onChange={(e) => setLangEN(e.target.checked)} className="accent-[var(--brand)] w-4 h-4" /> EN</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={langIT} onChange={(e) => setLangIT(e.target.checked)} className="accent-[var(--brand)] w-4 h-4" /> IT</label>
          </div>
        </Field>
      </Section>

      <Section title="Dane do przelewu">
        <Field label="Odbiorca">
          <Input value={bankRecipient} onChange={(e) => setBankRecipient(e.target.value)} placeholder="np. ICPE Mission Polska" />
        </Field>
        <Field label="Numer konta (IBAN)">
          <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="PL00 0000 0000 0000 0000 0000 0000" />
        </Field>
        <p className="text-xs" style={{ color: 'var(--faint)' }}>
          Pokazywane na stronie zapisów przy płatności przelewem. Tytuł przelewu (numer zgłoszenia) tworzy się automatycznie.
        </p>
      </Section>

      <div className="flex items-center gap-3 pb-4">
        <Button onClick={() => { void handleSave() }} disabled={saving}>
          {saving ? 'Zapisuję…' : 'Zapisz zmiany'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>Anuluj</Button>
      </div>

      {showGallery && (
        <ImageGalleryPicker
          onSelect={(url) => setHeroImageUrl(url)}
          onClose={() => setShowGallery(false)}
        />
      )}
    </div>
  )
}
