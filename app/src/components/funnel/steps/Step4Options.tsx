import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatMoney, DONATION_PRESETS, DONATION_MAX, cleanDonation } from '@icpe/shared'
import type { PricingConfig } from '@icpe/shared'
import { Input } from '../../ui/Input'

interface Options {
  transport: boolean
  bedding: boolean
  /** dobrowolna darowizna (0 = brak) */
  donation: number
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

export default function Step4Options({
  options,
  discountCode,
  discountApplied,
  consents,
  pricingConfig,
  onOptionsChange,
  onDiscountChange,
  onDiscountApply,
  onConsentsChange,
}: Props) {
  const { t, i18n } = useTranslation()
  const money = (n: number) => formatMoney(n, pricingConfig.currency, i18n.language)
  const [discountError, setDiscountError] = useState(false)

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
    const isValid = code in pricingConfig.discountCodes
    setDiscountError(!isValid)
    onDiscountApply(isValid)
  }

  const handleCodeChange = (value: string) => {
    onDiscountChange(value)
    setDiscountError(false)
    if (discountApplied) onDiscountApply(false)
  }

  const discountPct = discountApplied
    ? Math.round((pricingConfig.discountCodes[discountCode.trim().toUpperCase()] ?? 0) * 100)
    : 0

  const transportPrice = pricingConfig.options.transport
  const beddingPrice = pricingConfig.options.bedding
  const showTransport = transportPrice > 0
  const showBedding = beddingPrice > 0

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

      {/* Discount code */}
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
