// ============================================================================
// COMPLAINTS MODULE — REUSABLE COMPONENTS
// ============================================================================

import React from 'react'
import type { ComplaintStatus, ComplaintPriority, SlaStatus } from './types'

// ── Status Badge ─────────────────────────────────────────────────────────
export const StatusBadge: React.FC<{ status: ComplaintStatus }> = ({ status }) => {
  const statusConfig: Record<
    ComplaintStatus,
    { bg: string; text: string; label: string }
  > = {
    new: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'New' },
    acknowledged: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Acknowledged' },
    in_progress: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'In Progress' },
    resolved: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Resolved' },
    closed: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Closed' },
    reopened: { bg: 'bg-red-100', text: 'text-red-700', label: 'Reopened' },
  }

  const config = statusConfig[status]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  )
}

// ── Priority Badge ───────────────────────────────────────────────────────
export const PriorityBadge: React.FC<{ priority: ComplaintPriority }> = ({ priority }) => {
  const priorityConfig: Record<
    ComplaintPriority,
    { bg: string; text: string; label: string }
  > = {
    low: { bg: 'bg-green-100', text: 'text-green-700', label: 'Low' },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Medium' },
    high: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'High' },
    urgent: { bg: 'bg-red-100', text: 'text-red-700', label: 'Urgent' },
  }

  const config = priorityConfig[priority]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  )
}

// ── SLA Status Badge ─────────────────────────────────────────────────────
export const SLAStatusBadge: React.FC<{ status: SlaStatus }> = ({ status }) => {
  const config: Record<SlaStatus, { icon: string; label: string; color: string }> = {
    ok: { icon: '✓', label: 'On Track', color: 'text-green-600' },
    warning: { icon: '⚠', label: 'Due Soon', color: 'text-amber-600' },
    breached: { icon: '✕', label: 'Breached', color: 'text-red-600' },
  }

  const c = config[status]
  return (
    <div className={`flex items-center gap-1 ${c.color} text-sm font-medium`}>
      <span>{c.icon}</span>
      <span>{c.label}</span>
    </div>
  )
}

// ── Message Bubble ───────────────────────────────────────────────────────
export const MessageBubble: React.FC<{
  author: string
  body: string
  timestamp: string
  isCustomer: boolean
  isInternal?: boolean
}> = ({ author, body, timestamp, isCustomer, isInternal }) => {
  const formattedTime = new Date(timestamp).toLocaleString()
  return (
    <div className={`mb-4 flex ${isCustomer ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-xs px-4 py-2 rounded-lg ${
          isCustomer
            ? 'bg-blue-500 text-white'
            : isInternal
              ? 'bg-gray-200 text-gray-800 italic'
              : 'bg-gray-100 text-gray-800'
        }`}
      >
        {!isCustomer && <div className="text-xs font-semibold mb-1">{author}</div>}
        <p className="text-sm">{body}</p>
        <div
          className={`text-xs mt-1 ${
            isCustomer ? 'text-blue-100' : isInternal ? 'text-gray-600' : 'text-gray-500'
          }`}
        >
          {formattedTime}
        </div>
      </div>
    </div>
  )
}

// ── Loading Spinner ──────────────────────────────────────────────────────
export const LoadingSpinner: React.FC = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
)

// ── Error Alert ──────────────────────────────────────────────────────────
export const ErrorAlert: React.FC<{ message: string }> = ({ message }) => (
  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
    <p className="font-semibold">Error</p>
    <p className="text-sm">{message}</p>
  </div>
)

// ── Success Alert ────────────────────────────────────────────────────────
export const SuccessAlert: React.FC<{ message: string }> = ({ message }) => (
  <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded">
    <p className="font-semibold">Success</p>
    <p className="text-sm">{message}</p>
  </div>
)

// ── Ticket Header Card ───────────────────────────────────────────────────
export const TicketHeaderCard: React.FC<{
  ticketNumber: string
  status: ComplaintStatus
  priority: ComplaintPriority
  category: string
  regNumber: string
  model?: string
}> = ({ ticketNumber, status, priority, category, regNumber, model }) => (
  <div className="bg-white border rounded-lg p-4 shadow-sm">
    <div className="flex justify-between items-start mb-3">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{ticketNumber}</h2>
        <p className="text-sm text-gray-600">
          {regNumber} {model ? `• ${model}` : ''}
        </p>
      </div>
      <div className="flex gap-2">
        <StatusBadge status={status} />
        <PriorityBadge priority={priority} />
      </div>
    </div>
    <p className="text-sm text-gray-600">
      <span className="font-semibold">Category:</span> {category}
    </p>
  </div>
)
