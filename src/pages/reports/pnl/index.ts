import PnlStatementReport from './PnlStatementReport'
import PnlExpensesPage from './PnlExpensesPage'
import PnlSetupPage from './PnlSetupPage'
import type { ReportCategoryDefinition, ReportDefinition } from '../types'

export const PNL_CATEGORY: ReportCategoryDefinition = {
  id: 'pnl',
  label: 'Profit & Loss',
  description: 'Management profit estimate: labour and parts margin less monthly expenses.',
}

export const PNL_REPORTS: ReportDefinition[] = [
  {
    id: 'pnl-statement',
    categoryId: 'pnl',
    label: 'P&L Statement',
    description: 'Labour and parts profit less expenses, by month and branch.',
    cardHint: 'Best for owner and management profitability review.',
    Component: PnlStatementReport,
  },
  {
    id: 'pnl-expenses',
    categoryId: 'pnl',
    label: 'Expenses',
    description: 'Add expenses, confirm repeating costs and review the month.',
    cardHint: 'Best for Accounts to record monthly costs.',
    Component: PnlExpensesPage,
  },
  {
    id: 'pnl-setup',
    categoryId: 'pnl',
    label: 'Repeating & Settings',
    description: 'Repeating expenses, profit margins and expense types.',
    cardHint: 'Best for one-time setup.',
    Component: PnlSetupPage,
  },
]
