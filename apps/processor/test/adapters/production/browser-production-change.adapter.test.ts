import { describe, expect, it, vi } from "vitest"
import { makeBrowserProductionChangeAdapter } from "@/adapters/production/browser-production-change.adapter"

describe("browser production change adapter", () => {
  it("subscribes with cookies and translates SSE events into invalidations", () => {
    const listeners = new Map<
      string,
      (event: MessageEvent<string> | Event) => void
    >()
    const close = vi.fn()
    const factory = vi.fn(() => ({
      addEventListener: (
        type: string,
        listener: (event: MessageEvent<string> | Event) => void
      ) => listeners.set(type, listener),
      close,
    }))
    const onInvalidate = vi.fn()
    const onStateChange = vi.fn()
    const unsubscribe = makeBrowserProductionChangeAdapter({
      apiBaseUrl: "/api/",
      eventSourceFactory: factory,
    }).subscribe({
      locationId: "pressly one",
      onInvalidate,
      onStateChange,
    })

    expect(factory).toHaveBeenCalledWith(
      "/api/production/locations/pressly%20one/events",
      { withCredentials: true }
    )
    listeners.get("open")?.(new Event("open"))
    listeners.get("ready")?.(
      new MessageEvent("ready", { data: JSON.stringify({ revision: 7 }) })
    )
    listeners.get("change")?.(
      new MessageEvent("change", { data: JSON.stringify({ revision: 8 }) })
    )
    listeners.get("resync")?.(new MessageEvent("resync", { data: "{}" }))
    listeners.get("error")?.(new Event("error"))

    expect(onStateChange).toHaveBeenNthCalledWith(1, "connecting")
    expect(onStateChange).toHaveBeenNthCalledWith(2, "open")
    expect(onStateChange).toHaveBeenNthCalledWith(3, "reconnecting")
    expect(onInvalidate.mock.calls.map(([value]) => value)).toEqual([
      { source: "ready", revision: 7 },
      { source: "change", revision: 8 },
      { source: "resync", revision: null },
    ])

    unsubscribe()
    expect(close).toHaveBeenCalledOnce()
  })

  it("ignores malformed change payloads", () => {
    const listeners = new Map<
      string,
      (event: MessageEvent<string> | Event) => void
    >()
    const onInvalidate = vi.fn()
    makeBrowserProductionChangeAdapter({
      apiBaseUrl: "/api",
      eventSourceFactory: () => ({
        addEventListener: (type, listener) => listeners.set(type, listener),
        close: vi.fn(),
      }),
    }).subscribe({ locationId: "east", onInvalidate })

    listeners.get("change")?.(new MessageEvent("change", { data: "{not-json" }))
    expect(onInvalidate).not.toHaveBeenCalled()
  })
})
