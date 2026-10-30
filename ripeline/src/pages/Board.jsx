import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase, errorText } from '../lib/supabase'
import { fmtPoints } from '../lib/points'
import { Avatar, Button, ErrorNote, Field } from '../components/ui'

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
const MONTH = new Date().toLocaleString('en-US', { month: 'long' })

export default function Board() {
  const { user, membership } = useAuth()
  const [tab, setTab] = useState('house')
  const [house, setHouse] = useState(null)
  const [friends, setFriends] = useState(null)
  const [requests, setRequests] = useState([])
  const [friendCode, setFriendCode] = useState('')
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [h, f, r, me] = await Promise.all([
      supabase.rpc('leaderboard_house', { p_timezone: TZ }),
      supabase.rpc('leaderboard_friends', { p_timezone: TZ }),
      supabase.rpc('friend_requests'),
      supabase.from('households').select('friend_code').eq('id', membership.household_id).single(),
    ])
    setHouse(h.data ?? []); setFriends(f.data ?? []); setRequests(r.data ?? [])
    setFriendCode(me.data?.friend_code ?? '')
  }, [membership.household_id])
  useEffect(() => { load() }, [load])

  async function addFriend(e) {
    e.preventDefault(); setError(''); setNote('')
    const { data, error } = await supabase.rpc('add_friend', { p_code: code })
    if (error) { setError(errorText(error)); return }
    setCode('')
    setNote(data === 'accepted' ? 'You’re now friends. They’re on your board.' : 'Request sent. They’ll show up once someone in that house accepts.')
    load()
  }
  async function answer(id, accept) {
    await supabase.rpc('answer_friend', { p_household: id, p_accept: accept }); load()
  }

  const mine = friends?.find((f) => f.is_mine)

  return (
    <section className="px-6 pt-8 pb-10 max-w-md mx-auto">
      <p className="text-ink-soft font-medium">{MONTH} standings</p>
      <h1 className="text-3xl font-extrabold tracking-tight">Leaderboard</h1>
      {mine && (
        <p className="mt-2 text-ink-soft">
          {mine.level} household.{' '}
          {mine.streak_weeks > 0 ? `${mine.streak_weeks}-week streak with nothing tossed.` : 'Go a full week without tossing anything to start a streak.'}
        </p>
      )}

      <div role="tablist" className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
        {[['house', 'Roommates'], ['friends', 'Households']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-lg py-2.5 text-sm font-semibold ${tab === k ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft'}`}>{l}</button>
        ))}
      </div>

      {tab === 'house' && (
        house === null ? <p className="mt-8 text-ink-soft" role="status">Loading…</p> : (
          <ol className="mt-5 space-y-2">
            {house.map((r, i) => (
              <li key={r.user_id} className={`flex items-center gap-3 rounded-2xl border p-3.5 ${r.user_id === user.id ? 'border-primary bg-surface' : 'border-line bg-surface'}`}>
                <span className={`w-7 text-center text-xl font-extrabold ${i === 0 && Number(r.points) > 0 ? 'text-primary' : 'text-ink-soft'}`}>{i + 1}</span>
                <Avatar name={r.display_name} url={r.avatar_url} size={36} />
                <span className="flex-1 font-semibold truncate">{r.display_name || 'Roommate'}{r.user_id === user.id && <span className="text-ink-soft font-normal"> (you)</span>}</span>
                <span className="font-bold">{fmtPoints(r.points)}</span>
              </li>
            ))}
          </ol>
        )
      )}

      {tab === 'friends' && (
        <>
          {requests.map((r) => (
            <div key={r.household_id} className="mt-5 rounded-2xl border border-accent bg-accent/15 p-4">
              <p><span className="font-semibold">{r.name}</span> wants to compete with your house.</p>
              <div className="mt-3 flex gap-2">
                <Button className="flex-1 py-2" onClick={() => answer(r.household_id, true)}>Accept</Button>
                <Button variant="quiet" className="py-2" onClick={() => answer(r.household_id, false)}>Decline</Button>
              </div>
            </div>
          ))}

          {friends === null ? <p className="mt-8 text-ink-soft" role="status">Loading…</p> : (
            <>
              <p className="mt-5 text-sm text-ink-soft">Ranked by points per person, so bigger houses don’t win by size.</p>
              <ol className="mt-3 space-y-2">
                {friends.map((f, i) => (
                  <li key={f.household_id} className={`flex items-center gap-3 rounded-2xl border p-3.5 bg-surface ${f.is_mine ? 'border-primary' : 'border-line'}`}>
                    <span className="w-7 text-center text-xl font-extrabold text-ink-soft">{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold truncate">{f.name}{f.is_mine && <span className="text-ink-soft font-normal"> (yours)</span>}</span>
                      <span className="block text-sm text-ink-soft">{f.level}, {f.people} {f.people === 1 ? 'person' : 'people'}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-bold">{fmtPoints(f.points_per_person)}</span>
                      <span className="block text-xs text-ink-soft">per person</span>
                    </span>
                  </li>
                ))}
              </ol>
              {friends.length === 1 && <p className="mt-4 text-ink-soft">Add a friend household below to start competing.</p>}
            </>
          )}

          <h2 className="mt-10 text-lg font-bold">Add a household</h2>
          <p className="mt-1 text-ink-soft">Swap friend codes with another house. This code only adds you to each other’s board; it can’t be used to join your pantry.</p>
          <p className="mt-3 rounded-2xl border border-line bg-surface p-4">
            <span className="block text-sm text-ink-soft">Your friend code</span>
            <span className="block text-2xl font-bold tracking-wide select-all">{friendCode}</span>
          </p>
          <form onSubmit={addFriend} className="mt-4 flex gap-2 items-end">
            <div className="flex-1"><Field id="fcode" label="Their friend code" value={code} onChange={(e) => setCode(e.target.value)} required autoCapitalize="off" /></div>
            <Button type="submit">Add</Button>
          </form>
          {note && <p className="mt-2 text-sm text-primary font-semibold" role="status">{note}</p>}
          <ErrorNote>{error}</ErrorNote>
        </>
      )}
    </section>
  )
}
