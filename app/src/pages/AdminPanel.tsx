import { useState, useEffect } from 'react'
import { getAuthToken, setAuthToken } from '@/lib/api'
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

type AdminScreen =
  | 'dashboard'
  | 'events'
  | 'registrations'
  | 'accommodation'
  | 'payments'
  | 'attendance'
  | 'settings'

const SCREEN_TITLES: Record<AdminScreen, { title: string; subtitle?: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Przegląd aktywności i kluczowych wskaźników' },
  events: { title: 'Eventy', subtitle: 'Zarządzaj sesjami i edycjami wydarzeń' },
  registrations: { title: 'Zgłoszenia', subtitle: 'Przeglądaj i zarządzaj zgłoszeniami uczestników' },
  accommodation: { title: 'Zakwaterowanie', subtitle: 'Zarządzaj pokojami i przydziałami' },
  payments: { title: 'Płatności', subtitle: 'Historia transakcji i rozliczenia' },
  attendance: { title: 'Obecność', subtitle: 'Lista obecności i weryfikacja uczestników' },
  settings: { title: 'Ustawienia', subtitle: 'Konfiguracja systemu i konta' },
}

export default function AdminPanel() {
  const [authed, setAuthed] = useState(!!getAuthToken())
  const [view, setView] = useState<AdminScreen>('dashboard')
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    if (authed) {
      document.title = 'Panel administratora — ICPE Mission'
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
