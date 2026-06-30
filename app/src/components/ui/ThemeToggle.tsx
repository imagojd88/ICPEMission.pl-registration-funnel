import { useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { getTheme, setTheme } from '@/lib/theme'

/** Pływający przełącznik motywu (jasny/ciemny) dla stron publicznych. */
export default function ThemeToggle() {
  const [theme, setThemeState] = useState<'light' | 'dark'>(getTheme())

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Włącz jasny motyw' : 'Włącz ciemny motyw'}
      title={theme === 'dark' ? 'Jasny motyw' : 'Ciemny motyw'}
      className="fixed z-50 flex items-center justify-center rounded-full transition-all duration-150 active:scale-95"
      style={{
        top: 'calc(12px + env(safe-area-inset-top, 0px))',
        right: 12,
        width: 38,
        height: 38,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        color: 'var(--ink)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
        cursor: 'pointer',
      }}
    >
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}
