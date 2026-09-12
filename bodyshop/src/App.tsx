import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Header from './components/Header'
import BottomNav, { type TabType } from './components/BottomNav'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import ComplaintPage from './pages/ComplaintPage'
import EstimatePage from './pages/EstimatePage'
import InvoicesPage from './pages/InvoicesPage'
import GatePassPage from './pages/GatePassPage'
import FeedbackPage from './pages/FeedbackPage'
import { fetchCustomerVehicles, type CustomerVehicle } from './lib/api'
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

  // Save selected vehicle to local storage
  useEffect(() => {
    if (selectedVehicle) {
      localStorage.setItem('bodyshop_customer_vehicle', JSON.stringify(selectedVehicle))
    } else {
      localStorage.removeItem('bodyshop_customer_vehicle')
    }
  }, [selectedVehicle])

  // Live real-time sync for active vehicle data (KM reading, JC number, service type, advisor updates)
  useEffect(() => {
    if (!selectedVehicle?.reg_number) return

    async function refreshActiveVehicle() {
      if (!selectedVehicle?.reg_number) return
      try {
        const list = await fetchCustomerVehicles(selectedVehicle.reg_number)
        if (list && list.length > 0) {
          const fresh = list[0]
          setSelectedVehicle((prev) => {
            if (!prev) return fresh
            // Only update if something changed
            if (
              prev.km_reading !== fresh.km_reading ||
              prev.jc_number !== fresh.jc_number ||
              prev.service_type !== fresh.service_type ||
              prev.sa_name !== fresh.sa_name ||
              prev.payment_status !== fresh.payment_status
            ) {
              return fresh
            }
            return prev
          })
        }
      } catch (err) {
        console.warn('Live vehicle refresh error:', err)
      }
    }

    void refreshActiveVehicle()

    // Real-time Supabase channels
    const channel = supabase
      .channel(`active-vehicle-sync-${selectedVehicle.reg_number}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_reception_entries' },
        () => {
          void refreshActiveVehicle()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bodyshop_repair_cards' },
        () => {
          void refreshActiveVehicle()
        }
      )
      .subscribe()

    // Fallback polling every 4 seconds
    const interval = setInterval(() => {
      void refreshActiveVehicle()
    }, 4000)

    return () => {
      void supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [selectedVehicle?.reg_number])

  function handleLogin(vehicle: CustomerVehicle) {
    setSelectedVehicle(vehicle)
    setCurrentTab('dashboard')
  }

  function handleLogout() {
    setSelectedVehicle(null)
  }

  if (!selectedVehicle) {
    return (
      <div className="auth-wrapper">
        <AuthPage onLoginSuccess={handleLogin} />
      </div>
    )
  }

  return (
    <div className="website-container">
      <Header
        vehicleReg={selectedVehicle.reg_number}
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onLogout={handleLogout}
      />

      <main className="website-main">
        <div className="content-inner">
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
        </div>
      </main>

      <footer className="website-footer">
        <div className="footer-inner">
          <div>
            <strong>Techwheels Dealership Vehicle Services</strong> · Powered by Firstmobital
          </div>
          <div style={{ opacity: 0.8, fontSize: 12 }}>
            After-Purchase Service & Bodyshop Management System · SRD v1.0
          </div>
        </div>
      </footer>

      {/* Bottom Nav on Mobile Devices only */}
      <div className="mobile-only-nav">
        <BottomNav currentTab={currentTab} onSelectTab={setCurrentTab} />
      </div>
    </div>
  )
}
