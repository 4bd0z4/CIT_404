import { useEffect, useState } from 'react'

/**
 * Re-renders once a second so countdowns tick. Every timer on screen shares
 * one interval rather than each component starting its own.
 */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** Milliseconds left until `iso`, floored at zero. Null when there is no deadline. */
export function useTimeLeft(iso: string | null | undefined) {
  const now = useNow()
  if (!iso) return null
  return Math.max(0, new Date(iso).getTime() - now)
}
