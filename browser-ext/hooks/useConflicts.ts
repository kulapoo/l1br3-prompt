import { useEffect, useState } from 'react'
import { listConflicts, subscribeConflicts, type Conflict } from '../lib/conflicts'

export interface UseConflicts {
  conflicts: Conflict[]
  count: number
  loading: boolean
}

export function useConflicts(): UseConflicts {
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    listConflicts().then((c) => {
      if (!cancelled) {
        setConflicts(c)
        setLoading(false)
      }
    })
    const unsubscribe = subscribeConflicts((next) => setConflicts(next))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return { conflicts, count: conflicts.length, loading }
}
