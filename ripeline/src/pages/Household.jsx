import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase, errorText } from '../lib/supabase'
import { Avatar, Button, ErrorNote } from '../components/ui'
import { fmtPoints, nextLevel } from '../lib/points'
import AlertSettings from '../components/AlertSettings'

export default function Household() {
  const { user, membership, refreshMembership, signOut } = useAuth()
  const household = membership?.households
  const isOwner = membership?.role === 'owner'
  const [members, setMembers] = useState([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  async function loadMembers() {
    const { data, error } = await supabase
      .from('members').select('user_id, role, display_name, avatar_url, joined_at')
      .order('joined_at')
    if (error) setError(errorText(error)); else setMembers(data)
  }
  useEffect(() => { loadMembers() }, [household?.id])

  const inviteLink = `${window.location.origin}/join/${household?.invite_code}`

  async function copyInvite() {
    try {
      if (navigator.share) await navigator.share({ title: `Join ${household.name}`, url: inviteLink })
      else { await navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 2000) }
    } catch { /* share sheet closed */ }
  }

  async function act(fn, args, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return
    setError('')
    const { error } = await supabase.rpc(fn, args)
    if (error) { setError(errorText(error)); return }
    await refreshMembership(); await loadMembers()
  }

  if (!household) return null

  return (
    <section className="px-6 pt-8 pb-10 max-w-md mx-auto">
      <p className="text-ink-soft font-medium">Household</p>
      <h1 className="text-3xl font-extrabold tracking-tight">{household.name}</h1>
      <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-accent/25 px-3 py-1 text-sm font-semibold">
        {household.level} level, {fmtPoints(household.lifetime_points)} points
      </p>
      {nextLevel(household.lifetime_points) && (
        <p className="mt-2 text-sm text-ink-soft">
          {fmtPoints(nextLevel(household.lifetime_points).needed)} more points to {nextLevel(household.lifetime_points).name}.
        </p>
      )}

      <h2 className="mt-10 text-lg font-bold">Roommates</h2>
      <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-3 p-4">
            <Avatar name={m.display_name} url={m.avatar_url} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">
                {m.display_name || 'Roommate'}{m.user_id === user.id && <span className="text-ink-soft font-normal"> (you)</span>}
              </p>
              {m.role === 'owner' && <p className="text-sm text-ink-soft">Owner</p>}
            </div>
            {isOwner && m.user_id !== user.id && (
              <button onClick={() => act('remove_member', { p_user: m.user_id }, `Remove ${m.display_name || 'this roommate'} from the household?`)}
                className="text-sm text-last font-semibold px-2 py-1">Remove</button>
            )}
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-lg font-bold">Invite roommates</h2>
      <p className="mt-1 text-ink-soft">Send them this link, or have them enter the code.</p>
      <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <p className="text-2xl font-bold tracking-wide select-all">{household.invite_code}</p>
        <div className="mt-4 flex gap-2">
          <Button onClick={copyInvite} className="flex-1">{copied ? 'Link copied' : 'Share invite link'}</Button>
          {isOwner && (
            <Button variant="quiet" onClick={() => act('new_invite_code', {}, 'Make a new code? The old link will stop working.')}>
              New code
            </Button>
          )}
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>

      <AlertSettings />

      <div className="mt-12 flex flex-col gap-3">
        <Button variant="danger" onClick={() => act('leave_household', {}, 'Leave this household? You will lose access to its pantry.')}>
          Leave household
        </Button>
        <Button variant="quiet" onClick={signOut}>Sign out</Button>
      </div>
    </section>
  )
}
