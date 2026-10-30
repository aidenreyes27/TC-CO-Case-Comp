import { useEffect, useState } from 'react'
import { supabase, errorText } from '../lib/supabase'
import { pushBlocker, subscribeToPush, unsubscribeFromPush } from '../lib/push'
import { Button, ErrorNote } from './ui'

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone

export default function AlertSettings() {
  const [prefs, setPrefs] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const blocker = pushBlocker()

  useEffect(() => {
    supabase.rpc('my_alert_prefs').then(({ data }) => {
      const p = data?.[0]
      if (p) setPrefs({ time: p.alert_time.slice(0, 5), email: p.email_alerts, push: p.has_push })
    })
  }, [])

  async function save(next, extra = {}) {
    setError('')
    const { error } = await supabase.rpc('set_alert_prefs', {
      p_time: next.time, p_timezone: TZ, p_email: next.email, ...extra,
    })
    if (error) { setError(errorText(error)); return false }
    setPrefs(next); setSaved(true); setTimeout(() => setSaved(false), 1500)
    return true
  }

  async function turnOnPush() {
    try {
      const sub = await subscribeToPush()
      await save({ ...prefs, push: true }, { p_push: sub })
    } catch (e) { setError(e.message) }
  }
  async function turnOffPush() {
    await unsubscribeFromPush().catch(() => {})
    await save({ ...prefs, push: false }, { p_clear_push: true })
  }

  if (!prefs) return null

  return (
    <>
      <h2 className="mt-10 text-lg font-bold">Alerts</h2>
      <p className="mt-1 text-ink-soft">Once a day, we’ll name the 3 items closest to spoiling, if any are due within 3 days. You’ll also hear when a roommate cooks with your food.</p>
      <div className="mt-3 rounded-2xl border border-line bg-surface divide-y divide-line">
        <label className="flex items-center justify-between gap-3 p-4">
          <span className="font-semibold">Daily alert time</span>
          <input type="time" value={prefs.time} step="900"
            onChange={(e) => e.target.value && save({ ...prefs, time: e.target.value })}
            className="rounded-lg border border-line bg-bg px-3 py-2" />
        </label>
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">Push notifications</span>
            {prefs.push
              ? <Button variant="quiet" className="py-2" onClick={turnOffPush}>Turn off</Button>
              : <Button className="py-2" disabled={Boolean(blocker)} onClick={turnOnPush}>Turn on</Button>}
          </div>
          {!prefs.push && blocker && <p className="mt-2 text-sm text-ink-soft">{blocker}</p>}
        </div>
        <label className="flex items-center justify-between gap-3 p-4">
          <span>
            <span className="block font-semibold">Email if push doesn’t reach you</span>
            <span className="block text-sm text-ink-soft">Sent to your Google email</span>
          </span>
          <input type="checkbox" checked={prefs.email} onChange={(e) => save({ ...prefs, email: e.target.checked })}
            className="size-5 accent-[var(--c-primary)]" />
        </label>
      </div>
      <p className="mt-2 text-sm text-ink-soft h-5" role="status">{saved ? 'Saved' : `Times are in ${TZ.replace('_', ' ')}`}</p>
      <ErrorNote>{error}</ErrorNote>
    </>
  )
}
