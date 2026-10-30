export function Button({ variant = 'primary', className = '', ...props }) {
  const styles = {
    primary: 'bg-primary text-primary-ink hover:brightness-110',
    quiet: 'bg-transparent text-ink border border-line hover:bg-surface',
    danger: 'bg-transparent text-last border border-line hover:border-last',
  }
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...props}
    />
  )
}

export function Field({ label, id, ...props }) {
  return (
    <label htmlFor={id} className="block">
      <span className="block text-sm font-medium text-ink-soft mb-1.5">{label}</span>
      <input
        id={id}
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-primary"
        {...props}
      />
    </label>
  )
}

export function ErrorNote({ children }) {
  if (!children) return null
  return <p role="alert" className="text-sm text-last mt-2">{children}</p>
}

export function Avatar({ name, url, size = 40 }) {
  const initials = (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
  return url ? (
    <img src={url} alt="" width={size} height={size} referrerPolicy="no-referrer"
      className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden="true" className="rounded-full bg-accent/30 text-ink font-semibold grid place-items-center"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials}</span>
  )
}

// The freshness bar used across the app: share of shelf life left.
export function FreshnessBar({ left, className = '' }) {
  const color = left > 0.5 ? 'bg-fresh' : left > 0.2 ? 'bg-soon' : 'bg-last'
  return (
    <span className={`block h-2 rounded-full bg-line overflow-hidden ${className}`}>
      <span className={`block h-full rounded-full grow-in ${color}`} style={{ width: `${Math.max(left, 0.06) * 100}%` }} />
    </span>
  )
}
