import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { initTheme } from './lib/theme'
import Spinner from './components/ui/Spinner'

const PublicFunnel = lazy(() => import('./pages/PublicFunnel'))
const AdminPanel = lazy(() => import('./pages/AdminPanel'))

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <Spinner size="lg" />
    </div>
  )
}

export default function App() {
  useEffect(() => {
    initTheme()
  }, [])

  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/r/:slug" element={<PublicFunnel />} />
          <Route path="/admin/*" element={<AdminPanel />} />
          <Route path="/" element={<Navigate to="/r/dzien-formacji-2026" replace />} />
          <Route path="*" element={<Navigate to="/r/dzien-formacji-2026" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
