import { useState } from 'react'
import { Sun, Moon, LogOut, User, Server, Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import { getAdminEmail } from '@/lib/api'
import { getTheme, setTheme as applyTheme } from '@/lib/theme'

const API_URL =
  (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_API_URL ?? ''

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-[15px] border overflow-hidden"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}
    >
      <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>
          {title}
        </p>
      </div>
      <div className="px-5 py-4 flex flex-col gap-4">{children}</div>
    </div>
  )
}

function Row({
  icon,
  label,
  desc,
  children,
}: {
  icon: React.ReactNode
  label: string
  desc?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="flex items-center justify-center rounded-[10px] shrink-0"
          style={{ width: 36, height: 36, background: 'var(--surface-2)', color: 'var(--muted)' }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
            {label}
          </p>
          {desc && (
            <p className="text-xs truncate" style={{ color: 'var(--faint)' }}>
              {desc}
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export default function SettingsScreen({ onLogout }: { onLogout: () => void }) {
  const email = getAdminEmail() ?? '—'
  const [theme, setThemeState] = useState<'light' | 'dark'>(getTheme())

  function chooseTheme(t: 'light' | 'dark') {
    applyTheme(t)
    setThemeState(t)
  }

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 640 }}>
      {/* Wygląd */}
      <Section title="Wygląd">
        <Row icon={theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />} label="Motyw" desc="Jasny lub ciemny wygląd panelu">
          <div
            className="flex items-center gap-1 p-1 rounded-[12px]"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            {([
              { id: 'light', label: 'Jasny', Icon: Sun },
              { id: 'dark', label: 'Ciemny', Icon: Moon },
            ] as const).map((opt) => {
              const active = theme === opt.id
              return (
                <button
                  key={opt.id}
                  onClick={() => chooseTheme(opt.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-sm font-medium transition-all duration-150"
                  style={
                    active
                      ? { background: 'var(--surface)', color: 'var(--brand)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
                      : { color: 'var(--muted)' }
                  }
                >
                  <opt.Icon size={14} />
                  {opt.label}
                  {active && <Check size={13} />}
                </button>
              )
            })}
          </div>
        </Row>
      </Section>

      {/* Konto */}
      <Section title="Konto">
        <Row icon={<User size={18} />} label={email} desc="Zalogowany administrator" />
        <div>
          <Button size="sm" variant="destructive" onClick={onLogout}>
            <LogOut size={14} /> Wyloguj
          </Button>
        </div>
      </Section>

      {/* System */}
      <Section title="System">
        <Row icon={<Server size={18} />} label="Adres API" desc={API_URL || 'nie ustawiono'} />
        <p className="text-xs" style={{ color: 'var(--faint)' }}>
          ICPE Mission — panel rejestracji. Zmiany w konfiguracji backendu (płatności, e-mail,
          keep-alive) ustawiasz po stronie Render.
        </p>
      </Section>
    </div>
  )
}
