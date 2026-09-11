import { useState, useEffect } from 'react'
import Header from './components/Header'
import BottomNav, { type TabType } from './components/BottomNav'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import ComplaintPage from './pages/ComplaintPage'
import EstimatePage from './pages/EstimatePage'
import InvoicesPage from './pages/InvoicesPage'
import GatePassPage from './pages/GatePassPage'
import FeedbackPage from './pages/FeedbackPage'
import { type CustomerVehicle } from './lib/api'
import './App.css'

export default function App() {
  const [selectedVehicle, setSelectedVehicle] = useState<CustomerVehicle | null>(() => {
    const saved = localStorage.getItem('bodyshop_customer_vehicle')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return null
      }
    }
    return null
  })

  const [currentTab, setCurrentTab] = useState<TabType>('dashboard')

  useEffect(() => {
    if (selectedVehicle) {
      localStorage.setItem('bodyshop_customer_vehicle', JSON.stringify(selectedVehicle))
    } else {
      localStorage.removeItem('bodyshop_customer_vehicle')
    }
  }, [selectedVehicle])

  function handleLogin(vehicle: CustomerVehicle) {
    setSelectedVehicle(vehicle)
    setCurrentTab('dashboard')
  }

  function handleLogout() {
    setSelectedVehicle(null)
  }

  if (!selectedVehicle) {
    return (
      <div className="app-container">
        <AuthPage onLoginSuccess={handleLogin} />
      </div>
    )
  }

  return (
    <div className="app-container">
      <Header vehicleReg={selectedVehicle.reg_number} onLogout={handleLogout} />

      <main className="main-content">
        {currentTab === 'dashboard' && (
          <DashboardPage vehicle={selectedVehicle} onNavigate={setCurrentTab} />
        )}
        {currentTab === 'complaint' && (
          <ComplaintPage vehicle={selectedVehicle} onSuccess={() => setCurrentTab('dashboard')} />
        )}
        {currentTab === 'estimate' && (
          <EstimatePage vehicle={selectedVehicle} />
        )}
        {currentTab === 'invoices' && (
          <InvoicesPage vehicle={selectedVehicle} />
        )}
        {currentTab === 'gatepass' && (
          <GatePassPage vehicle={selectedVehicle} />
        )}
        {currentTab === 'feedback' && (
          <FeedbackPage vehicle={selectedVehicle} />
        )}
      </main>

      <BottomNav currentTab={currentTab} onSelectTab={setCurrentTab} />
    </div>
  )
}
