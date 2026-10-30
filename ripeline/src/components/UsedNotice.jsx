import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtPoints } from '../lib/points'

const SEEN_KEY = 'ripeline-used-notice-seen'
const amountWord = (a) => ({ 0.25: 'a quarter of', 0.5: 'half of', 0.75: 'most of' })[Number(a)] ?? (Number(a) === 1 ? '' : `${fmtPoints(a)} of`)

// Tells you when a roommate cooked with something marked as yours.
// Push and email versions of this come with alerts in step 5.
export default function UsedNotice() {
  const [rows, setRows] = useState([])

  useEffect(() => {
    let seen = ''
    try { seen = localStorage.getItem(SEEN_KEY) || '' } catch { /* private mode */ }
    supabase.rpc('my_items_used_by_others').then(({ data }) => {
      setRows((data ?? []).filter((r) => r.used_at > seen))
    })
  }, [])

  if (!rows.length) return null

  function dismiss() {
    try { localStorage.setItem(SEEN_KEY, rows[0].used_at) } catch { /* ignore */ }
    setRows([])
  }

  return (
    <div className="mt-5 rounded-2xl border border-soon/60 bg-soon/10 p-4" role="status">
      <ul className="space-y-1">
        {rows.slice(0, 3).map((r) => (
          <li key={`${r.meal_id}-${r.item_name}`}>
            <span className="font-semibold">{r.used_by_name.split(' ')[0]}</span> used {amountWord(r.amount)} your {r.item_name}.
          </li>
        ))}
      </ul>
      {rows.length > 3 && <p className="text-sm text-ink-soft mt-1">And {rows.length - 3} more.</p>}
      <button onClick={dismiss} className="mt-2 text-sm font-semibold text-ink-soft underline underline-offset-4">Got it</button>
    </div>
  )
}
