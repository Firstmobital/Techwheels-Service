/** IST month bounds — same as web payroll (used by bodyshop monthly earnings). */
export function monthRangeIst(payrollMonth: string): { from: string; to: string } {
  const [y, m] = payrollMonth.slice(0, 7).split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const monthStr = payrollMonth.slice(0, 7)
  return {
    from: `${monthStr}-01T00:00:00+05:30`,
    to: `${monthStr}-${String(lastDay).padStart(2, '0')}T23:59:59+05:30`,
  }
}
