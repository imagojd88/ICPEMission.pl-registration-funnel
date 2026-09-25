import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { initTheme } from './lib/theme'
import Spinner from './components/ui/Spinner'

const PublicFunnel = lazy(() => import('./pages/PublicFunnel'))
const AdminPanel = lazy(() => import('./pages/AdminPanel'))
const PublicHome = lazy(() => import('./pages/PublicHome'))
const InviteConfirm = lazy(() => import('./pages/InviteConfirm'))
const GuestInvitePage = lazy(() => import('./pages/GuestInvitePage'))

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
          <Route path="/i/:token" element={<InviteConfirm />} />
          {/* „Zaproś gościa" — osobisty link uczestnika (token zaproszenia lub zgłoszenia). */}
          <Route path="/g/:token" element={<GuestInvitePage />} />
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
