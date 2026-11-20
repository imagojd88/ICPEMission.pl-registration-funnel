import LeaderDepositFields from './LeaderDepositFields'
import EventPreviewPane from './EventPreviewPane'
import type { EventInstanceDto } from '@icpe/shared'
import type { EventConfig } from '@/lib/api'
import AgeDiscountsEditor, { bracketsFromRows, rowsFromBrackets, type AgeDiscountRow } from './AgeDiscountsEditor'
import DietOptionsSelect from './DietOptionsSelect'
import { PriceUnitSelect, priceHint } from './RoomPriceFields'
import RoomStockFields from './RoomStockFields'
import OptionalStayFields from './OptionalStayFields'
import { useState, useEffect, type ChangeEvent } from 'react'
import { Plus, Trash2, Upload, Images } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import ImageGalleryPicker from '@/components/admin/ImageGalleryPicker'
import InvitedGuestsSection from '@/components/admin/events/InvitedGuestsSection'
import AffiliationSelect from '@/components/admin/events/AffiliationSelect'
import SpecialGuestsEditor, { guestRowsFrom, guestsToSave, guestsMissingBio, type GuestRow } from '@/components/admin/events/SpecialGuestsEditor'
import type { AffiliationField } from '@/lib/communities'
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
import { SUPERTITLE_PRESETS, isPresetSupertitle } from '@/lib/supertitles'
import { DEFAULT_PRICING } from '@icpe/shared'
import type { PricingConfig } from '@icpe/shared'

/** Języki dodatkowe eventu (PL i EN są zawsze). */
const OPTIONAL_LANGS = ['it', 'ko', 'zh'] as const
const OPTIONAL_LANG_TITLE: Record<string, string> = { it: 'Włoski', ko: 'Koreański', zh: 'Chiński (uproszczony)' }

interface EditTarget {
  instanceId: string
  seriesId: string
  slug: string
}

type PricingModel = 'os/noc' | 'za pokój' | 'za osobę' | 'dopłata 1-os'

interface RoomRow {
  id: string
  /** id typu pokoju w zapisanym cenniku — zachowujemy, bo zgłoszenia (roomsJson) wskazują pokoje po id */
  origId?: string
  name: Record<string, string>
  model: PricingModel
  capacity: string
  price: string
  tag: string
  /** za co jest cena: osoba / cały pokój (za noc) */
  priceUnit: 'person' | 'room'
  /** liczba pokoi tego typu (puste = bez limitu) */
  stock: string
  /** ile z nich zablokowanych dla gości specjalnych */
  reserved: string
}
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
  const [nameMap, setNameMap] = useState<Record<string, string>>({})
  const [descMap, setDescMap] = useState<Record<string, string>>({})
  const [editLang, setEditLang] = useState('pl')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [nights, setNights] = useState('1')
  const [location, setLocation] = useState('')
  // Tłumaczenia miejsca (EN/IT). PL = `location` (kanoniczne — kalendarz, maile, mapa).
  const [locI18n, setLocI18n] = useState<Record<string, string>>({})
  // Wersja PL, z której zrobiono tłumaczenia miejsca — gdy PL się zmieni, ostrzegamy.
  const [locTrSrc, setLocTrSrc] = useState('')
  const [capacity, setCapacity] = useState('')
  const [payOnline, setPayOnline] = useState(false)
  const [payTransfer, setPayTransfer] = useState(false)
  const [payCash, setPayCash] = useState(false)
  // Zaliczka u lidera wspólnoty (LEADER_DEPOSIT) + jej wysokość w %.
  const [payLeader, setPayLeader] = useState(false)
  const [leaderPct, setLeaderPct] = useState('50')
  const [isFree, setIsFree] = useState(false)
  const [currency, setCurrency] = useState<'PLN' | 'EUR' | 'USD'>('PLN')
  const [formationFee, setFormationFee] = useState(String(DEFAULT_PRICING.formationFee))
  const [mealsFee, setMealsFee] = useState(String(DEFAULT_PRICING.mealsFee))
  // Nocleg opcjonalny (event dzienny z noclegiem dla przyjezdnych) + posiłki tylko dla nocujących.
  const [optionalStay, setOptionalStay] = useState(false)
  // Limit pokoi: zajętość z API (publicznie / z rezerwy) i wolne publicznie — do podglądu przy pokojach.
  const [roomUsage, setRoomUsage] = useState<{ pub: Record<string, number>; res: Record<string, number>; free: Record<string, number> }>({ pub: {}, res: {}, free: {} })
  const [overnightMeals, setOvernightMeals] = useState('0')
  const [transport, setTransport] = useState(String(DEFAULT_PRICING.options.transport))
  const [bedding, setBedding] = useState(String(DEFAULT_PRICING.options.bedding))
  const [rooms, setRooms] = useState<RoomRow[]>([])
  const [brackets, setBrackets] = useState<AgeDiscountRow[]>([])
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
  const [superMap, setSuperMap] = useState<Record<string, string>>({})
  // Ręcznie wybrana opcja „Inny…" — trzyma otwarte pole tekstowe, gdy jest jeszcze puste.
  const [superCustom, setSuperCustom] = useState(false)
  const [program, setProgram] = useState<{ id: string; time: string; item: Record<string, string> }[]>([])
  // Goście specjalni — lista (imiona i opis per język, portret i „para” wspólne).
  const [guests, setGuests] = useState<GuestRow[]>([])
  const [places, setPlaces] = useState<Place[]>([])
  // Typ eventu z serii — decyduje, czy pokazać sekcję zaproszonych gości.
  const [eventType, setEventType] = useState<string>('')
  // Ścieżka „uczestnik zaprasza gościa" (customFields.guestInvites).
  const [guestInvitesEnabled, setGuestInvitesEnabled] = useState(false)
  // Pole przynależności w formularzu zapisu (customFields.affiliationField).
  const [affiliationField, setAffiliationField] = useState<AffiliationField | ''>('')
  // Diety do wyboru w formularzu (customFields.diets) — domyślnie żadna.
  const [diets, setDiets] = useState<string[]>([])
  const [guestInvitesMax, setGuestInvitesMax] = useState('2')

  const addProgramRow = () => setProgram((p) => [...p, { id: `pg-${Date.now()}`, time: '', item: {} }])
  const setProgramTime = (id: string, time: string) =>
    setProgram((p) => p.map((r) => (r.id === id ? { ...r, time } : r)))
  const setProgramItem = (id: string, val: string) =>
    setProgram((p) => p.map((r) => (r.id === id ? { ...r, item: { ...r.item, [editLang]: val } } : r)))
  const removeProgramRow = (id: string) => setProgram((p) => p.filter((r) => r.id !== id))

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
  /** Języki dodatkowe (poza zawsze dostępnymi PL/EN) zaznaczone w „Języki strony”. */
  const [extraLangs, setExtraLangs] = useState<string[]>([])

  // Zakładki języka treści. PL i EN są zawsze — strony publiczne (zapisy, zaproszenia)
  // zawsze oferują gościom PL i EN (LanguageSwitch.ALWAYS), więc wersję EN trzeba móc wpisać
  // niezależnie od ustawień. IT — gdy zaznaczony w „Języki strony".
  const activeLocales = ['pl', 'en', ...OPTIONAL_LANGS.filter((l) => extraLangs.includes(l))]
  const multi = activeLocales.length > 1
  useEffect(() => {
    if (!activeLocales.includes(editLang)) setEditLang('pl')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraLangs.join(',')])

  /** Nadtytuł w aktualnie edytowanym języku. */
  const superTitle = superMap[editLang] ?? ''
  // Przełączenie języka zaczyna wybór od nowa (druga wersja może być z listy).
  useEffect(() => { setSuperCustom(false) }, [editLang])

  const LANG_LABEL: Record<string, string> = { pl: 'PL', en: 'EN', it: 'IT', ko: 'KO', zh: 'ZH' }
  const LANG_NAME: Record<string, string> = { pl: 'polsku', en: 'angielsku', it: 'włosku', ko: 'koreańsku', zh: 'chińsku' }
  /** Placeholder w zakładce obcego języka: pokazuje polski oryginał do przetłumaczenia. */
  const srcPh = (pl: string | undefined, fallback: string) =>
    editLang !== 'pl' && pl?.trim() ? `PL: ${pl.trim()}` : fallback
  const hasLocTr = Object.values(locI18n).some((v) => v?.trim())
  const locStale = hasLocTr && locTrSrc !== location.trim()
  /** Czego brakuje w danym języku (pola wypełnione po polsku, puste w `l`). */
  const missingIn = (l: string): string[] => {
    if (l === 'pl') return []
    const miss = (m: Record<string, string> | undefined) => !!m?.pl?.trim() && !m?.[l]?.trim()
    const out: string[] = []
    if (miss(nameMap)) out.push('nazwa')
    if (miss(descMap)) out.push('opis')
    if (miss(superMap)) out.push('nadtytuł')
    const p = program.filter((r) => miss(r.item)).length
    if (p) out.push(`program (${p})`)
    const gm = guestsMissingBio(guests, l)
    if (gm) out.push(`opis gości (${gm})`)
    const rm = isFree ? 0 : rooms.filter((r) => miss(r.name)).length
    if (rm) out.push(`pokoje (${rm})`)
    if (locStale && locI18n[l]?.trim()) out.push('miejsce (sprawdź)')
    return out
  }
  const cleanMap = (m: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v))

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getEventEditConfig(editTarget.slug)
      .then((cfg: EventEditConfig) => {
        if (cancelled) return
        const pc = cfg.pricingConfig
        setEventType(cfg.type ?? '')
        setNameMap((cfg.title as Record<string, string>) ?? {})
        setDescMap((cfg.description as Record<string, string>) ?? {})
        setDateStart(cfg.startsAt ? cfg.startsAt.slice(0, 10) : '')
        setDateEnd(cfg.endsAt ? cfg.endsAt.slice(0, 10) : '')
        setNights(String(cfg.nights ?? 1))
        setLocation(cfg.location ?? '')
        {
          // Tłumaczenie miejsca bierzemy tylko, jeśli powstało z obecnej wersji PL.
          const li = cfg.customFields?.locationI18n
          const fresh = li && (li.pl ?? '').trim() === (cfg.location ?? '').trim()
          setLocI18n(fresh ? { en: li.en ?? '', it: li.it ?? '' } : {})
          setLocTrSrc((cfg.location ?? '').trim())
        }
        setCapacity(cfg.capacity != null ? String(cfg.capacity) : '')
        const pm = cfg.paymentMethods ?? []
        setPayOnline(pm.includes('ONLINE'))
        setPayTransfer(pm.includes('BANK_TRANSFER'))
        setPayCash(pm.includes('CASH'))
        setPayLeader(pm.includes('LEADER_DEPOSIT'))
        setLeaderPct(String(pc?.leaderDepositPct ?? 50))
        setIsFree(!!pc?.free)
        setCurrency((pc?.currency as 'PLN' | 'EUR' | 'USD') ?? 'PLN')
        setFormationFee(String(pc?.formationFee ?? DEFAULT_PRICING.formationFee))
        setMealsFee(String(pc?.mealsFee ?? DEFAULT_PRICING.mealsFee))
        setOptionalStay(!!pc?.accommodationOptional)
        setOvernightMeals(String(pc?.overnightMealsFee ?? 0))
        setTransport(String(pc?.options?.transport ?? DEFAULT_PRICING.options.transport))
        setBedding(String(pc?.options?.bedding ?? DEFAULT_PRICING.options.bedding))
        setRooms(
          (pc?.rooms ?? []).map((r, i) => ({
            id: `r-${i}`,
            origId: String(r.id),
            name: typeof r.name === 'string' ? (r.name ? { pl: r.name } : {}) : (r.name ?? {}),
            model: (r.model as PricingModel) || 'os/noc',
            capacity: String(r.cap ?? 1),
            price: String(r.perPerson ?? 0),
            tag: r.tag || '',
            priceUnit: r.priceUnit === 'room' ? 'room' : 'person',
            stock: r.stock ? String(r.stock) : '',
            reserved: r.reserved ? String(r.reserved) : '',
          })),
        )
        setRoomUsage({ pub: cfg.roomUsage ?? {}, res: cfg.roomUsageReserved ?? {}, free: cfg.roomAvailability ?? {} })
        setBrackets(
          rowsFromBrackets(pc?.childBrackets),
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
        const st = cfg.theme?.supertitle
        setSuperMap(typeof st === 'string' ? (st ? { pl: st } : {}) : (st ?? {}))
        setProgram(
          (cfg.customFields?.program ?? []).map((p, i) => ({
            id: `pg-${i}`,
            time: p.time,
            item: typeof p.item === 'string' ? (p.item ? { pl: p.item } : {}) : (p.item ?? {}),
          })),
        )
        setGuests(guestRowsFrom(cfg.customFields))
        setGuestInvitesEnabled(cfg.customFields?.guestInvites?.enabled === true)
        setAffiliationField(cfg.customFields?.affiliationField ?? '')
        setDiets(Array.isArray(cfg.customFields?.diets) ? cfg.customFields!.diets! : [])
        setGuestInvitesMax(String(cfg.customFields?.guestInvites?.maxPerInviter ?? 2))
        const loc = cfg.locales ?? ['pl']
        // PL i EN zawsze aktywne (patrz activeLocales); IT / KO / ZH według ustawień.
        setExtraLangs(OPTIONAL_LANGS.filter((l) => loc.includes(l)))
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
      currency,
      formationFee: parseFloat(formationFee) || 0,
      mealsFee: parseFloat(mealsFee) || 0,
      nights: n,
      ...(payLeader ? { leaderDepositPct: Math.min(100, Math.max(1, parseInt(leaderPct) || 50)) } : {}),
      ...(optionalStay ? { accommodationOptional: true } : {}),
      ...(parseFloat(overnightMeals) > 0 ? { overnightMealsFee: parseFloat(overnightMeals) } : {}),
      childBrackets: bracketsFromRows(brackets),
      rooms: (() => {
        // Id typu pokoju musi zostać stały (zgłoszenia i limit pokoi liczą po id) —
        // wcześniej numerowane od nowa, więc usunięcie pokoju przesuwało id pozostałych.
        const used = new Set(rooms.map((r) => r.origId).filter(Boolean) as string[])
        let next = 1
        const freshId = () => {
          while (used.has(String(next))) next++
          used.add(String(next))
          return String(next)
        }
        return rooms.map((r) => {
          const stock = parseInt(r.stock) || 0
          const reserved = Math.min(parseInt(r.reserved) || 0, stock || Infinity)
          return {
            id: r.origId ?? freshId(),
            name: cleanMap(r.name),
            cap: parseInt(r.capacity) || 1,
            perPerson: parseFloat(r.price) || 0,
            // Jednostka ceny liczy się w wycenie; `model` to tylko etykieta (zgodna z jednostką).
            priceUnit: r.priceUnit,
            model: r.priceUnit === 'room' ? 'za pokój' : 'os/noc',
            tag: r.tag || '',
            ...(stock > 0 ? { stock } : {}),
            ...(stock > 0 && reserved > 0 ? { reserved } : {}),
          }
        })
      })(),
      options: { transport: parseFloat(transport) || 0, bedding: parseFloat(bedding) || 0 },
      discountCodes: Object.fromEntries(
        discounts
          .filter((d) => d.code.trim())
          .map((d) => [d.code.trim(), (parseFloat(d.pct) || 0) / 100]),
      ),
    }
  }

  // ── Budowanie danych eventu (wspólne dla zapisu i podglądu na żywo) ──
  function buildPaymentMethods(): string[] {
    const out: string[] = []
    if (payOnline) out.push('ONLINE')
    if (payTransfer) out.push('BANK_TRANSFER')
    if (payCash) out.push('CASH')
    if (payLeader) out.push('LEADER_DEPOSIT')
    return out
  }
  function buildDates(): { startsAt: string; endsAt: string } | null {
    if (!dateStart) return null
    const n = parseInt(nights) || 0
    const startsAt = new Date(`${dateStart}T14:00:00`).toISOString()
    const endsAt = dateEnd
      ? new Date(`${dateEnd}T22:00:00`).toISOString()
      : new Date(new Date(`${dateStart}T14:00:00`).getTime() + n * 86400000 + 8 * 3600000).toISOString()
    return { startsAt, endsAt }
  }
  function buildLocationI18n() {
    const locTr = cleanMap({ en: locI18n.en ?? '', it: locI18n.it ?? '' })
    // `pl` = wersja, z której zrobiono tłumaczenie. Niepotwierdzone po zmianie PL → strona
    // pokaże aktualne miejsce po polsku (eventLocation porównuje `pl` z location).
    return location.trim() && Object.keys(locTr).length ? { pl: locTrSrc || location.trim(), ...locTr } : null
  }
  function buildTheme(): Record<string, unknown> {
    const theme: Record<string, unknown> = { primaryColor }
    if (heroImageUrl) theme.heroImageUrl = heroImageUrl
    if (titleColor) theme.titleColor = titleColor
    theme.badge = badge
    theme.supertitle = cleanMap(superMap)
    return theme
  }
  function buildCustomFields() {
    return {
      program: program
        .filter((r) => r.time.trim() || Object.keys(cleanMap(r.item)).length)
        .map((r) => ({ time: r.time.trim(), item: cleanMap(r.item) })),
      locationI18n: buildLocationI18n(),
      // Nowy format: lista gości. Stary pojedynczy `specialGuest` czyścimy, żeby nie dublował.
      specialGuests: guestsToSave(guests),
      specialGuest: null,
      affiliationField: affiliationField || null,
      diets,
      guestInvites: {
        enabled: guestInvitesEnabled,
        maxPerInviter: Math.min(10, Math.max(1, parseInt(guestInvitesMax, 10) || 2)),
      },
    }
  }

  async function handleSave() {
    const titleClean = cleanMap(nameMap)
    if (!Object.keys(titleClean).length) { setError('Podaj nazwę eventu.'); return }
    if (!slug) { setError('Podaj slug (adres strony).'); return }
    if (!dateStart) { setError('Podaj datę rozpoczęcia.'); return }
    // Nocleg przy 0 nocach: pokoje kosztowałyby 0 zł, a gość nie widziałby wyboru noclegu.
    if (optionalStay && rooms.length > 0 && (parseInt(nights) || 0) < 1) {
      setError('Nocleg opcjonalny wymaga liczby nocy co najmniej 1 (np. nocleg z piątku na sobotę = 1). Wpisz ją w polu „Liczba nocy” w sekcji Szczegóły (obok „Limit miejsc”) albo w polu pod „Nocleg opcjonalny” w Cenniku. Przy 0 nocach pokoje kosztują 0 zł.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const n = parseInt(nights) || 0
      const paymentMethods = buildPaymentMethods()
      const { startsAt, endsAt } = buildDates()!

      const descClean = cleanMap(descMap)
      await updateEventInstance(editTarget.instanceId, {
        title: { pl: titleClean.pl ?? Object.values(titleClean)[0] ?? '', ...titleClean },
        description: Object.keys(descClean).length ? descClean : null,
        startsAt,
        endsAt,
        location: location || null,
        nights: n,
        capacity: capacity ? parseInt(capacity) : null,
        paymentMethods,
        pricingConfig: buildPricing(),
      })

      const locales = [...activeLocales]
      const theme = buildTheme()

      await configureSeriesPage(editTarget.seriesId, {
        slug,
        theme,
        enabledFields: { phone: true, address: true, dietary: true, children: true },
        paymentInfo: { recipient: bankRecipient.trim(), account: bankAccount.trim() },
        customFields: buildCustomFields(),
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

  // Szkic dla podglądu na żywo (to, co gość zobaczy po zapisaniu).
  const previewDates = buildDates()
  const titleDraft = cleanMap(nameMap)
  const descDraft = cleanMap(descMap)
  const previewDraft = {
    event: {
      type: (eventType || 'ONE_TIME') as EventInstanceDto['type'],
      // Mapy językowe bywają niepełne (np. bez IT) — lejek i tak czyta je przez pickLang.
      title: { pl: titleDraft.pl ?? Object.values(titleDraft)[0] ?? '', ...titleDraft } as unknown as EventInstanceDto['title'],
      description: (Object.keys(descDraft).length ? descDraft : undefined) as unknown as EventInstanceDto['description'],
      ...(previewDates ?? {}),
      location: location || undefined,
      nights: parseInt(nights) || 0,
      capacity: capacity ? parseInt(capacity) : null,
      paymentMethods: buildPaymentMethods() as EventInstanceDto['paymentMethods'],
      status: 'OPEN' as EventInstanceDto['status'],
      registeredCount: 0,
      slug,
    },
    config: {
      type: (eventType || 'ONE_TIME') as EventConfig['type'],
      pricing: buildPricing(),
      customFields: buildCustomFields() as EventConfig['customFields'],
      theme: buildTheme() as EventConfig['theme'],
      locales: [...activeLocales],
      paymentInfo: { recipient: bankRecipient.trim(), account: bankAccount.trim() },
    },
  }

  return (
  <div className="flex gap-6 items-start">
    <div className="flex flex-col gap-5 min-w-0" style={{ maxWidth: 760, flex: '1 1 760px' }}>
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

      {multi && (() => {
        const missingHere = missingIn(editLang)
        return (
          <div
            className="flex flex-col gap-1.5 rounded-[12px] px-3 py-2 sticky top-2 z-10"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider mr-1" style={{ color: 'var(--faint)' }}>Język treści</span>
              {activeLocales.map((l) => {
                const active = editLang === l
                const missing = missingIn(l).length
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setEditLang(l)}
                    title={missing ? `Brakuje tłumaczeń: ${missingIn(l).join(', ')}` : undefined}
                    className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-colors"
                    style={{
                      background: active ? 'var(--brand)' : 'transparent',
                      color: active ? '#fff' : 'var(--muted)',
                      border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    {LANG_LABEL[l]}
                    {missing > 0 && (
                      <span
                        className="rounded-full px-1.5 text-[10px] leading-4"
                        style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
                      >
                        {missing}
                      </span>
                    )}
                  </button>
                )
              })}
              <span className="text-xs ml-auto" style={{ color: 'var(--faint)' }}>edytujesz: {LANG_LABEL[editLang]}</span>
            </div>
            <p className="text-xs" style={{ color: editLang !== 'pl' && missingHere.length ? 'var(--warn)' : 'var(--faint)' }}>
              {editLang === 'pl'
                ? 'Wersja podstawowa. Po wpisaniu treści przełącz na EN i przetłumacz — goście wybierają język na stronie.'
                : missingHere.length
                  ? `Do przetłumaczenia: ${missingHere.join(', ')}. Puste pola goście zobaczą ${editLang === 'en' ? 'po polsku' : 'po angielsku (a bez wersji EN — po polsku)'}; polski oryginał widać w podpowiedzi pola.`
                  : `Wszystko przetłumaczone na ${LANG_NAME[editLang]}. Pola, których nie wypełnisz (np. imiona), pokażą się ${editLang === 'en' ? 'jak po polsku' : 'jak po angielsku (albo po polsku)'}.`}
            </p>
          </div>
        )
      })()}

      <Section title="Szczegóły">
        <Field label={`Nazwa eventu${multi ? ` (${LANG_LABEL[editLang]})` : ''}`}>
          <Input value={nameMap[editLang] ?? ''} onChange={(e) => setNameMap((m) => ({ ...m, [editLang]: e.target.value }))} placeholder={srcPh(nameMap.pl, 'np. Dzień Formacji Wspólnoty')} />
        </Field>
        <Field label={`Opis (pokazywany na stronie zapisów)${multi ? ` — ${LANG_LABEL[editLang]}` : ''}`}>
          <textarea
            value={descMap[editLang] ?? ''}
            onChange={(e) => setDescMap((m) => ({ ...m, [editLang]: e.target.value }))}
            rows={4}
            placeholder={srcPh(descMap.pl, 'Krótki opis wydarzenia — np. zaproszenie, program, miejsce…')}
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
        <Field label={`Lokalizacja${multi ? ` — ${LANG_LABEL[editLang]}` : ''}`}>
          {editLang !== 'pl' ? (
            <div className="flex flex-col gap-1.5">
              <Input
                value={locI18n[editLang] ?? ''}
                onChange={(e) => {
                  setLocI18n((m) => ({ ...m, [editLang]: e.target.value }))
                  setLocTrSrc(location.trim())
                }}
                placeholder={srcPh(location, 'np. Education and Formation Centre, ul. …, city')}
              />
              {locStale ? (
                <div className="flex items-center gap-2 flex-wrap text-xs" style={{ color: 'var(--warn)' }}>
                  <span>Miejsce po polsku zmieniło się po przetłumaczeniu — sprawdź tę wersję.</span>
                  <button
                    type="button"
                    onClick={() => setLocTrSrc(location.trim())}
                    className="underline"
                    style={{ color: 'var(--warn)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Tłumaczenie jest aktualne
                  </button>
                </div>
              ) : (
                <p className="text-xs" style={{ color: 'var(--faint)' }}>
                  Puste = goście zobaczą adres po polsku. Kalendarz (.ics) i maile używają wersji PL.
                </p>
              )}
            </div>
          ) : (
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
          )}
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
            <LeaderDepositFields
              enabled={payLeader}
              onEnabled={setPayLeader}
              pct={leaderPct}
              onPct={setLeaderPct}
              communityField={affiliationField === 'community'}
            />
          </div>
        )}
      </Section>

      <Section title="Cennik">
        <Field label="Waluta (kwoty wpisujesz w tej walucie)">
          <select value={currency} onChange={(e) => setCurrency(e.target.value as 'PLN' | 'EUR' | 'USD')} className={inputCls} style={{ ...inputStyle, maxWidth: 200 }}>
            <option value="PLN">PLN (zł)</option>
            <option value="EUR">EUR (€)</option>
            <option value="USD">USD ($)</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opłata formacyjna"><Input value={formationFee} onChange={(e) => setFormationFee(e.target.value)} inputMode="numeric" /></Field>
          <Field label="Wyżywienie / doba (zł)"><Input value={mealsFee} onChange={(e) => setMealsFee(e.target.value)} inputMode="numeric" /></Field>
          <Field label="Transport (zł)"><Input value={transport} onChange={(e) => setTransport(e.target.value)} inputMode="numeric" /></Field>
          <Field label="Pościel / os (zł)"><Input value={bedding} onChange={(e) => setBedding(e.target.value)} inputMode="numeric" /></Field>
        </div>

        {/* Pokoje */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Pokoje</span>
          <p className="text-xs -mt-1" style={{ color: 'var(--muted)' }}>
            Każdy typ: nazwa · ile osób mieści pokój · cena · <strong>za co jest cena</strong> — za osobę (każdy płaci tyle za noc) albo za cały pokój (stała kwota za noc, niezależnie od liczby osób).
          </p>
          <OptionalStayFields
            optional={optionalStay}
            onOptional={setOptionalStay}
            overnightMeals={overnightMeals}
            onOvernightMeals={setOvernightMeals}
            nights={parseInt(nights) || 0}
            hasRooms={rooms.length > 0}
            onNights={setNights}
          />
          {rooms.map((r) => (
            <div key={r.id} className="flex flex-col gap-1.5 pb-2" style={{ borderBottom: '1px dashed var(--border)' }}>
            <div className="flex items-center gap-2">
              <Input value={r.name[editLang] ?? ''} onChange={(e) => setRooms((p) => p.map((x) => x.id === r.id ? { ...x, name: { ...x.name, [editLang]: e.target.value } } : x))} placeholder={srcPh(r.name.pl, multi ? `Nazwa (${LANG_LABEL[editLang]})` : 'Nazwa')} />
              <input value={r.capacity} onChange={(e) => setRooms((p) => p.map((x) => x.id === r.id ? { ...x, capacity: e.target.value } : x))} placeholder="os." inputMode="numeric" className={inputCls} style={{ ...inputStyle, width: 70 }} />
              <input value={r.price} onChange={(e) => setRooms((p) => p.map((x) => x.id === r.id ? { ...x, price: e.target.value } : x))} placeholder="cena" inputMode="numeric" className={inputCls} style={{ ...inputStyle, width: 90 }} />
              <PriceUnitSelect value={r.priceUnit} onChange={(v) => setRooms((p) => p.map((x) => (x.id === r.id ? { ...x, priceUnit: v } : x)))} className={inputCls} style={{ ...inputStyle, width: 150 }} />
              <button onClick={() => setRooms((p) => p.filter((x) => x.id !== r.id))} className="p-2 rounded-[8px]" style={{ color: 'var(--err)' }}><Trash2 size={15} /></button>
            </div>
            {priceHint(r.price, r.capacity, r.priceUnit, currency === 'PLN' ? 'zł' : currency) && (
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                Pojemność {parseInt(r.capacity) || 1} os. · {priceHint(r.price, r.capacity, r.priceUnit, currency === 'PLN' ? 'zł' : currency)}
              </span>
            )}
            <RoomStockFields
              stock={r.stock}
              reserved={r.reserved}
              onStock={(v) => setRooms((p) => p.map((x) => (x.id === r.id ? { ...x, stock: v } : x)))}
              onReserved={(v) => setRooms((p) => p.map((x) => (x.id === r.id ? { ...x, reserved: v } : x)))}
              usedPublic={r.origId ? roomUsage.pub[r.origId] ?? 0 : 0}
              usedReserved={r.origId ? roomUsage.res[r.origId] ?? 0 : 0}
            />
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setRooms((p) => [...p, { id: `r-new-${Date.now()}`, name: {}, model: 'os/noc', capacity: '2', price: '80', tag: '', priceUnit: 'person', stock: '', reserved: '' }])}>
            <Plus size={14} /> Dodaj pokój
          </Button>
        </div>

        {/* Progi wiekowe — zniżki osobno na nocleg i na wydarzenie */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>Zniżki wiekowe (dzieci)</span>
          <AgeDiscountsEditor rows={brackets} onChange={setBrackets} inputCls={inputCls} inputStyle={inputStyle} />
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
        <Field label={`Nadtytuł (nad nazwą eventu)${multi ? ` — ${LANG_LABEL[editLang]}` : ''}`}>
          {editLang !== 'pl' ? (
            // Gotowe nadtytuły są po polsku — w innych językach wpisujemy tłumaczenie wprost.
            <Input
              value={superTitle}
              onChange={(e) => setSuperMap((m) => ({ ...m, [editLang]: e.target.value }))}
              placeholder={srcPh(superMap.pl, 'np. Community celebration')}
            />
          ) : (
          <div className="flex flex-col gap-2">
            <select
              value={isPresetSupertitle(superTitle) ? superTitle : superTitle ? '__custom' : ''}
              onChange={(e) => {
                const v = e.target.value
                // „__custom" nie jest treścią — czyścimy pole i czekamy, aż user wpisze swoje.
                setSuperMap((m) => ({ ...m, [editLang]: v === '__custom' ? '' : v }))
                setSuperCustom(v === '__custom')
              }}
              className={inputCls}
              style={inputStyle}
            >
              <option value="">— brak (bez nadtytułu) —</option>
              {SUPERTITLE_PRESETS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
              <option value="__custom">Inny — wpisz własny…</option>
            </select>
            {(superCustom || (superTitle && !isPresetSupertitle(superTitle))) && (
              <Input
                value={superTitle}
                onChange={(e) => setSuperMap((m) => ({ ...m, [editLang]: e.target.value }))}
                placeholder="np. Świętowanie daru wspólnoty"
                autoFocus
              />
            )}
          </div>
          )}
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
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--ink)' }}>
              <label className="flex items-center gap-1.5" title="Zawsze dostępny"><input type="checkbox" checked disabled className="accent-[var(--brand)] w-4 h-4" /> PL</label>
              <label className="flex items-center gap-1.5" title="Zawsze dostępny"><input type="checkbox" checked disabled className="accent-[var(--brand)] w-4 h-4" /> EN</label>
              {OPTIONAL_LANGS.map((l) => (
                <label key={l} className="flex items-center gap-1.5" title={OPTIONAL_LANG_TITLE[l]}>
                  <input
                    type="checkbox"
                    checked={extraLangs.includes(l)}
                    onChange={(e) => setExtraLangs((cur) => (e.target.checked ? [...cur, l] : cur.filter((x) => x !== l)))}
                    className="accent-[var(--brand)] w-4 h-4"
                  />{' '}
                  {l.toUpperCase()}
                </label>
              ))}
            </div>
            <p className="text-xs" style={{ color: 'var(--faint)' }}>
              PL i EN są zawsze dostępne dla gości. Zaznacz IT (włoski), KO (koreański) lub ZH (chiński uproszczony), żeby dodać tę wersję — interfejs zapisów jest już przetłumaczony, a u góry pojawi się zakładka do tłumaczenia treści eventu. Nieprzetłumaczoną treść goście KO / ZH zobaczą po angielsku.
            </p>
          </div>
        </Field>
      </Section>

      {eventType && eventType !== 'STANDALONE' && (
        <Section title={eventType === 'INVITE' ? 'Zaproszeni goście' : 'Goście z zaproszeniem'}>
          {/* Uczestnicy zapraszają gości sami — goście lądują na liście poniżej. */}
          <div className="flex flex-col gap-2 px-3 py-3 rounded-[10px]" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <label className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--ink)' }}>
              <input
                type="checkbox"
                checked={guestInvitesEnabled}
                onChange={(e) => setGuestInvitesEnabled(e.target.checked)}
                className="accent-[var(--brand)] w-4 h-4"
              />
              Uczestnicy mogą sami zapraszać gości
            </label>
            {guestInvitesEnabled && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink)' }}>
                <span>Maks. gości na uczestnika:</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={guestInvitesMax}
                  onChange={(e) => setGuestInvitesMax(e.target.value)}
                  className={inputCls}
                  style={{ ...inputStyle, width: 80 }}
                />
              </div>
            )}
            <p className="text-xs" style={{ color: 'var(--faint)' }}>
              {eventType === 'INVITE'
                ? 'Po potwierdzeniu udziału gość dostaje link „Zaproś gościa". Zaproszona przez niego osoba dostaje imienne zaproszenie mailem i sama potwierdza udział. Goście uczestników nie mogą zapraszać dalej.'
                : 'Po rejestracji uczestnik widzi przycisk „Zaproś gościa" (także w mailu z potwierdzeniem). Gość dostaje mailem osobisty link do rejestracji z wpisanymi danymi i przechodzi zwykły formularz z ceną. Goście uczestników nie mogą zapraszać dalej.'}
              {' '}Zmiana działa po kliknięciu „Zapisz".
            </p>
          </div>
          <InvitedGuestsSection
            instanceId={editTarget.instanceId}
            eventTitle={nameMap.pl || nameMap.en || nameMap.it || 'wydarzenie'}
            eventType={eventType}
            guestInvitesEnabled={guestInvitesEnabled}
          />
        </Section>
      )}

      <Section title="Formularz zapisu">
        {/* Nie <Field> (to <label>) — kliknięcie w odstęp wybierałoby pierwszy przycisk. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>
            Przynależność (krok „Dane zgłaszającego”)
          </span>
          <AffiliationSelect value={affiliationField} onChange={setAffiliationField} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>
            Diety do wyboru (krok „Preferencje”)
          </span>
          <DietOptionsSelect value={diets} onChange={setDiets} />
        </div>
      </Section>

      <Section title="Program i goście specjalni">
        <Field label={`Program (godzina + punkt)${multi ? ` — treść: ${LANG_LABEL[editLang]}` : ''}`}>
          <div className="flex flex-col gap-2">
            {program.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <input value={row.time} onChange={(e) => setProgramTime(row.id, e.target.value)} placeholder="18:00" className={inputCls} style={{ ...inputStyle, width: 90 }} />
                <input value={row.item[editLang] ?? ''} onChange={(e) => setProgramItem(row.id, e.target.value)}  placeholder={srcPh(row.item.pl, 'Punkt programu')} className={inputCls} style={{ ...inputStyle, flex: 1 }} />
                <button onClick={() => removeProgramRow(row.id)} className="p-2 rounded-[8px]" style={{ color: 'var(--err)' }}><Trash2 size={15} /></button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addProgramRow}><Plus size={14} /> Dodaj punkt</Button>
          </div>
        </Field>
        <p className="text-xs" style={{ color: 'var(--faint)' }}>
          Godzina jest wspólna dla wszystkich języków; tłumaczysz tylko opis punktu.
        </p>
        {/* Nie <Field> (to <label>) — w środku są przyciski i pola kilku gości. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--faint)' }}>
            Goście specjalni{multi ? ` — imiona i opis: ${LANG_LABEL[editLang]}` : ''}
          </span>
          <SpecialGuestsEditor
            rows={guests}
            onChange={setGuests}
            lang={editLang as 'pl' | 'en' | 'it' | 'ko' | 'zh'}
            onError={setError}
          />
        </div>
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
    <EventPreviewPane
      slug={editTarget.slug}
      draft={previewDraft}
      lang={editLang}
      hasRooms={rooms.length > 0}
      free={isFree}
      simple={eventType === 'STANDALONE' || eventType === 'INVITE'}
    />
  </div>
  )
}
