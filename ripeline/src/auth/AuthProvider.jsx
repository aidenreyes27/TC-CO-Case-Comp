import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [membership, setMembership] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const refreshMembership = useCallback(async () => {
    if (!session) { setMembership(null); return }
    const { data } = await supabase
      .from('members')
      .select('household_id, role, households(id, name, invite_code, level, lifetime_points)')
      .eq('user_id', session.user.id)
      .maybeSingle()
    setMembership(data ?? null)
  }, [session])

  useEffect(() => {
    if (session === undefined) return
    refreshMembership()
  }, [session, refreshMembership])

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user, membership, refreshMembership, signInWithGoogle, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
