// Ripeline: read a grocery receipt photo and return pantry items.
// The image is sent to Claude and then dropped. It is never saved.
//
// Deploy:  supabase functions deploy scan-receipt
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { createClient } from 'npm:@supabase/supabase-js@2.50.0'

const MODEL = 'claude-haiku-5-5'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PROMPT = `This is a photo of a grocery receipt. List every food or drink item on it.
For each item return:
- "name": a short plain name a person would say, title case (e.g. "ORG BBY SPINACH 5OZ" -> "Baby Spinach")
- "count": how many were bought (a number, default 1; for items sold by weight use 1)
- "category": one of "produce", "dairy", "bread", "other" (eggs are "other")
Skip non-food lines: bags, taxes, totals, discounts, deposits, cleaning or household goods.
If the photo is not a receipt or is unreadable, return an empty list.
Reply with only a JSON array, no other text. Example:
[{"name":"Baby Spinach","count":1,"category":"produce"}]`

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405)

  // Act as the signed-in user, so row-level security applies.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Sign in first' }, 401)

  const { data: member } = await supabase.from('members').select('household_id').eq('user_id', user.id).maybeSingle()
  if (!member) return json({ error: 'Join a household first' }, 403)

  let image: string, mediaType: string
  try {
    ;({ image, mediaType } = await req.json())
  } catch {
    return json({ error: 'Send JSON with image and mediaType' }, 400)
  }
  if (!image || !['image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) {
    return json({ error: 'Send a JPEG, PNG or WebP photo' }, 400)
  }
  if (image.length * 0.75 > MAX_IMAGE_BYTES) return json({ error: 'That photo is too large' }, 413)

  // Ask Claude to read the receipt.
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: PROMPT },
        ],
      }],
    }),
  })
  if (!res.ok) {
    console.error('Claude error', res.status, await res.text())
    return json({ error: 'Could not read the receipt right now. Try again in a minute.' }, 502)
  }
  const data = await res.json()
  const text = (data.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')

  let raw: Array<{ name?: unknown; count?: unknown; category?: unknown }>
  try {
    raw = JSON.parse(text.replace(/```json|```/g, '').trim())
    if (!Array.isArray(raw)) raw = []
  } catch {
    raw = []
  }

  // Clean up and add an estimated use-by date from the shelf-life list.
  const categories = ['produce', 'dairy', 'bread', 'other']
  const today = new Date()
  const items = []
  for (const r of raw.slice(0, 60)) {
    const name = String(r.name ?? '').trim().slice(0, 80)
    if (!name) continue
    const count = Math.max(1, Math.round(Number(r.count) || 1))
    let category = categories.includes(String(r.category)) ? String(r.category) : 'other'
    let useBy: string | null = null

    const { data: guess } = await supabase.rpc('guess_shelf_life', { p_name: name })
    if (guess?.[0]) {
      const d = new Date(today)
      d.setDate(d.getDate() + guess[0].days)
      useBy = d.toISOString().slice(0, 10)
      if (category === 'other') category = guess[0].category
    }
    items.push({ name, count, category, use_by: useBy })
  }

  // The image only ever lived in this request's memory; nothing to delete.
  return json({ items })
})
