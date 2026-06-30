export function getTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function toggleTheme() {
  document.documentElement.classList.toggle('dark')
  localStorage.setItem('theme', getTheme())
}

/** Jawny wybór motywu (np. z przełącznika w Ustawieniach / na stronie publicznej). */
export function setTheme(theme: 'light' | 'dark') {
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
  try {
    localStorage.setItem('theme', theme)
  } catch {
    /* localStorage może być niedostępny */
  }
}

export function initTheme() {
  const saved = localStorage.getItem('theme')
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark')
  }
}
