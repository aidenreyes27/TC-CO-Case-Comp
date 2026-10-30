import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && key)

export const supabase = isConfigured ? createClient(url, key) : null

// Supabase function errors arrive as { message }. Show the database's own words.
export function errorText(error) {
  if (!error) return ''
  return error.message?.replace(/^.*?: /, '') || 'Something went wrong. Try again.'
}
