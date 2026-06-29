import { useState } from 'react'
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  BedDouble,
  CreditCard,
  UserCheck,
  Settings,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react'
import { toggleTheme, getTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

type AdminScreen =
  | 'dashboard'
  | 'events'
  | 'registrations'
  | 'accommodation'
  | 'payments'
  | 'attendance'
  | 'settings'

interface NavItem {
  id: AdminScreen
  label: string
  icon: React.ElementType
  badge?: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'events', label: 'Eventy', icon: CalendarDays },
  { id: 'registrations', label: 'Zgłoszenia', icon: ClipboardList, badge: '52' },
  { id: 'accommodation', label: 'Zakwaterowanie', icon: BedDouble },
  { id: 'payments', label: 'Płatności', icon: CreditCard },
  { id: 'attendance', label: 'Obecność', icon: UserCheck },
  { id: 'settings', label: 'Ustawienia', icon: Settings },
]

interface AdminSidebarProps {
  activeScreen: AdminScreen
  onNavigate: (screen: AdminScreen) => void
  onLogout?: () => void
}

export default function AdminSidebar({ activeScreen, onNavigate, onLogout }: AdminSidebarProps) {
  const [isDark, setIsDark] = useState(() => getTheme() === 'dark')

  function handleThemeToggle() {
    toggleTheme()
    setIsDark(getTheme() === 'dark')
  }

  return (
    <aside
      className="flex flex-col h-full shrink-0"
      style={{
        width: 250,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <img
          src="/icpe-logo.png"
          alt="ICPE Mission"
          style={{ height: 32, objectFit: 'contain' }}
          onError={(e) => {
            const target = e.currentTarget
            target.style.display = 'none'
            const next = target.nextElementSibling as HTMLElement | null
            if (next) next.style.display = 'flex'
          }}
        />
        <div
          className="items-center justify-center rounded-[10px] font-bold text-white text-sm"
          style={{
            display: 'none',
            width: 32,
            height: 32,
            background: 'var(--brand)',
          }}
        >
          IC
        </div>
        <div>
          <p className="font-bold text-sm leading-tight" style={{ color: 'var(--ink)' }}>
            ICPE Mission
          </p>
          <p className="text-xs" style={{ color: 'var(--faint)' }}>
            Admin
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <p
          className="px-2 mb-2 font-semibold tracking-widest uppercase"
          style={{ fontSize: 11, color: 'var(--faint)' }}
        >
          Organizacja
        </p>

        <ul className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = activeScreen === item.id
            const Icon = item.icon
            return (
              <li key={item.id}>
                <button
                  onClick={() => onNavigate(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-sm font-medium transition-all duration-150 text-left',
                    isActive
                      ? 'font-semibold'
                      : 'hover:bg-[var(--surface-2)]',
                  )}
                  style={
                    isActive
                      ? {
                          background: 'var(--brand-soft)',
                          color: 'var(--brand)',
                          borderLeft: '3px solid var(--brand)',
                          paddingLeft: 9, // 12 - 3 border
                        }
                      : { color: 'var(--muted)' }
                  }
                >
                  <Icon size={17} style={{ flexShrink: 0 }} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span
                      className="inline-flex items-center justify-center rounded-full text-xs font-bold px-1.5 py-0.5 min-w-[22px]"
                      style={{
                        background: 'var(--warn-soft)',
                        color: 'var(--warn)',
                        fontSize: 11,
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Dev tools: theme + lang */}
      <div
        className="px-4 py-2 flex items-center gap-2"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <button
          onClick={handleThemeToggle}
          className="flex items-center gap-1.5 px-2 py-1 rounded-[8px] text-xs transition-colors hover:bg-[var(--surface-2)]"
          style={{ color: 'var(--faint)' }}
          title="Przełącz motyw"
        >
          {isDark ? <Sun size={13} /> : <Moon size={13} />}
          <span>{isDark ? 'Jasny' : 'Ciemny'}</span>
        </button>
        <span style={{ color: 'var(--border)', fontSize: 12 }}>|</span>
        <span className="text-xs" style={{ color: 'var(--faint)' }}>
          PL
        </span>
      </div>

      {/* User card */}
      <div
        className="px-3 py-3"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3 px-2 py-2 rounded-[12px] hover:bg-[var(--surface-2)] transition-colors">
          <div
            className="flex items-center justify-center rounded-full text-xs font-bold text-white shrink-0"
            style={{ width: 36, height: 36, background: 'var(--brand)' }}
          >
            JP
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
              Jan Paweł
            </p>
            <p className="text-xs" style={{ color: 'var(--faint)' }}>
              Admin
            </p>
          </div>
          <button
            className="p-1 rounded-[8px] hover:bg-[var(--surface-3)] transition-colors"
            style={{ color: 'var(--faint)' }}
            title="Wyloguj"
            onClick={onLogout}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}
