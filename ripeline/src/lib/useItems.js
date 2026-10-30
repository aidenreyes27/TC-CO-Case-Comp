import { useCallback, useEffect, useState } from 'react'
import { supabase, errorText } from './supabase'

// Pantry items still in the fridge, soonest to spoil first.
// Live-updates when a roommate changes something.
export function useItems(householdId) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('items').select('*')
      .eq('status', 'in')
      .order('use_by', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (error) setError(errorText(error)); else { setItems(data); setError('') }
  }, [])

  useEffect(() => {
    if (!householdId) return
    load()
    const channel = supabase
      .channel(`items-${householdId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `household_id=eq.${householdId}` },
        () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [householdId, load])

  return { items, error, reload: load }
}

// Save a change only if nobody else changed the item since we loaded it.
export async function updateItem(item, changes) {
  const { data, error } = await supabase
    .from('items').update(changes)
    .eq('id', item.id).eq('updated_at', item.updated_at)
    .select()
  if (error) return { error: errorText(error) }
  if (!data?.length) return { error: 'A roommate just changed this item. Here is the latest version.' }
  return { item: data[0] }
}

export async function guessUseBy(name) {
  const { data } = await supabase.rpc('guess_shelf_life', { p_name: name })
  return data?.[0] ?? null
}
