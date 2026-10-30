import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Button, ErrorNote, FreshnessBar } from '../components/ui'

// A sample of what the pantry looks like: the bar is the app's core idea.
const SAMPLE = [
  { name: 'Spinach', days: 'Use today', left: 0.1 },
  { name: 'Greek yogurt', days: '2 days left', left: 0.35 },
  { name: 'Sourdough', days: '4 days left', left: 0.6 },
  { name: 'Carrots', days: '17 days left', left: 0.9 },
]

export default function Login() {
  const { signInWithGoogle } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true); setError('')
    const { error } = await signInWithGoogle()
    if (error) { setError('Google sign-in did not start. Check your connection and try again.'); setBusy(false) }
  }

  return (
    <main className="min-h-full flex flex-col px-6 pb-10 pt-12 max-w-md mx-auto">
      <p className="font-bold text-primary text-lg">Ripeline</p>

      <h1 className="mt-10 text-[2.75rem] leading-[1.02] font-extrabold tracking-tight">
        Cook it before it spoils.
      </h1>
      <p className="mt-4 text-lg text-ink-soft leading-relaxed">
        Track your shared fridge, score points for every meal that saves food, and see who in the house wastes the least.
      </p>

      <ul className="mt-10 space-y-4 rounded-2xl bg-surface border border-line p-5" aria-label="Example pantry">
        {SAMPLE.map((item) => (
          <li key={item.name}>
            <div className="flex justify-between text-sm mb-1.5">
              <span className="font-semibold">{item.name}</span>
              <span className="text-ink-soft">{item.days}</span>
            </div>
            <FreshnessBar left={item.left} />
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-10">
        <Button onClick={go} disabled={busy} className="w-full text-lg">
          <GoogleMark /> {busy ? 'Opening Google…' : 'Continue with Google'}
        </Button>
        <ErrorNote>{error}</ErrorNote>
      </div>
    </main>
  )
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  )
}
