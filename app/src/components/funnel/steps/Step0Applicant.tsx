import { useTranslation } from 'react-i18next'
import { Input } from '../../ui/Input'
import type { Applicant } from '../../../pages/PublicFunnel'
import { COMMUNITY_GROUPS, COMMUNITY_OTHER, type AffiliationField } from '../../../lib/communities'

interface Props {
  value: Applicant
  onChange: (value: Applicant) => void
  /** Pole przynależności dla tego eventu: parafia (tekst) / wspólnota (lista) / brak. */
  affiliation?: AffiliationField | null
}

export default function Step0Applicant({ value, onChange, affiliation }: Props) {
  const { t } = useTranslation()

  const set = (key: keyof Applicant) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, [key]: e.target.value })
  }

  const emailLooksValid = value.email.includes('@') && value.email.includes('.')

  return (
    <div className="flex flex-col gap-4 px-[22px] py-5">
      <h2 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
        {t('stepper.step0')}
      </h2>

      {/* First name + Last name grid */}
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t('applicant.firstName')}
          value={value.firstName}
          onChange={set('firstName')}
          autoComplete="given-name"
          placeholder={t('applicant.first_ph')}
        />
        <Input
          label={t('applicant.lastName')}
          value={value.lastName}
          onChange={set('lastName')}
          autoComplete="family-name"
          placeholder={t('applicant.last_ph')}
        />
      </div>

      {/* Email */}
      <Input
        label={t('applicant.email')}
        type="email"
        value={value.email}
        onChange={set('email')}
        autoComplete="email"
        placeholder={t('applicant.email_ph')}
        hint={emailLooksValid ? t('applicant.email_hint') : undefined}
      />

      {/* Phone */}
      <Input
        label={t('applicant.phone')}
        type="tel"
        value={value.phone}
        onChange={set('phone')}
        autoComplete="tel"
        placeholder="+48 600 000 000"
      />

      {/* Address */}
      <Input
        label={t('applicant.address')}
        value={value.address}
        onChange={set('address')}
        autoComplete="street-address"
        placeholder={t('applicant.address_ph')}
      />

      {/* Parafia — pole tekstowe */}
      {affiliation === 'parish' && (
        <Input
          label={t('community.parish')}
          value={value.parish ?? ''}
          onChange={set('parish')}
          placeholder={t('community.parish_ph')}
        />
      )}

      {/* Wspólnota — lista z sekcjami; „Inna" odsłania pole do wpisania */}
      {affiliation === 'community' && (
        <div className="flex flex-col gap-1.5 w-full">
          <label htmlFor="community" className="text-sm font-medium text-[var(--ink)]">
            {t('community.label')}
          </label>
          <select
            id="community"
            value={value.community ?? ''}
            onChange={(e) => onChange({ ...value, community: e.target.value })}
            className="w-full rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-[13px] text-sm focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--ring)]"
            style={{ color: value.community ? 'var(--ink)' : 'var(--faint)' }}
          >
            <option value="" disabled>
              {t('community.choose')}
            </option>
            {COMMUNITY_GROUPS.map((g) => (
              <optgroup key={g.id} label={t(`community.group_${g.id}`)}>
                {g.names.map((n) => (
                  <option key={n} value={n} style={{ color: 'var(--ink)' }}>
                    {n}
                  </option>
                ))}
                {/* „Inna" — na końcu sekcji Polska (jak na liście od organizatorów) */}
                {g.id === 'pl' && (
                  <option value={COMMUNITY_OTHER} style={{ color: 'var(--ink)' }}>
                    {t('community.other')}
                  </option>
                )}
              </optgroup>
            ))}
          </select>
          {value.community === COMMUNITY_OTHER && (
            <Input
              aria-label={t('community.other_label')}
              value={value.communityOther ?? ''}
              onChange={set('communityOther')}
              placeholder={t('community.other_ph')}
              autoFocus
            />
          )}
        </div>
      )}
    </div>
  )
}
