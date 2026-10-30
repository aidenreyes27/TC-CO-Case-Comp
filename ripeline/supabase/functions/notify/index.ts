// Ripeline: push notifications with email fallback, plus meal photo cleanup.
//
// Three modes, all POST with JSON {"mode": ...}:
//   "used"    called by the app after a meal: tells owners a roommate used their item.
//   "daily"   called every 15 minutes by a schedule: sends each person their
//             "use these soon" alert at the time they picked.
//   "cleanup" called once a day by a schedule: deletes meal photos older than 30 days.
//
// Deploy:  supabase functions deploy notify --no-verify-jwt
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@domain),
//          RESEND_API_KEY, EMAIL_FROM ("Ripeline <alerts@yourdomain.com>"),
//          APP_URL (https://your-app.vercel.app), CRON_SECRET (any long random string)

import { createClient } from 'npm:@supabase/supabase-js@2.50.0'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const env = (k: string) => Deno.env.get(k) ?? ''
const APP_URL = env('APP_URL')
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))

type Member = {
  user_id: string
  household_id: string
  display_name: string | null
  alert_time: string
  timezone: string
  email_alerts: boolean
  push_subscription: webpush.PushSubscription | null
  last_alert_on: string | null
}

// Try push first; if there is no subscription or it fails, send email (if allowed).
async function deliver(m: Member, title: string, body: string, path = '/pantry') {
  if (m.push_subscription) {
    try {
      await webpush.sendNotification(m.push_subscription, JSON.stringify({ title, body, url: path }))
      return 'push'
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) {
        // Subscription expired (app uninstalled or permission removed).
        await admin.from('members').update({ push_subscription: null }).eq('user_id', m.user_id)
      } else {
        console.error('push failed', code)
      }
    }
  }
  if (!m.email_alerts) return 'none'
  const { data } = await admin.auth.admin.getUserById(m.user_id)
  const to = data.user?.email
  if (!to) return 'none'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env('EMAIL_FROM'),
      to,
      subject: title,
      text: `${body}\n\nOpen Ripeline: ${APP_URL}${path}\n\nTo stop these emails, turn off email alerts on the Household tab.`,
    }),
  })
  if (!res.ok) console.error('email failed', res.status, await res.text())
  return res.ok ? 'email' : 'none'
}

const firstName = (n: string | null) => (n ?? 'A roommate').split(' ')[0]
const amountWord = (a: number) =>
  a === 0.25 ? 'a quarter of ' : a === 0.5 ? 'half of ' : a === 0.75 ? 'most of ' : a === 1 ? '' : `${a} of `

// Local date and minutes-past-midnight for a time zone.
function localNow(tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

async function usedMode(req: Request, mealId: string) {
  // Must be the signed-in cook.
  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Sign in first' }, 401)

  const { data: meal } = await admin.from('meals').select('id, cooked_by, household_id').eq('id', mealId).maybeSingle()
  if (!meal || meal.cooked_by !== user.id) return json({ error: 'Not your meal' }, 403)

  const { data: rows } = await admin.from('meal_items')
    .select('amount, owner_id, items(name)').eq('meal_id', mealId).not('owner_id', 'is', null).neq('owner_id', user.id)
  if (!rows?.length) return json({ sent: 0 })

  const { data: cook } = await admin.from('members').select('display_name').eq('user_id', user.id).maybeSingle()
  const byOwner = new Map<string, string[]>()
  for (const r of rows) {
    const list = byOwner.get(r.owner_id) ?? []
    // deno-lint-ignore no-explicit-any
    list.push(`${amountWord(Number(r.amount))}your ${(r as any).items?.name ?? 'item'}`)
    byOwner.set(r.owner_id, list)
  }
  let sent = 0
  for (const [ownerId, things] of byOwner) {
    const { data: owner } = await admin.from('members').select('*').eq('user_id', ownerId).maybeSingle()
    if (!owner) continue
    const how = await deliver(owner as Member, `${firstName(cook?.display_name)} cooked with your food`,
      `${firstName(cook?.display_name)} used ${things.join(' and ')}.`)
    if (how !== 'none') sent++
  }
  return json({ sent })
}

async function dailyMode() {
  const { data: members } = await admin.from('members').select('*')
  let sent = 0
  for (const m of (members ?? []) as Member[]) {
    const { date, minutes } = localNow(m.timezone)
    const [h, min] = m.alert_time.split(':').map(Number)
    const due = minutes >= h * 60 + min && minutes < h * 60 + min + 15
    if (!due || m.last_alert_on === date) continue

    // The 3 items closest to spoiling. Skip the alert if nothing is due within 3 days.
    const { data: items } = await admin.from('items').select('name, use_by')
      .eq('household_id', m.household_id).eq('status', 'in').not('use_by', 'is', null)
      .order('use_by', { ascending: true }).limit(3)
    await admin.from('members').update({ last_alert_on: date }).eq('user_id', m.user_id)
    if (!items?.length) continue
    const soonest = (Date.parse(items[0].use_by) - Date.parse(date)) / 864e5
    if (soonest > 3) continue

    const names = items.map((i) => i.name)
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
    const how = await deliver(m, 'Use these soon', `${list} ${names.length === 1 ? 'is' : 'are'} closest to spoiling. Cook them for extra points.`)
    if (how !== 'none') sent++
  }
  return json({ sent })
}

async function cleanupMode() {
  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString()
  const { data: old } = await admin.from('meals').select('id, photo_path')
    .lt('created_at', cutoff).not('photo_path', 'is', null).limit(1000)
  if (!old?.length) return json({ deleted: 0 })
  const { error } = await admin.storage.from('meal-photos').remove(old.map((m) => m.photo_path))
  if (error) return json({ error: error.message }, 500)
  await admin.from('meals').update({ photo_path: null }).in('id', old.map((m) => m.id))
  return json({ deleted: old.length })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let body: { mode?: string; meal_id?: string }
  try { body = await req.json() } catch { return json({ error: 'Send JSON' }, 400) }

  if (body.mode === 'used' && body.meal_id) return usedMode(req, body.meal_id)

  // Scheduled modes need the shared secret.
  if (req.headers.get('x-cron-secret') !== env('CRON_SECRET') || !env('CRON_SECRET')) {
    return json({ error: 'Not allowed' }, 403)
  }
  if (body.mode === 'daily') return dailyMode()
  if (body.mode === 'cleanup') return cleanupMode()
  return json({ error: 'Unknown mode' }, 400)
})
