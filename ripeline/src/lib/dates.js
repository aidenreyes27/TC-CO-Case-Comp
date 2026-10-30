// All dates are local calendar days as 'YYYY-MM-DD'.
const pad = (n) => String(n).padStart(2, '0')
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayISO = () => toISO(new Date())
const parse = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }

export function addDays(iso, n) {
  const d = parse(iso); d.setDate(d.getDate() + n); return toISO(d)
}

export function daysLeft(useBy) {
  if (!useBy) return null
  return Math.round((parse(useBy) - parse(todayISO())) / 864e5)
}

export function daysLabel(useBy) {
  const n = daysLeft(useBy)
  if (n === null) return 'No date'
  if (n < 0) return n === -1 ? '1 day past' : `${-n} days past`
  if (n === 0) return 'Use today'
  if (n === 1) return '1 day left'
  return `${n} days left`
}

// Share of shelf life left, from the day it was added to its use-by date.
export function freshnessShare(item) {
  const left = daysLeft(item.use_by)
  if (left === null) return 1
  const total = Math.max(1, Math.round((parse(item.use_by) - parse(item.created_at.slice(0, 10))) / 864e5))
  return Math.min(1, Math.max(0, left / total))
}

export const CATEGORIES = [
  ['produce', 'Produce'],
  ['dairy', 'Dairy'],
  ['bread', 'Bread'],
  ['other', 'Other'],
]
