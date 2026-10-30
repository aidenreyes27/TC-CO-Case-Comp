import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase, errorText } from '../lib/supabase'
import { useItems } from '../lib/useItems'
import { daysLabel, daysLeft } from '../lib/dates'
import { fmtPoints, itemPoints, nextLevel } from '../lib/points'
import { Avatar, Button, ErrorNote } from '../components/ui'
import { notifyUsed } from '../lib/push'

async function shrink(file, maxSide = 1280) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.8))
}

// One item = quarters (¼ ½ ¾ all); several = whole units.
const stepFor = (item) => (Number(item.count) > 1 ? 1 : 0.25)
const unitsLabel = (u) => ({ 0.25: '¼', 0.5: '½', 0.75: '¾' })[u] ?? fmtPoints(u)

export default function Cook() {
  const { user, membership, refreshMembership } = useAuth()
  const { items } = useItems(membership?.household_id)
  const [used, setUsed] = useState({}) // item id -> units
  const [roommates, setRoommates] = useState([])
  const [cooks, setCooks] = useState([])
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    supabase.from('members').select('user_id, display_name, avatar_url')
      .neq('user_id', user.id).then(({ data }) => setRoommates(data ?? []))
  }, [user.id])
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  const byId = useMemo(() => Object.fromEntries((items ?? []).map((i) => [i.id, i])), [items])
  const picked = Object.entries(used).filter(([id, u]) => u > 0 && byId[id])
  const estimate = picked.reduce((sum, [id, u]) => sum + itemPoints(byId[id], u), 0) + (cooks.length ? 2 : 0)
  const borrowed = picked.filter(([id]) => byId[id].owner_id && byId[id].owner_id !== user.id)

  function toggle(item) {
    setUsed((u) => ({ ...u, [item.id]: u[item.id] ? 0 : Math.min(1, Number(item.count)) }))
  }
  function nudge(item, dir) {
    const step = stepFor(item)
    setUsed((u) => {
      const next = Math.round(((u[item.id] || 0) + dir * step) * 100) / 100
      return { ...u, [item.id]: Math.max(0, Math.min(Number(item.count), next)) }
    })
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const blob = await shrink(file)
    setPhoto(blob)
    setPreview(URL.createObjectURL(blob))
  }

  async function submit() {
    setBusy(true); setError('')
    try {
      const path = `${membership.household_id}/${user.id}/${crypto.randomUUID()}.jpg`
      const up = await supabase.storage.from('meal-photos').upload(path, photo, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const { data, error } = await supabase.rpc('log_meal', {
        p_photo: path,
        p_items: picked.map(([item_id, units]) => ({ item_id, units })),
        p_cooks: cooks,
      })
      if (error) throw error
      setResult(data)
      if (borrowed.length) notifyUsed(data.meal_id)
      refreshMembership()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setUsed({}); setCooks([]); setPhoto(null); setPreview(''); setResult(null); setError('')
  }

  if (result) {
    const next = nextLevel(result.lifetime_points)
    return (
      <section className="px-6 pt-12 pb-10 max-w-md mx-auto text-center">
        <p className="text-ink-soft font-semibold">Meal logged</p>
        <p className="mt-2 text-7xl font-extrabold tracking-tight text-primary">+{fmtPoints(result.points)}</p>
        <p className="text-lg font-semibold">points</p>
        <ul className="mt-8 text-left rounded-2xl bg-surface border border-line divide-y divide-line">
          {result.items.map((i) => (
            <li key={i.name} className="flex justify-between p-3.5">
              <span>{i.name}</span><span className="font-semibold">+{fmtPoints(i.points)}</span>
            </li>
          ))}
          {cooks.length > 0 && <li className="flex justify-between p-3.5"><span>Cooked together</span><span className="font-semibold">+2</span></li>}
        </ul>
        <p className="mt-6 text-ink-soft">
          {result.level} household, {fmtPoints(result.lifetime_points)} points
          {next && <>. {fmtPoints(next.needed)} to {next.name}.</>}
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link to="/pantry" className="rounded-xl bg-primary text-primary-ink font-semibold py-3">Back to pantry</Link>
          <Button variant="quiet" onClick={reset}>Log another meal</Button>
        </div>
      </section>
    )
  }

  return (
    <section className="px-6 pt-8 pb-40 max-w-md mx-auto">
      <h1 className="text-3xl font-extrabold tracking-tight">Cook</h1>
      <p className="mt-2 text-ink-soft">Tick what went in. Food closest to spoiling scores the most.</p>

      {items === null ? (
        <p className="mt-8 text-ink-soft" role="status">Loading pantry…</p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-ink-soft">Your pantry is empty. <Link className="text-primary font-semibold underline" to="/pantry/scan">Scan a receipt</Link> first.</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {items.map((item) => {
            const u = used[item.id] || 0
            const d = daysLeft(item.use_by)
            const theirs = item.owner_id && item.owner_id !== user.id
            return (
              <li key={item.id} className={`rounded-2xl border p-3.5 transition ${u ? 'border-primary bg-surface' : 'border-line bg-surface/60'}`}>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id={`c-${item.id}`} checked={u > 0} onChange={() => toggle(item)}
                    className="size-5 accent-[var(--c-primary)]" />
                  <label htmlFor={`c-${item.id}`} className="flex-1 min-w-0">
                    <span className="font-semibold block truncate">{item.name}</span>
                    <span className={`text-sm ${d !== null && d <= 1 ? 'text-last font-semibold' : 'text-ink-soft'}`}>
                      {daysLabel(item.use_by)}{theirs && ', a roommate’s'}
                    </span>
                  </label>
                  {u > 0 && <span className="text-sm font-bold text-primary">+{fmtPoints(itemPoints(item, u))}</span>}
                </div>
                {u > 0 && (
                  <div className="mt-3 flex items-center gap-2 pl-8">
                    <span className="text-sm text-ink-soft mr-auto">Used {unitsLabel(u)} of {fmtPoints(item.count)}</span>
                    <button aria-label="Less" onClick={() => nudge(item, -1)} className="size-9 rounded-lg border border-line font-bold">−</button>
                    <button aria-label="More" onClick={() => nudge(item, 1)} className="size-9 rounded-lg border border-line font-bold">+</button>
                    <button onClick={() => setUsed((s) => ({ ...s, [item.id]: Number(item.count) }))}
                      className="h-9 px-3 rounded-lg border border-line text-sm font-semibold">All</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {roommates.length > 0 && picked.length > 0 && (
        <>
          <h2 className="mt-8 font-bold">Cooked with anyone? <span className="font-normal text-ink-soft">+2 each</span></h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {roommates.map((r) => {
              const on = cooks.includes(r.user_id)
              return (
                <button key={r.user_id} aria-pressed={on}
                  onClick={() => setCooks((c) => on ? c.filter((x) => x !== r.user_id) : [...c, r.user_id])}
                  className={`flex items-center gap-2 rounded-full border pl-1 pr-3 py-1 text-sm font-semibold ${on ? 'border-primary bg-primary/10' : 'border-line'}`}>
                  <Avatar name={r.display_name} url={r.avatar_url} size={26} />{r.display_name?.split(' ')[0] || 'Roommate'}
                </button>
              )
            })}
          </div>
        </>
      )}

      {picked.length > 0 && (
        <>
          <h2 className="mt-8 font-bold">Photo of your meal</h2>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPhoto} />
          {preview ? (
            <button onClick={() => fileRef.current.click()} className="mt-3 block w-full">
              <img src={preview} alt="Your meal" className="w-full aspect-[4/3] object-cover rounded-2xl" />
              <span className="block mt-2 text-sm text-ink-soft font-semibold">Retake photo</span>
            </button>
          ) : (
            <Button variant="quiet" className="w-full mt-3" onClick={() => fileRef.current.click()}>Take photo</Button>
          )}
          {borrowed.length > 0 && (
            <p className="mt-4 text-sm text-ink-soft">
              {borrowed.map(([id]) => byId[id].name).join(', ')} {borrowed.length === 1 ? 'belongs' : 'belong'} to a roommate. They’ll be told you used it.
            </p>
          )}
        </>
      )}

      {picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(3.25rem+env(safe-area-inset-bottom,0px))] bg-bg/95 backdrop-blur border-t border-line">
          <div className="max-w-md mx-auto px-6 py-3">
            <Button className="w-full" disabled={busy || !photo} onClick={submit}>
              {busy ? 'Logging…' : !photo ? 'Add a photo to claim points' : `Log meal, about ${fmtPoints(estimate)} points`}
            </Button>
            <ErrorNote>{error}</ErrorNote>
          </div>
        </div>
      )}
    </section>
  )
}
