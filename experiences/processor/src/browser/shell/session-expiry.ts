export const maximumBrowserTimeoutMs = 2_147_483_647

export type SessionExpiryScheduler = Readonly<{
  now: () => number
  schedule: (callback: () => void, delay: number) => () => void
}>

/**
 * Arms an absolute session-expiry callback without relying on a timeout longer
 * than browsers can represent. Long sessions are checked in bounded segments
 * until their true expiry is reached.
 */
export const scheduleSessionExpiry = (
  expiresAt: string,
  onExpired: () => void,
  scheduler: SessionExpiryScheduler
): (() => void) => {
  const expiresAtMs = Date.parse(expiresAt)
  let cancelled = false
  let cancelScheduled: (() => void) | undefined

  const arm = () => {
    if (cancelled) return
    const remaining = expiresAtMs - scheduler.now()
    if (!Number.isFinite(remaining) || remaining <= 0) {
      onExpired()
      return
    }
    cancelScheduled = scheduler.schedule(
      arm,
      Math.min(remaining, maximumBrowserTimeoutMs)
    )
  }

  arm()

  return () => {
    cancelled = true
    cancelScheduled?.()
  }
}
