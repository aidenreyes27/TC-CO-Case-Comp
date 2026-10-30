import { useEffect, useState } from 'react'
import { Button, ErrorNote, FreshnessBar } from './ui'
import { addDays, CATEGORIES, daysLabel, freshnessShare, todayISO } from '../lib/dates'
import { updateItem } from '../lib/useItems'

// Bottom sheet for one item: fix its date, quick freshness buttons, toss it.
export default function ItemSheet({ item, userId, onClose, onChanged }) {
  const [draft, setDraft] = useState(item)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setDraft(item); setError('') }, [item])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isMine = draft.owner_id === userId
  const isTheirs = draft.owner_id && !isMine

  async function save(changes, closeAfter = false) {
    setBusy(true); setError('')
    const { item: saved, error } = await updateItem(draft, changes)
    setBusy(false)
    if (error) { setError(error); onChanged(); return }
    setDraft(saved); onChanged()
    if (closeAfter) onClose()
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl bg-bg p-6 pb-8 shadow-2xl"
        style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="sheet-title" className="text-2xl font-extrabold">{draft.name}</h2>
            <p className="text-ink-soft">{daysLabel(draft.use_by)}</p>
          </div>
          <button onClick={onClose} className="text-ink-soft font-semibold px-2 py-1">Done</button>
        </div>
        <FreshnessBar left={freshnessShare(draft)} className="mt-3" />

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="quiet" disabled={busy} onClick={() => save({ use_by: todayISO() })}>Looks bad</Button>
          <Button variant="quiet" disabled={busy}
            onClick={() => save({ use_by: addDays(draft.use_by && draft.use_by > todayISO() ? draft.use_by : todayISO(), 2) })}>
            Still good
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-sm font-medium text-ink-soft mb-1.5">Use by</span>
            <input type="date" value={draft.use_by ?? ''} min={todayISO()}
              onChange={(e) => e.target.value && save({ use_by: e.target.value })}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink" />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-ink-soft mb-1.5">How many</span>
            <input type="number" min="0" step="1" inputMode="numeric" value={draft.count}
              onChange={(e) => setDraft({ ...draft, count: e.target.value })}
              onBlur={() => Number(draft.count) >= 0 && save({ count: Number(draft.count) })}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink" />
          </label>
          <label className="block col-span-2">
            <span className="block text-sm font-medium text-ink-soft mb-1.5">Type</span>
            <select value={draft.category} onChange={(e) => save({ category: e.target.value })}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink">
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        {!isTheirs && (
          <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1" role="group" aria-label="Who it belongs to">
            {[[null, 'Shared'], [userId, 'Mine']].map(([owner, label]) => (
              <button key={label} type="button" aria-pressed={draft.owner_id === owner} disabled={busy}
                onClick={() => draft.owner_id !== owner && save({ owner_id: owner })}
                className={`rounded-lg py-2 text-sm font-semibold ${draft.owner_id === owner ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        {isTheirs && <p className="mt-5 text-sm text-ink-soft">This belongs to a roommate.</p>}

        <ErrorNote>{error}</ErrorNote>

        <Button variant="danger" className="w-full mt-6" disabled={busy}
          onClick={() => window.confirm(`Mark ${draft.name} as tossed? It counts toward the house’s waste.`) && save({ status: 'tossed' }, true)}>
          Tossed
        </Button>
      </div>
    </div>
  )
}
