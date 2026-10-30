import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase, errorText } from '../lib/supabase'
import { CATEGORIES, todayISO } from '../lib/dates'
import { Button, ErrorNote } from '../components/ui'

// Shrink the photo before upload: receipts read fine at 1600px, and it keeps scans fast.
async function photoToBase64(file, maxSide = 1600) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
  return dataUrl.split(',')[1]
}

export default function Scan() {
  const { user, membership } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [stage, setStage] = useState('pick') // pick | reading | review
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(''); setStage('reading')
    try {
      const image = await photoToBase64(file)
      const { data, error } = await supabase.functions.invoke('scan-receipt', {
        body: { image, mediaType: 'image/jpeg' },
      })
      if (error) throw error
      if (!data.items?.length) {
        setError('No food items found. Take the photo straight on, in good light, with the whole receipt in frame.')
        setStage('pick'); return
      }
      setRows(data.items.map((it, i) => ({ ...it, key: i, mine: false })))
      setStage('review')
    } catch (err) {
      // The function's own message (e.g. "That photo is too large") rides in the response body.
      const body = await err?.context?.json?.().catch(() => null)
      setError(body?.error || errorText(err) || 'Could not read the receipt. Try again.')
      setStage('pick')
    }
  }

  const update = (key, changes) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...changes } : r)))
  const remove = (key) => setRows((rs) => rs.filter((r) => r.key !== key))

  async function save() {
    setBusy(true); setError('')
    const { error } = await supabase.from('items').insert(rows.map((r) => ({
      household_id: membership.household_id,
      added_by: user.id,
      owner_id: r.mine ? user.id : null,
      name: r.name.trim(),
      count: Math.max(1, Number(r.count) || 1),
      category: r.category,
      use_by: r.use_by || null,
      source: 'receipt',
    })))
    setBusy(false)
    if (error) { setError(errorText(error)); return }
    navigate('/pantry')
  }

  return (
    <section className="px-6 pt-8 pb-10 max-w-md mx-auto">
      <Link to="/pantry" className="text-ink-soft font-semibold">Back to pantry</Link>
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight">
        {stage === 'review' ? `Check ${rows.length} items` : 'Scan a receipt'}
      </h1>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPhoto} />

      {stage === 'pick' && (
        <>
          <p className="mt-2 text-ink-soft leading-relaxed">
            Lay the receipt flat and take one photo of the whole thing. The photo is read and then deleted.
          </p>
          <Button className="w-full mt-6 text-lg" onClick={() => fileRef.current.click()}>Take photo</Button>
          <ErrorNote>{error}</ErrorNote>
        </>
      )}

      {stage === 'reading' && (
        <div className="mt-10" role="status">
          <p className="text-lg font-semibold">Reading your receipt…</p>
          <p className="mt-1 text-ink-soft">This takes a few seconds.</p>
          <div className="mt-5 h-2 rounded-full bg-line overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-primary animate-pulse" />
          </div>
        </div>
      )}

      {stage === 'review' && (
        <>
          <p className="mt-2 text-ink-soft leading-relaxed">Fix anything that looks wrong, then save. Dates are estimates.</p>
          <ul className="mt-5 space-y-3">
            {rows.map((r) => (
              <li key={r.key} className="rounded-2xl bg-surface border border-line p-4 space-y-3">
                <div className="flex gap-2">
                  <input aria-label="Name" value={r.name} onChange={(e) => update(r.key, { name: e.target.value })}
                    className="flex-1 min-w-0 rounded-lg border border-line bg-bg px-3 py-2 font-semibold" />
                  <button onClick={() => remove(r.key)} className="text-sm text-last font-semibold px-2">Remove</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input aria-label="How many" type="number" min="1" inputMode="numeric" value={r.count}
                    onChange={(e) => update(r.key, { count: e.target.value })}
                    className="rounded-lg border border-line bg-bg px-3 py-2" />
                  <select aria-label="Type" value={r.category} onChange={(e) => update(r.key, { category: e.target.value })}
                    className="rounded-lg border border-line bg-bg px-2 py-2">
                    {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <input aria-label="Use by" type="date" min={todayISO()} value={r.use_by ?? ''}
                    onChange={(e) => update(r.key, { use_by: e.target.value })}
                    className="rounded-lg border border-line bg-bg px-2 py-2 text-sm" />
                </div>
                <label className="flex items-center gap-2 text-sm text-ink-soft">
                  <input type="checkbox" checked={r.mine} onChange={(e) => update(r.key, { mine: e.target.checked })}
                    className="size-4 accent-[var(--c-primary)]" />
                  Just mine
                </label>
              </li>
            ))}
          </ul>
          <Button className="w-full mt-6" disabled={busy || rows.length === 0} onClick={save}>
            {busy ? 'Saving…' : `Save ${rows.length} items to pantry`}
          </Button>
          <button className="w-full mt-3 py-2 text-ink-soft font-semibold" onClick={() => { setRows([]); setStage('pick') }}>
            Retake photo
          </button>
          <ErrorNote>{error}</ErrorNote>
        </>
      )}
    </section>
  )
}
