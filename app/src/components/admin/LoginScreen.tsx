import { useState } from 'react'
import { adminLogin, setAuthToken } from '@/lib/api'

interface LoginScreenProps {
  onLogin: () => void
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { accessToken } = await adminLogin(email, password)
      setAuthToken(accessToken)
      onLogin()
    } catch {
      setError('Nieprawidłowy e-mail lub hasło. Spróbuj ponownie.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="w-full max-w-sm rounded-[20px] border p-8 flex flex-col gap-6"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
        }}
      >
        {/* Logo + header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src="/icpe-logo.png"
            alt="ICPE Mission"
            style={{ height: 44, objectFit: 'contain' }}
            onError={(e) => {
              const target = e.currentTarget
              target.style.display = 'none'
              const next = target.nextElementSibling as HTMLElement | null
              if (next) next.style.display = 'flex'
            }}
          />
          <div
            className="items-center justify-center rounded-[14px] font-bold text-white text-lg"
            style={{
              display: 'none',
              width: 44,
              height: 44,
              background: 'var(--brand)',
            }}
          >
            IC
          </div>
          <div>
            <h1
              className="font-bold leading-tight"
              style={{
                fontFamily: 'Newsreader, Georgia, serif',
                fontSize: 22,
                color: 'var(--ink)',
              }}
            >
              Panel administratora ICPE
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              Zaloguj się, aby zarządzać eventami i zgłoszeniami
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="admin-email"
              className="text-sm font-medium"
              style={{ color: 'var(--ink)' }}
            >
              E-mail
            </label>
            <input
              id="admin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@icpemission.pl"
              className="px-3 py-2.5 rounded-[10px] border text-sm outline-none transition-all"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--ink)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--brand)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="admin-password"
              className="text-sm font-medium"
              style={{ color: 'var(--ink)' }}
            >
              Hasło
            </label>
            <input
              id="admin-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="px-3 py-2.5 rounded-[10px] border text-sm outline-none transition-all"
              style={{
                background: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--ink)',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--brand)')}
              onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          {error && (
            <div
              className="px-3 py-2.5 rounded-[10px] text-sm"
              style={{ background: 'var(--err-soft)', color: 'var(--err)' }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-[10px] font-semibold text-sm text-white transition-opacity"
            style={{
              background: 'var(--brand)',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Logowanie…' : 'Zaloguj się'}
          </button>
        </form>
      </div>
    </div>
  )
}
