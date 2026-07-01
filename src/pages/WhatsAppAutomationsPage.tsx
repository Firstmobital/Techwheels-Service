import { useState } from 'react'
import AutoServiceReminderPage from './AutoServiceReminderPage'
import PostServiceFeedbackPage from './PostServiceFeedbackPage'

type Tab = 'reminders' | 'feedback'

export default function WhatsAppAutomationsPage() {
  const [tab, setTab] = useState<Tab>('reminders')

  return (
    <div>
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex gap-6">
          <button
            onClick={() => setTab('reminders')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'reminders'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Service Reminders
          </button>
          <button
            onClick={() => setTab('feedback')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === 'feedback'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Post-Service Feedback
          </button>
        </div>
      </div>

      {tab === 'reminders' ? <AutoServiceReminderPage /> : <PostServiceFeedbackPage />}
    </div>
  )
}
