import { useState } from 'react'
import AutoServiceReminderPage from './AutoServiceReminderPage'
import PostServiceFeedbackPage from './PostServiceFeedbackPage'
import EWRenewalReminderPage from './EWRenewalReminderPage'
import EWServiceReminderPage from './EWServiceReminderPage'
import UpdationReminderPage from './UpdationReminderPage'

type Tab = 'reminders' | 'feedback' | 'ew_renewal' | 'ew_service_reminder' | 'updation_reminder'

export default function WhatsAppAutomationsPage() {
  const [tab, setTab] = useState<Tab>('reminders')

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'reminders',           label: 'Service Reminders' },
    { key: 'feedback',            label: 'Post-Service Feedback' },
    { key: 'ew_renewal',          label: 'EW Renewal' },
    { key: 'ew_service_reminder', label: 'EW Service Reminder' },
    { key: 'updation_reminder',   label: 'Updation Reminder' },
  ]

  return (
    <div>
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex gap-6">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'reminders' && <AutoServiceReminderPage />}
      {tab === 'feedback' && <PostServiceFeedbackPage />}
      {tab === 'ew_renewal' && <EWRenewalReminderPage />}
      {tab === 'ew_service_reminder' && <EWServiceReminderPage />}
      {tab === 'updation_reminder' && <UpdationReminderPage />}
    </div>
  )
}
