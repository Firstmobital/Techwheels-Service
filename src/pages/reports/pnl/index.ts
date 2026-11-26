import PnlStatementReport from './PnlStatementReport'
import PnlExpensesEditor from './PnlExpensesEditor'
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
    label: 'Expenses & Margins',
    description: 'Monthly expense entry by branch, profit margins and expense heads.',
    cardHint: 'Best for Accounts to maintain monthly costs.',
    Component: PnlExpensesEditor,
  },
]
