import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase, errorText } from '../lib/supabase'
import { guessUseBy } from '../lib/useItems'
import { addDays, CATEGORIES, todayISO } from '../lib/dates'
import { Button, ErrorNote, Field } from '../components/ui'

export default function AddItem() {
  const { user, membership } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', count: 1, category: 'produce', use_by: '', mine: false })
  const [guessed, setGuessed] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function fillGuess() {
    if (!form.name.trim() || form.use_by) return
    const g = await guessUseBy(form.name)
    if (g) { setForm((f) => ({ ...f, use_by: addDays(todayISO(), g.days), category: g.category })); setGuessed(true) }
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.from('items').insert({
      household_id: membership.household_id,
      added_by: user.id,
      owner_id: form.mine ? user.id : null,
      name: form.name.trim(),
      count: Number(form.count),
      category: form.category,
      use_by: form.use_by || null,
      source: 'manual',
    })
    setBusy(false)
    if (error) { setError(errorText(error)); return }
    navigate('/pantry')
  }

  return (
    <section className="px-6 pt-8 pb-10 max-w-md mx-auto">
      <Link to="/pantry" className="text-ink-soft font-semibold">Back to pantry</Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Add by hand</h1>
      <p className="mt-2 text-ink-soft leading-relaxed">
        For food without a receipt, like the farmers market. Items added by hand earn half points.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field id="name" label="What is it?" placeholder="e.g. Strawberries" maxLength={80} required autoFocus
          value={form.name} onChange={set('name')} onBlur={fillGuess} />
        <div className="grid grid-cols-2 gap-3">
          <Field id="count" label="How many" type="number" min="1" step="1" inputMode="numeric" required
            value={form.count} onChange={set('count')} />
          <label className="block">
            <span className="block text-sm font-medium text-ink-soft mb-1.5">Type</span>
            <select value={form.category} onChange={set('category')}
              className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-ink">
              {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        <div>
          <Field id="use_by" label="Use by (optional)" type="date" min={todayISO()}
            value={form.use_by} onChange={(e) => { setGuessed(false); set('use_by')(e) }} />
          {guessed && <p className="mt-1.5 text-sm text-ink-soft">Estimated from how long it usually lasts. Change it if the package says otherwise.</p>}
        </div>
        <label className="flex items-center gap-3 py-1">
          <input type="checkbox" checked={form.mine} onChange={set('mine')} className="size-5 accent-[var(--c-primary)]" />
          <span>Just mine, not shared with the house</span>
        </label>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Adding…' : 'Add to pantry'}</Button>
        <ErrorNote>{error}</ErrorNote>
      </form>
    </section>
  )
}
