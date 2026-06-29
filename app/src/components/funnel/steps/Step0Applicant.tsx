import { useTranslation } from 'react-i18next'
import { Input } from '../../ui/Input'
import type { Applicant } from '../../../pages/PublicFunnel'

interface Props {
  value: Applicant
  onChange: (value: Applicant) => void
}

export default function Step0Applicant({ value, onChange }: Props) {
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
          placeholder="Jan"
        />
        <Input
          label={t('applicant.lastName')}
          value={value.lastName}
          onChange={set('lastName')}
          autoComplete="family-name"
          placeholder="Kowalski"
        />
      </div>

      {/* Email */}
      <Input
        label={t('applicant.email')}
        type="email"
        value={value.email}
        onChange={set('email')}
        autoComplete="email"
        placeholder="jan@example.com"
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
        placeholder="ul. Przykładowa 1, 00-001 Warszawa"
      />
    </div>
  )
}
