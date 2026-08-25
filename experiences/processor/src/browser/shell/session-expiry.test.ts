import { afterEach, describe, expect, it, vi } from "vitest"
import {
  maximumBrowserTimeoutMs,
  scheduleSessionExpiry,
} from "./session-expiry"

describe("session expiry scheduling", () => {
  afterEach(() => vi.useRealTimers())

  const scheduler = {
    now: () => Date.now(),
    schedule: (callback: () => void, delay: number) => {
      const handle = setTimeout(callback, delay)
      return () => clearTimeout(handle)
    },
  }

  it("re-arms long sessions until their absolute expiry", () => {
    vi.useFakeTimers()
    const startedAt = new Date("2026-07-16T12:00:00.000Z")
    const expiresAt = new Date(startedAt.getTime() + 30 * 24 * 60 * 60_000)
    const onExpired = vi.fn()
    vi.setSystemTime(startedAt)

    scheduleSessionExpiry(expiresAt.toISOString(), onExpired, scheduler)

    vi.advanceTimersByTime(maximumBrowserTimeoutMs)
    expect(onExpired).not.toHaveBeenCalled()

    vi.advanceTimersByTime(
      expiresAt.getTime() - startedAt.getTime() - maximumBrowserTimeoutMs
    )
    expect(onExpired).toHaveBeenCalledOnce()
  })

  it("cancels the armed expiry callback", () => {
    vi.useFakeTimers()
    const startedAt = new Date("2026-07-16T12:00:00.000Z")
    vi.setSystemTime(startedAt)
    const onExpired = vi.fn()
    const cancel = scheduleSessionExpiry(
      new Date(startedAt.getTime() + 60_000).toISOString(),
      onExpired,
      scheduler
    )

    cancel()
    vi.advanceTimersByTime(60_000)

    expect(onExpired).not.toHaveBeenCalled()
  })
})
