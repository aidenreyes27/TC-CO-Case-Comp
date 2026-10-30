import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase, errorText } from '../lib/supabase'
import { Button, Field, ErrorNote } from '../components/ui'

export const PENDING_CODE_KEY = 'ripeline-pending-invite'

export default function Setup() {
  const { user, refreshMembership, signOut } = useAuth()
  const navigate = useNavigate()
  const pending = sessionStorage.getItem(PENDING_CODE_KEY) || ''
  const [mode, setMode] = useState(pending ? 'join' : 'create')
  const [name, setName] = useState('')
  const [code, setCode] = useState(pending)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const firstName = user?.user_metadata?.full_name?.split(' ')[0]

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = mode === 'create'
      ? await supabase.rpc('create_household', { p_name: name })
      : await supabase.rpc('join_household', { p_code: code })
    setBusy(false)
    if (error) { setError(errorText(error)); return }
    sessionStorage.removeItem(PENDING_CODE_KEY)
    await refreshMembership()
    navigate('/pantry', { replace: true })
  }

  return (
    <main className="min-h-full px-6 pt-12 pb-10 max-w-md mx-auto flex flex-col">
      <h1 className="text-3xl font-extrabold tracking-tight">
        {firstName ? `Welcome, ${firstName}.` : 'Welcome.'}
      </h1>
      <p className="mt-3 text-ink-soft text-lg leading-relaxed">
        Your pantry is shared with your household. Start one, or join your roommates with their invite code.
      </p>

      <div role="tablist" className="mt-8 grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
        {[['create', 'Start a household'], ['join', 'Join with a code']].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={mode === key} type="button"
            onClick={() => { setMode(key); setError('') }}
            className={`rounded-lg py-2.5 text-sm font-semibold transition ${mode === key ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'}`}>
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === 'create' ? (
          <Field id="hh-name" label="Household name" placeholder="e.g. Dwight Way House" maxLength={60}
            value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        ) : (
          <Field id="hh-code" label="Invite code" placeholder="10 letters and numbers" maxLength={20}
            value={code} onChange={(e) => setCode(e.target.value)} required autoCapitalize="off" autoCorrect="off" />
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Saving…' : mode === 'create' ? 'Start household' : 'Join household'}
        </Button>
        <ErrorNote>{error}</ErrorNote>
      </form>

      <button onClick={signOut} className="mt-auto pt-10 text-sm text-ink-soft underline underline-offset-4">
        Sign out
      </button>
    </main>
  )
}
