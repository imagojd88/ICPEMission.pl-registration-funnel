import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LogOut, Moon, Sun } from 'lucide-react'
import { AUTH_CHANGED_EVENT } from '@/lib/api'
import { DESK_AUTH_EVENT, DeskError, deskLogin, deskMe, deskSession, setDeskToken, type DeskMe } from '@/lib/deskApi'
import { getTheme, setTheme } from '@/lib/theme'
import DeskEvent from '@/components/desk/DeskEvent'
import { BigButton, DESK_LANGS, Notice, fieldStyle, fmtDateRange, initialDeskLang, saveDeskLang, titleOf, type DeskLang } from '@/components/desk/deskUi'

/** Logowanie do recepcji: pomocnik eventu albo admin (ten sam e-mail i hasło co w panelu). */
function DeskLogin() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await deskLogin(email.trim(), password)
    } catch (err) {
      const kind = err instanceof DeskError ? err.kind : 'server'
      setError(t(kind === 'offline' ? 'desk.login.error_offline' : kind === 'server' ? 'desk.errors.server' : 'desk.login.error_bad'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-[20px] p-6 mt-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 8px 40px rgba(0,0,0,0.08)' }}>
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{t('desk.login.greeting')}</p>
        <h1 className="font-bold" style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: 24, color: 'var(--ink)' }}>{t('desk.login.title')}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{t('desk.login.subtitle')}</p>
      </div>
      {error && <Notice tone="err">{error}</Notice>}
      <label className="flex flex-col gap-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>
        E-mail
        <input type="email" required autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>
        {t('desk.login.password')}
        <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={fieldStyle} />
      </label>
      <BigButton type="submit" tone="brand" disabled={busy}>
        {busy ? t('desk.common.loading') : t('desk.login.submit')}
      </BigButton>
    </form>
  )
}

/** Lista eventów, do których zalogowana osoba ma dostęp. */
function DeskEvents({ onLoaded }: { onLoaded: (me: DeskMe) => void }) {
  const { t, i18n } = useTranslation()
  const lng = i18n.language
  const navigate = useNavigate()
  const [me, setMe] = useState<DeskMe | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let off = false
    deskMe()
      .then((m) => {
        if (off) return
        onLoaded(m)
        // Pomocnik z jednym eventem trafia od razu do niego.
        if (!m.full && m.events.length === 1) navigate(`/recepcja/${m.events[0].instanceId}`, { replace: true })
        else setMe(m)
      })
      .catch((e: unknown) => {
        if (off) return
        const kind = e instanceof DeskError ? e.kind : 'server'
        if (kind !== 'auth') setError(t(kind === 'offline' ? 'desk.offline.first_load' : 'desk.errors.server'))
      })
    return () => {
      off = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) return <Notice tone="warn">{error}</Notice>
  if (!me) return <p className="text-sm py-8 text-center" style={{ color: 'var(--faint)' }}>{t('desk.common.loading')}</p>

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-bold" style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: 24, color: 'var(--ink)' }}>{t('desk.events.heading')}</h1>
      {me.events.length === 0 && <Notice tone="warn">{t('desk.events.none')}</Notice>}
      {me.events.map((ev) => (
        <Link key={ev.instanceId} to={`/recepcja/${ev.instanceId}`} className="block rounded-[16px] px-4 py-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', textDecoration: 'none' }}>
          <span className="block font-bold" style={{ color: 'var(--ink)', fontSize: 18 }}>{titleOf(ev.title, lng)}</span>
          <span className="block text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
            {[fmtDateRange(ev.startsAt, ev.endsAt, lng), ev.location].filter(Boolean).join(' · ')}
          </span>
          <span className="block text-sm font-semibold mt-2" style={{ color: 'var(--brand)' }}>{t('desk.events.open')} →</span>
        </Link>
      ))}
    </div>
  )
}

/**
 * Recepcja — stanowisko przyjęć gości (`/recepcja`, `/recepcja/:instanceId`).
 * Osobny frontend pod telefon i tablet; nie ładuje nic z panelu admina.
 */
export default function DeskPage() {
  const { instanceId } = useParams()
  const { t, i18n } = useTranslation()
  const [sessionKey, setSessionKey] = useState(() => deskSession()?.token ?? null)
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => getTheme())
  const [lang, setLang] = useState<DeskLang>(() => initialDeskLang())
  const [multi, setMulti] = useState(true)

  useEffect(() => {
    const sync = () => setSessionKey(deskSession()?.token ?? null)
    window.addEventListener(DESK_AUTH_EVENT, sync)
    window.addEventListener(AUTH_CHANGED_EVENT, sync)
    // wygasanie tokenu w otwartej karcie
    const h = window.setInterval(sync, 60_000)
    return () => {
      window.removeEventListener(DESK_AUTH_EVENT, sync)
      window.removeEventListener(AUTH_CHANGED_EVENT, sync)
      window.clearInterval(h)
    }
  }, [])

  useEffect(() => {
    if (i18n.language !== lang) void i18n.changeLanguage(lang)
  }, [lang, i18n])

  useEffect(() => {
    document.title = `${t('desk.title')} — ICPE Mission`
  }, [t, lang])

  const session = sessionKey ? deskSession() : null

  function pickLang(l: DeskLang) {
    saveDeskLang(l)
    setLang(l)
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="sticky top-0 z-20" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto max-w-2xl px-4 py-2 flex items-center gap-2">
          <Link to="/recepcja" className="font-bold mr-auto truncate" style={{ color: 'var(--brand)', fontSize: 17, textDecoration: 'none' }}>
            {t('desk.title')}
          </Link>
          <div className="flex rounded-[10px] overflow-hidden" style={{ border: '1px solid var(--border)' }} role="group" aria-label={t('desk.top.language')}>
            {DESK_LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => pickLang(l)}
                aria-pressed={lang === l}
                className="font-semibold text-sm"
                style={{ minWidth: 40, minHeight: 40, cursor: 'pointer', border: 'none', background: lang === l ? 'var(--brand)' : 'transparent', color: lang === l ? '#fff' : 'var(--ink)' }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" onClick={toggleTheme} aria-label={t('desk.top.theme')} title={t('desk.top.theme')} className="inline-flex items-center justify-center rounded-[10px]" style={{ width: 40, height: 40, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)', cursor: 'pointer' }}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          {session?.source === 'desk' && (
            <button type="button" onClick={() => setDeskToken(null)} aria-label={t('desk.top.logout')} title={t('desk.top.logout')} className="inline-flex items-center justify-center rounded-[10px]" style={{ width: 40, height: 40, border: '1px solid var(--border)', background: 'transparent', color: 'var(--ink)', cursor: 'pointer' }}>
              <LogOut size={17} />
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4" style={{ paddingBottom: 'calc(32px + env(safe-area-inset-bottom, 0px))' }}>
        {!session ? (
          <DeskLogin />
        ) : instanceId ? (
          <DeskEvent key={`${instanceId}:${sessionKey}`} instanceId={instanceId} showBack={multi} />
        ) : (
          <DeskEvents key={sessionKey} onLoaded={(m) => setMulti(m.full || m.events.length !== 1)} />
        )}
        {session && (
          <p className="text-xs text-center mt-6" style={{ color: 'var(--faint)' }}>
            {t('desk.top.logged_as', { email: session.email ?? '' })}
          </p>
        )}
      </main>
    </div>
  )
}
