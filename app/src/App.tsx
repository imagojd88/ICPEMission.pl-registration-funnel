import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { initTheme } from './lib/theme'
import Spinner from './components/ui/Spinner'

const PublicFunnel = lazy(() => import('./pages/PublicFunnel'))
const AdminPanel = lazy(() => import('./pages/AdminPanel'))
const PublicHome = lazy(() => import('./pages/PublicHome'))

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
          {/* Wejście panelu przez prawdziwy plik panel.html — omija zatruty cache
              hostingu (LiteSpeed cache trzyma stare /admin i /index.html). */}
          <Route path="/panel.html" element={<AdminPanel />} />
          <Route path="/admin/*" element={<AdminPanel />} />
          <Route path="/" element={<PublicHome />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
