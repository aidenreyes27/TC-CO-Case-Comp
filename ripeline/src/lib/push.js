import { supabase, errorText } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
export const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

// Why push can't be turned on here, in words a person can act on. Null = it can.
export function pushBlocker() {
  if (!VAPID) return 'Push is not set up for this app yet.'
  if (isIOS() && !isInstalled()) return 'On iPhone, add Ripeline to your Home Screen first: tap Share, then Add to Home Screen, then open it from there.'
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'This browser can’t get push notifications. You’ll get email instead.'
  if (Notification.permission === 'denied') return 'Notifications are blocked for Ripeline. Allow them in your browser or phone settings.'
  return null
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
}

function keyToBytes(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

// Must run from a tap (browsers require it). Returns the subscription JSON or throws.
export async function subscribeToPush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications were not allowed.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID) }))
  return sub.toJSON()
}

export async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) await sub.unsubscribe()
}

// After a meal, tell owners of borrowed items. Fire and forget.
export function notifyUsed(mealId) {
  supabase.functions.invoke('notify', { body: { mode: 'used', meal_id: mealId } })
    .catch((e) => console.warn('notify failed', errorText(e)))
}
