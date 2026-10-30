// Same formula as log_meal in 0003_meals_points.sql, for the live preview.
// The server's number is the one that counts.
import { daysLeft } from './dates'

export function itemPoints(item, units) {
  const left = daysLeft(item.use_by) ?? 99
  const type = ['produce', 'dairy', 'bread'].includes(item.category) ? 2 : 1
  const urgency = left <= 1 ? 3 : left <= 3 ? 2 : 1
  const source = item.source === 'manual' ? 0.5 : 1
  return type * urgency * units * source
}

export const fmtPoints = (n) => {
  const v = Math.round(Number(n) * 10) / 10
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

export const LEVELS = [
  ['Sprout', 0], ['Sapling', 250], ['Grove', 1000], ['Forest', 3000],
]
export function nextLevel(points) {
  const next = LEVELS.find(([, at]) => at > Number(points))
  return next ? { name: next[0], needed: next[1] - Number(points) } : null
}
