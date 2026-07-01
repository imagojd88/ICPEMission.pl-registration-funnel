import { useTranslation } from 'react-i18next'
import { pickLang, type EventTheme } from '@/lib/api'

interface Props {
  isOpen: boolean
  theme?: EventTheme
  title?: string
}

export default function LandingHero({ isOpen, theme, title }: Props) {
  const { t, i18n } = useTranslation()

  const supertitle = pickLang(theme?.supertitle, i18n.language)
  const heroImageUrl = theme?.heroImageUrl
  const titleColor = theme?.titleColor

  const backgroundStyle = heroImageUrl
    ? {
        backgroundImage: `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.45)), url(${heroImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : {
        background: 'linear-gradient(160deg, var(--hero-1), var(--hero-2))',
      }

  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: 300,
        ...backgroundStyle,
      }}
    >
      {/* Stripe overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 12px)',
        }}
      />

      {/* Decorative circles */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
          top: -80,
          right: -80,
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)',
          bottom: -60,
          left: -40,
        }}
      />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col justify-between px-5 pt-5 pb-6">
        {/* Top row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Glassmorphism pill */}
          <span
            className="text-white text-xs font-semibold px-3 py-1.5 backdrop-blur-sm"
            style={{
              background: 'rgba(255,255,255,0.16)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 99,
            }}
          >
            {theme?.badge || t('landing.pill')}
          </span>

          {/* Status badge */}
          {isOpen ? (
            <span
              className="text-white text-xs font-semibold px-3 py-1.5"
              style={{ background: 'var(--accent)', borderRadius: 99 }}
            >
              {t('landing.badge_open')}
            </span>
          ) : (
            <span
              className="text-xs font-semibold px-3 py-1.5"
              style={{
                background: 'var(--warn-soft)',
                color: 'var(--warn)',
                borderRadius: 99,
              }}
            >
              {t('landing.badge_closed')}
            </span>
          )}
        </div>

        {/* Bottom text */}
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>
            {supertitle || t('landing.supertitle')}
          </p>
          <h1
            className="font-serif leading-tight"
            style={{
              fontSize: 38,
              fontWeight: 500,
              color: titleColor ?? 'var(--hero-title)',
              lineHeight: 1.15,
            }}
          >
            {title || t('landing.title')}
          </h1>
        </div>
      </div>
    </div>
  )
}
