import { useState, useEffect } from 'react'
import { AUTH_CHANGED_EVENT, hasValidAdminToken, maybeRenewAdminToken, setAuthToken } from '@/lib/api'
import LoginScreen from '@/components/admin/LoginScreen'
import AdminSidebar from '@/components/admin/AdminSidebar'
import PageHeader from '@/components/admin/PageHeader'
import EmptyModuleState from '@/components/admin/EmptyModuleState'
import DashboardScreen from '@/components/admin/dashboard/DashboardScreen'
import EventsScreen from '@/components/admin/events/EventsScreen'
import RegistrationsScreen from '@/components/admin/registrations/RegistrationsScreen'
import SettingsScreen from '@/components/admin/settings/SettingsScreen'
import AttendanceScreen from '@/components/admin/attendance/AttendanceScreen'
import AccommodationScreen from '@/components/admin/accommodation/AccommodationScreen'
import PaymentsScreen from '@/components/admin/payments/PaymentsScreen'
import CoursesScreen from '@/components/admin/courses/CoursesScreen'

type AdminScreen =
  | 'dashboard'
  | 'events'
  | 'registrations'
  | 'accommodation'
  | 'payments'
  | 'attendance'
  | 'courses'
  | 'settings'

const SCREEN_TITLES: Record<AdminScreen, { title: string; subtitle?: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Przegląd aktywności i kluczowych wskaźników' },
  events: { title: 'Eventy', subtitle: 'Zarządzaj sesjami i edycjami wydarzeń' },
  registrations: { title: 'Zgłoszenia', subtitle: 'Przeglądaj i zarządzaj zgłoszeniami uczestników' },
  accommodation: { title: 'Zakwaterowanie', subtitle: 'Zarządzaj pokojami i przydziałami' },
  payments: { title: 'Płatności', subtitle: 'Historia transakcji i rozliczenia' },
  attendance: { title: 'Obecność', subtitle: 'Lista obecności i weryfikacja uczestników' },
  courses: { title: 'Formacja online', subtitle: 'Kursy online: filmy, materiały PDF i dostęp kursantów' },
  settings: { title: 'Ustawienia', subtitle: 'Konfiguracja systemu i konta' },
}

export default function AdminPanel() {
  // Wygasły token = od razu ekran logowania (zamiast panelu, który po chwili sypie błędami 401).
  const [authed, setAuthed] = useState(() => {
    if (hasValidAdminToken()) return true
    setAuthToken(null)
    return false
  })
  const [view, setView] = useState<AdminScreen>('dashboard')
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    if (authed) {
      document.title = 'Panel administratora — ICPE Mission'
    }
  }, [authed])

  // 401 z dowolnego zapytania (setAuthToken(null)) → ekran logowania.
  useEffect(() => {
    const onChange = () => setAuthed(hasValidAdminToken())
    window.addEventListener(AUTH_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, onChange)
  }, [])

  // Sesja przesuwna: przedłużaj token przy wejściu, co godzinę i po powrocie do karty.
  useEffect(() => {
    if (!authed) return
    void maybeRenewAdminToken()
    const h = window.setInterval(() => void maybeRenewAdminToken(), 60 * 60 * 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void maybeRenewAdminToken()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(h)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [authed])

  function handleLogin() {
    setAuthed(true)
  }

  function handleLogout() {
    setAuthToken(null)
    setAuthed(false)
  }

  function handleNavigate(screen: AdminScreen) {
    setView(screen)
    // Close wizard when navigating away from events
    if (screen !== 'events') {
      setShowWizard(false)
    }
  }

  if (!authed) {
    return <LoginScreen onLogin={handleLogin} />
  }

  const { title, subtitle } = SCREEN_TITLES[view]

  function renderContent() {
    switch (view) {
      case 'dashboard':
        return <DashboardScreen />
      case 'events':
        return (
          <EventsScreen
            showWizard={showWizard}
            onOpenWizard={() => setShowWizard(true)}
            onCloseWizard={() => setShowWizard(false)}
          />
        )
      case 'registrations':
        return <RegistrationsScreen />
      case 'accommodation':
        return <AccommodationScreen />
      case 'payments':
        return <PaymentsScreen />
      case 'attendance':
        return <AttendanceScreen />
      case 'courses':
        return <CoursesScreen />
      case 'settings':
        return <SettingsScreen onLogout={handleLogout} />
      default:
        return <EmptyModuleState />
    }
  }

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* Sidebar */}
      <AdminSidebar
        activeScreen={view}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />

      {/* Main content area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Page header — hidden when wizard is open (wizard has its own breadcrumb) */}
        {!(view === 'events' && showWizard) && (
          <PageHeader
            title={title}
            subtitle={subtitle}
          />
        )}

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-8">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}
