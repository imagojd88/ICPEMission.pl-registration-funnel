import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  formatMoney, DONATION_PRESETS, DONATION_MAX, cleanDonation, hasDiscountCodes,
  eventAddons, addonVisible, addonLabel, addonPrice, addonMaxPerRegistration,
} from '@icpe/shared'
import type { PricingConfig, AddonDef, AddonPerson } from '@icpe/shared'
import { Input } from '../../ui/Input'

interface Options {
  transport: boolean
  bedding: boolean
  /** dobrowolna darowizna (0 = brak) */
  donation: number
  /** dodatki z limitem: id → liczba sztuk */
  addons?: Record<string, number>
}

interface Consents {
  rodo: boolean
  regulamin: boolean
}

interface Props {
  options: Options
  discountCode: string
  discountApplied: boolean
  consents: Consents
  pricingConfig: PricingConfig
  /** Pole „Kod rabatowy” — tylko gdy event ma aktywny kod (domyślnie: sprawdzamy cennik). */
  showDiscount?: boolean
  /** Uczestnicy zgłoszenia — warunek wieku dodatków (np. łóżeczko tylko z dzieckiem poniżej 3 lat). */
  participants?: AddonPerson[]
  /** Wolne sztuki dodatków (tylko dodatki z limitem; brak klucza = bez limitu). */
  addonAvailability?: Record<string, number>
  onOptionsChange: (opts: Options) => void
  onDiscountChange: (code: string) => void
  onDiscountApply: (applied: boolean) => void
  onConsentsChange: (consents: Consents) => void
}

function CheckRow({
  label,
  price,
  checked,
  onChange,
}: {
  label: string
  price: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      className="flex items-center justify-between gap-3 rounded-[12px] p-4 transition-all duration-150 cursor-pointer"
      style={{
        border: checked ? '1.5px solid var(--brand)' : '1.5px solid var(--border)',
        background: checked ? 'var(--brand-soft)' : 'var(--surface)',
      }}
    >
      <div className="flex items-center gap-3 flex-1">
        {/* Custom checkbox */}
        <div
          className="flex items-center justify-center shrink-0 rounded-[6px] transition-all duration-150"
          style={{
            width: 20,
            height: 20,
            border: checked ? '2px solid var(--brand)' : '2px solid var(--border)',
            background: checked ? 'var(--brand)' : 'transparent',
          }}
        >
          {checked && (
            <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
              <path
                d="M1 4L4 7L10 1"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
        <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {label}
        </span>
      </div>
      <span className="text-sm font-semibold shrink-0" style={{ color: 'var(--brand)' }}>
        {price}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}

/**
 * Dodatek z limitem (np. dostawka): zaznaczenie albo — gdy wolno więcej niż 1 — licznik sztuk.
 * Pokazuje „Zostało: X”; po wyczerpaniu limitu jest nieaktywny („Brak dostępnych”).
 * Zaznaczony dodatek zawsze da się odznaczyć (także gdy w międzyczasie się wyczerpał).
 */
function AddonRow({
  def, qty, left, lng, priceText, onChange, t,
}: {
  def: AddonDef
  qty: number
  /** wolne sztuki; undefined = bez limitu */
  left: number | undefined
  lng: string
  priceText: string
  onChange: (qty: number) => void
  t: (key: string, opts?: Record<string, unknown>) => string
}) {
  const max = addonMaxPerRegistration(def)
  const cap = left === undefined ? max : Math.min(max, left)
  const soldOut = left !== undefined && left <= 0
  const disabled = soldOut && qty === 0
  const over = left !== undefined && qty > left
  const checked = qty > 0
  const desc = addonLabel(def.desc, lng)
  return (
    <div
      className="flex flex-col gap-2 rounded-[12px] p-4 transition-all duration-150"
      style={{
        border: over ? '1.5px solid var(--err)' : checked ? '1.5px solid var(--brand)' : '1.5px solid var(--border)',
        background: checked ? 'var(--brand-soft)' : 'var(--surface)',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <label className="flex items-start justify-between gap-3" style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}>
        <div className="flex items-start gap-3 flex-1">
          <div
            className="flex items-center justify-center shrink-0 rounded-[6px] transition-all duration-150 mt-0.5"
            style={{ width: 20, height: 20, border: checked ? '2px solid var(--brand)' : '2px solid var(--border)', background: checked ? 'var(--brand)' : 'transparent' }}
          >
            {checked && (
              <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                <path d="M1 4L4 7L10 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{addonLabel(def.name, lng)}</span>
            {desc && <span className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{desc}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>{priceText}</span>
          {left !== undefined && (
            <span className="text-xs font-medium" style={{ color: soldOut ? 'var(--err)' : 'var(--muted)' }}>
              {soldOut ? t('options.addon_sold_out') : t('options.addon_left', { n: left })}
            </span>
          )}
        </div>
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
        />
      </label>
      {checked && max > 1 && (
        <div className="flex items-center gap-2 pl-8">
          <button type="button" aria-label={t('options.addon_less')} onClick={() => onChange(Math.max(0, qty - 1))}
            className="rounded-[10px] text-base font-semibold" style={{ width: 36, height: 36, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer' }}>−</button>
          <span className="text-sm font-semibold tabular-nums" style={{ minWidth: 24, textAlign: 'center', color: 'var(--ink)' }} aria-live="polite">{qty}</span>
          <button type="button" aria-label={t('options.addon_more')} disabled={qty >= cap} onClick={() => onChange(Math.min(cap, qty + 1))}
            className="rounded-[10px] text-base font-semibold" style={{ width: 36, height: 36, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', cursor: qty >= cap ? 'not-allowed' : 'pointer', opacity: qty >= cap ? 0.5 : 1 }}>+</button>
        </div>
      )}
      {over && (
        <p className="text-xs font-medium" role="alert" style={{ color: 'var(--err)' }}>{t('options.addon_over')}</p>
      )}
    </div>
  )
}

export default function Step4Options({
  options,
  discountCode,
  discountApplied,
  consents,
  pricingConfig,
  showDiscount,
  participants,
  addonAvailability,
  onOptionsChange,
  onDiscountChange,
  onDiscountApply,
  onConsentsChange,
}: Props) {
  const { t, i18n } = useTranslation()
  const money = (n: number) => formatMoney(n, pricingConfig.currency, i18n.language)
  const [discountError, setDiscountError] = useState(false)
  const discountVisible = showDiscount ?? hasDiscountCodes(pricingConfig)

  // Darowizna: kwoty proponowane dla waluty eventu + „dowolna kwota" z polem do wpisania.
  const donationPresets = DONATION_PRESETS[pricingConfig.currency ?? 'PLN'] ?? DONATION_PRESETS.PLN
  const donation = options.donation ?? 0
  const [customOpen, setCustomOpen] = useState(donation > 0 && !donationPresets.includes(donation))
  const [customText, setCustomText] = useState(donation > 0 && !donationPresets.includes(donation) ? String(donation) : '')
  const setDonation = (v: number) => onOptionsChange({ ...options, donation: v })
  const pickPreset = (v: number) => {
    setCustomOpen(false)
    setCustomText('')
    setDonation(donation === v ? 0 : v) // ponowne kliknięcie = rezygnacja
  }
  const toggleCustom = () => {
    if (customOpen) {
      setCustomOpen(false)
      setCustomText('')
      setDonation(0)
    } else {
      setCustomOpen(true)
      setDonation(0)
    }
  }
  const onCustomText = (raw: string) => {
    const text = raw.replace(/[^\d.,]/g, '').slice(0, 9)
    setCustomText(text)
    setDonation(Math.min(DONATION_MAX, cleanDonation(text)))
  }
  const chipStyle = (active: boolean) => ({
    border: active ? '1.5px solid var(--brand)' : '1.5px solid var(--border)',
    background: active ? 'var(--brand-soft)' : 'var(--surface)',
    color: active ? 'var(--brand)' : 'var(--ink)',
    cursor: 'pointer',
  })

  const applyDiscount = () => {
    const code = discountCode.trim().toUpperCase()
    const isValid = !!code && (pricingConfig.discountCodes?.[code] ?? 0) > 0
    setDiscountError(!isValid)
    onDiscountApply(isValid)
  }

  const handleCodeChange = (value: string) => {
    onDiscountChange(value)
    setDiscountError(false)
    if (discountApplied) onDiscountApply(false)
  }

  const discountPct = discountApplied
    ? Math.round((pricingConfig.discountCodes?.[discountCode.trim().toUpperCase()] ?? 0) * 100)
    : 0

  const transportPrice = pricingConfig.options.transport
  const beddingPrice = pricingConfig.options.bedding
  const showTransport = transportPrice > 0
  const showBedding = beddingPrice > 0
  // Dodatki z limitem widoczne dla tego składu osób (event bez dodatków → pusta lista, nic się nie pokazuje).
  const addons = eventAddons(pricingConfig).filter((a) => addonVisible(a, participants))
  const anyLimited = addons.some((a) => addonAvailability && a.id in addonAvailability)
  const setAddon = (id: string, qty: number) => {
    const next = { ...(options.addons ?? {}) }
    if (qty > 0) next[id] = qty
    else delete next[id]
    onOptionsChange({ ...options, addons: next })
  }

  return (
    <div className="flex flex-col gap-5 px-[22px] py-5">
      <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
        {t('options.title')}
      </h2>

      {/* Transport — tylko gdy ma cenę */}
      {showTransport && (
        <CheckRow
          label={t('options.transport')}
          price={`+${money(transportPrice)}`}
          checked={options.transport}
          onChange={(v) => onOptionsChange({ ...options, transport: v })}
        />
      )}

      {/* Bedding — tylko gdy ma cenę */}
      {showBedding && (
        <CheckRow
          label={t('options.bedding')}
          price={`+${money(beddingPrice)}/os`}
          checked={options.bedding}
          onChange={(v) => onOptionsChange({ ...options, bedding: v })}
        />
      )}

      {/* Dodatki z limitem (np. dostawka, łóżeczko turystyczne) — tylko gdy event je ma */}
      {addons.length > 0 && (
        <div className="flex flex-col gap-2" role="group" aria-label={t('options.addons_title')}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{t('options.addons_title')}</p>
          {addons.map((a) => {
            const price = addonPrice(a)
            const max = addonMaxPerRegistration(a)
            return (
              <AddonRow
                key={a.id}
                def={a}
                qty={options.addons?.[a.id] ?? 0}
                left={addonAvailability && a.id in addonAvailability ? addonAvailability[a.id] : undefined}
                lng={i18n.language}
                priceText={pricingConfig.free || price === 0 ? t('options.addon_free') : `+${money(price)}${max > 1 ? ` / ${t('options.addon_each')}` : ''}`}
                onChange={(q) => setAddon(a.id, q)}
                t={t as unknown as (key: string, opts?: Record<string, unknown>) => string}
              />
            )
          })}
          {anyLimited && <p className="text-xs" style={{ color: 'var(--muted)' }}>{t('options.addon_limited_hint')}</p>}
        </div>
      )}

      {/* Darowizna na dofinansowanie pobytu innych — tylko gdy event ją włączył */}
      {pricingConfig.donationEnabled && !pricingConfig.free && (
        <div className="flex flex-col gap-2" role="group" aria-label={t('options.donation_title')}>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {t('options.donation_title')}
          </p>
          <div className="flex flex-wrap gap-2">
            {donationPresets.map((v) => {
              const active = !customOpen && donation === v
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pickPreset(v)}
                  className="px-4 py-[10px] text-sm font-semibold rounded-[12px] transition-all duration-150 active:scale-[0.97]"
                  style={chipStyle(active)}
                >
                  {money(v)}
                </button>
              )
            })}
            <button
              type="button"
              aria-pressed={customOpen}
              onClick={toggleCustom}
              className="px-4 py-[10px] text-sm font-semibold rounded-[12px] transition-all duration-150 active:scale-[0.97]"
              style={chipStyle(customOpen)}
            >
              {t('options.donation_custom')}
            </button>
          </div>
          {customOpen && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={customText}
                onChange={(e) => onCustomText(e.target.value)}
                placeholder="0"
                aria-label={t('options.donation_custom_label')}
                className="w-32 rounded-[12px] px-3 py-[13px] text-sm transition-all duration-150 focus:outline-none focus:ring-2"
                style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--ink)' }}
              />
              <span className="text-sm" style={{ color: 'var(--muted)' }}>
                {pricingConfig.currency && pricingConfig.currency !== 'PLN' ? pricingConfig.currency : 'zł'}
              </span>
            </div>
          )}
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {t('options.donation_hint')}
          </p>
        </div>
      )}

      {/* Discount code — ukryte, gdy event nie ma żadnego aktywnego kodu */}
      {discountVisible && (
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
          {t('options.discount_label')}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={discountCode}
            onChange={(e) => handleCodeChange(e.target.value)}
            placeholder={t('options.discount_placeholder')}
            className="flex-1 rounded-[12px] px-3 py-[13px] text-sm transition-all duration-150 focus:outline-none focus:ring-2 uppercase"
            style={{
              border: discountError
                ? '1px solid var(--err)'
                : '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--ink)',
            }}
          />
          <button
            onClick={applyDiscount}
            className="px-4 py-2 text-sm font-semibold rounded-[12px] transition-all duration-150 active:scale-[0.97] shrink-0"
            style={{
              background: 'var(--brand)',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {t('options.discount_apply')}
          </button>
        </div>

        {discountApplied && (
          <p className="text-xs font-medium" style={{ color: 'var(--ok)' }}>
            {t('options.discount_ok', { pct: discountPct })}
          </p>
        )}
        {discountError && (
          <p className="text-xs font-medium" style={{ color: 'var(--err)' }}>
            {t('options.discount_err')}
          </p>
        )}
      </div>
      )}

      {/* Consents */}
      <div className="flex flex-col gap-3 pt-1">
        {/* RODO */}
        <label className="flex items-start gap-3 cursor-pointer">
          <div
            className="flex items-center justify-center shrink-0 mt-0.5 rounded-[6px] transition-all duration-150"
            style={{
              width: 20,
              height: 20,
              border: consents.rodo ? '2px solid var(--brand)' : '2px solid var(--border)',
              background: consents.rodo ? 'var(--brand)' : 'transparent',
            }}
          >
            {consents.rodo && (
              <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                <path
                  d="M1 4L4 7L10 1"
                  stroke="white"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <input
            type="checkbox"
            className="sr-only"
            checked={consents.rodo}
            onChange={(e) => onConsentsChange({ ...consents, rodo: e.target.checked })}
          />
          <span className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
            {t('options.rodo')}{' '}
            <a href="/rodo" className="underline" style={{ color: 'var(--brand)' }}>
              {t('options.rodo_link')}
            </a>
          </span>
        </label>

        {/* Regulamin */}
        <label className="flex items-start gap-3 cursor-pointer">
          <div
            className="flex items-center justify-center shrink-0 mt-0.5 rounded-[6px] transition-all duration-150"
            style={{
              width: 20,
              height: 20,
              border: consents.regulamin ? '2px solid var(--brand)' : '2px solid var(--border)',
              background: consents.regulamin ? 'var(--brand)' : 'transparent',
            }}
          >
            {consents.regulamin && (
              <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                <path
                  d="M1 4L4 7L10 1"
                  stroke="white"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <input
            type="checkbox"
            className="sr-only"
            checked={consents.regulamin}
            onChange={(e) => onConsentsChange({ ...consents, regulamin: e.target.checked })}
          />
          <span className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
            {t('options.regulamin')}{' '}
            <a href="/regulamin" className="underline" style={{ color: 'var(--brand)' }}>
              {t('options.terms_link')}
            </a>
          </span>
        </label>
      </div>
    </div>
  )
}
