import { useCallback, useEffect, useMemo, useState } from 'react'
import AttendanceTab from './payroll/AttendanceTab'
import IncentiveRulesTab from './payroll/IncentiveRulesTab'
import AdvanceManagementTab from './payroll/AdvanceManagementTab'
import PayrollProcessingTab from './payroll/PayrollProcessingTab'
import SalarySlipReportTab from './payroll/SalarySlipReportTab'
import SalaryTypeTab from './payroll/SalaryTypeTab'
import { checkPayrollPermissions } from '../lib/api/payroll'
import { formatPayrollMonth } from '../lib/payroll/calculations'
import { PayrollSecurityIndicator, PayrollSecurityProvider } from './payroll/PayrollSecurityGate'

const TABS = [
  { id: 'attendance', label: 'Attendance' },
  { id: 'incentive', label: 'Incentive Rules' },
  { id: 'advance', label: 'Advance Management' },
  { id: 'processing', label: 'Payroll Processing' },
  { id: 'slip', label: 'Salary Slip Report' },
  { id: 'salary-type', label: 'Salary Type' },
] as const

type TabId = (typeof TABS)[number]['id']

const TAB_DESCRIPTIONS: Record<TabId, string> = {
  attendance: 'Enter monthly payable days per employee. Attendance affects only the base salary component.',
  incentive: 'View and edit SA / Technician variable earning rules. Changes apply to all earnings calculations.',
  advance: 'Issue advances and manage monthly recovery schedules applied during payroll processing.',
  processing: 'Recompute, review, and finalize monthly payroll. Locked months preserve historical snapshots.',
  slip: 'Generate individual salary slips and consolidated payroll reports from finalized data.',
  'salary-type': 'Manage employee department, branch, base salary, salary type, bank details, and active status.',
}

export default function PayrollPage() {
  const [activeTab, setActiveTab] = useState<TabId>('attendance')
  const [payrollMonth, setPayrollMonth] = useState(() => formatPayrollMonth(new Date()))
  const [permissions, setPermissions] = useState({ canView: false, canModify: false, canDelete: false, isAdmin: false })
  const [loadingPerms, setLoadingPerms] = useState(true)

  useEffect(() => {
    void (async () => {
      const perms = await checkPayrollPermissions()
      setPermissions(perms)
      setLoadingPerms(false)
    })()
  }, [])

  const monthInput = useMemo(() => payrollMonth.slice(0, 7), [payrollMonth])

  const handleMonthChange = useCallback((value: string) => {
    setPayrollMonth(`${value}-01`)
  }, [])

  if (loadingPerms) {
    return <div className="page"><div className="card"><div className="card__body">Loading payroll…</div></div></div>
  }

  return (
    <PayrollSecurityProvider isAdmin={permissions.isAdmin} canModify={permissions.canModify}>
    <div className="page" style={{ padding: '0.75rem' }}>
      <div style={{ marginBottom: '0.75rem', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Payroll Management</h1>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.85rem' }}>
            Configure incentives, advances, attendance, and finalize monthly payroll
          </p>
        </div>
        <PayrollSecurityIndicator />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', borderBottom: '2px solid #e2e8f0', marginBottom: '0.5rem' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.55rem 1rem',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: '-2px',
              background: 'transparent',
              color: activeTab === tab.id ? '#2563eb' : '#64748b',
              fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.55rem 0.85rem', marginBottom: '0.75rem', fontSize: '0.78rem', color: '#475569' }}>
        {TAB_DESCRIPTIONS[activeTab]}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem' }}>
        {activeTab === 'attendance' && (
          <AttendanceTab
            payrollMonth={payrollMonth}
            monthInput={monthInput}
            onMonthChange={handleMonthChange}
            canModify={permissions.canModify}
          />
        )}
        {activeTab === 'incentive' && <IncentiveRulesTab canModify={permissions.canModify} />}
        {activeTab === 'advance' && <AdvanceManagementTab canModify={permissions.canModify} payrollMonth={payrollMonth} />}
        {activeTab === 'processing' && (
          <PayrollProcessingTab
            payrollMonth={payrollMonth}
            monthInput={monthInput}
            onMonthChange={handleMonthChange}
            canModify={permissions.canModify}
            canDelete={permissions.canDelete}
          />
        )}
        {activeTab === 'slip' && (
          <SalarySlipReportTab payrollMonth={payrollMonth} monthInput={monthInput} onMonthChange={handleMonthChange} />
        )}
        {activeTab === 'salary-type' && (
          <SalaryTypeTab canModify={permissions.canModify} isAdmin={permissions.isAdmin} />
        )}
      </div>
    </div>
    </PayrollSecurityProvider>
  )
}
