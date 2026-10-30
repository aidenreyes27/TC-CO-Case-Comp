import { useEffect } from 'react'
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { isConfigured } from './lib/supabase'
import Login from './pages/Login'
import Setup, { PENDING_CODE_KEY } from './pages/Setup'
import Pantry from './pages/Pantry'
import Household from './pages/Household'
import Scan from './pages/Scan'
import AddItem from './pages/AddItem'
import Cook from './pages/Cook'
import Board from './pages/Board'

export default function App() {
  if (!isConfigured) return <NotConfigured />
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/join/:code" element={<JoinLink />} />
          <Route path="/login" element={<Gate need="signedOut"><Login /></Gate>} />
          <Route path="/setup" element={<Gate need="noHousehold"><Setup /></Gate>} />
          <Route element={<Gate need="household"><TabLayout /></Gate>}>
            <Route path="/pantry" element={<Pantry />} />
            <Route path="/household" element={<Household />} />
            <Route path="/pantry/scan" element={<Scan />} />
            <Route path="/pantry/add" element={<AddItem />} />
            <Route path="/cook" element={<Cook />} />
            <Route path="/board" element={<Board />} />
          </Route>
          <Route path="*" element={<Navigate to="/pantry" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

// Sends each person to the one screen that fits where they are.
function Gate({ need, children }) {
  const { session, membership } = useAuth()
  if (session === undefined || (session && membership === undefined)) return <Loading />
  const where = !session ? 'signedOut' : !membership ? 'noHousehold' : 'household'
  if (where === need) return children
  return <Navigate to={{ signedOut: '/login', noHousehold: '/setup', household: '/pantry' }[where]} replace />
}

// /join/abc123 keeps the code through the Google redirect, then lands on Setup.
function JoinLink() {
  const { code } = useParams()
  useEffect(() => { sessionStorage.setItem(PENDING_CODE_KEY, code) }, [code])
  return <Navigate to="/setup" replace />
}

function TabLayout() {
  const tab = ({ isActive }) =>
    `flex-1 py-3 text-center font-semibold ${isActive ? 'text-primary' : 'text-ink-soft'}`
  return (
    <div className="min-h-full pb-24">
      <Outlet />
      <nav className="fixed bottom-0 inset-x-0 bg-surface border-t border-line"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="max-w-md mx-auto flex">
          <NavLink to="/pantry" className={tab}>Pantry</NavLink>
          <NavLink to="/cook" className={tab}>Cook</NavLink>
          <NavLink to="/board" className={tab}>Board</NavLink>
          <NavLink to="/household" className={tab}>Household</NavLink>
        </div>
      </nav>
    </div>
  )
}

function Loading() {
  return <div className="min-h-full grid place-items-center text-ink-soft" role="status">Loading…</div>
}

function NotConfigured() {
  return (
    <main className="max-w-md mx-auto px-6 pt-16">
      <h1 className="text-2xl font-extrabold">Connect Supabase to start</h1>
      <p className="mt-3 text-ink-soft leading-relaxed">
        Copy <code>.env.example</code> to <code>.env</code>, add your project URL and anon key, then restart the dev server.
        The README has the full setup.
      </p>
    </main>
  )
}
