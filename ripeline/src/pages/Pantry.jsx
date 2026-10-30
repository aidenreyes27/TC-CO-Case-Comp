import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useItems } from '../lib/useItems'
import { daysLabel, daysLeft, freshnessShare } from '../lib/dates'
import { ErrorNote, FreshnessBar } from '../components/ui'
import ItemSheet from '../components/ItemSheet'
import UsedNotice from '../components/UsedNotice'

const FILTERS = [['all', 'All'], ['shared', 'Shared'], ['mine', 'Mine']]

export default function Pantry() {
  const { user, membership } = useAuth()
  const { items, error, reload } = useItems(membership?.household_id)
  const [filter, setFilter] = useState('all')
  const [openId, setOpenId] = useState(null)

  const shown = useMemo(() => (items ?? []).filter((i) =>
    filter === 'all' ? true : filter === 'mine' ? i.owner_id === user.id : !i.owner_id), [items, filter, user.id])
  const urgent = (items ?? []).filter((i) => { const d = daysLeft(i.use_by); return d !== null && d <= 1 }).length
  const open = items?.find((i) => i.id === openId)

  return (
    <section className="px-6 pt-8 max-w-md mx-auto">
      <p className="text-ink-soft font-medium">{membership?.households?.name}</p>
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Pantry</h1>
        {urgent > 0 && <p className="text-last font-semibold">{urgent} to use by tomorrow</p>}
      </div>

      <UsedNotice />

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Link to="/pantry/scan" className="rounded-xl bg-primary text-primary-ink font-semibold py-3 text-center">Scan receipt</Link>
        <Link to="/pantry/add" className="rounded-xl border border-line font-semibold py-3 text-center">Add by hand</Link>
      </div>

      {items?.length > 0 && (
        <div className="mt-6 flex gap-2" role="group" aria-label="Show">
          {FILTERS.map(([key, label]) => (
            <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold border ${filter === key ? 'bg-ink text-bg border-ink' : 'border-line text-ink-soft'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>

      {items === null ? (
        <p className="mt-10 text-ink-soft" role="status">Loading pantry…</p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border-2 border-dashed border-line p-8 text-center">
          <p className="text-xl font-bold">Nothing in the pantry yet</p>
          <p className="mt-2 text-ink-soft leading-relaxed">
            Scan your last grocery receipt to fill it in about a minute.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="mt-8 text-ink-soft">Nothing here. Try another filter.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {shown.map((item) => {
            const d = daysLeft(item.use_by)
            return (
              <li key={item.id}>
                <button onClick={() => setOpenId(item.id)}
                  className="w-full text-left rounded-2xl bg-surface border border-line p-4 hover:border-primary transition">
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold truncate">
                      {item.name}
                      {Number(item.count) > 1 && <span className="text-ink-soft font-normal"> x{Number(item.count)}</span>}
                    </span>
                    <span className={`shrink-0 text-sm ${d !== null && d <= 1 ? 'text-last font-semibold' : 'text-ink-soft'}`}>
                      {daysLabel(item.use_by)}
                    </span>
                  </div>
                  <FreshnessBar left={freshnessShare(item)} className="mt-2" />
                  {item.owner_id && (
                    <p className="mt-2 text-xs text-ink-soft">{item.owner_id === user.id ? 'Mine' : 'A roommate’s'}</p>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {open && <ItemSheet item={open} userId={user.id} onClose={() => setOpenId(null)} onChanged={reload} />}
    </section>
  )
}
