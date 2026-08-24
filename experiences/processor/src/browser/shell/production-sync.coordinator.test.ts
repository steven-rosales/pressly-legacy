import { describe, expect, it, vi } from "vitest"
import { unexpectedError } from "@pressly/errors/factories"
import { makeProductionSyncCoordinator } from "./production-sync.coordinator"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

const flushPromises = async () => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve()
}

describe("production sync coordinator", () => {
  it("keeps one request in flight and coalesces queued invalidations", async () => {
    const requests: Array<ReturnType<typeof deferred<string>>> = []
    let activeRequests = 0
    let maximumActiveRequests = 0
    const onSuccess = vi.fn()
    const coordinator = makeProductionSyncCoordinator({
      onStart: vi.fn(),
      onSuccess,
      onError: vi.fn(),
    })
    coordinator.setTarget({
      key: "east:board:run-1",
      load: () => {
        const request = deferred<string>()
        requests.push(request)
        activeRequests += 1
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests)
        return request.promise.finally(() => {
          activeRequests -= 1
        })
      },
    })

    coordinator.setAvailable(true)
    expect(requests).toHaveLength(1)
    const firstInvalidation = coordinator.refresh({ afterMutation: true })
    const secondInvalidation = coordinator.refresh({ afterMutation: true })

    requests[0]!.resolve("first")
    await flushPromises()
    expect(requests).toHaveLength(2)
    expect(maximumActiveRequests).toBe(1)

    requests[1]!.resolve("after-invalidation")
    await expect(firstInvalidation).resolves.toBe("after-invalidation")
    await expect(secondInvalidation).resolves.toBe("after-invalidation")
    expect(onSuccess.mock.calls.map(([value]) => value)).toEqual([
      "first",
      "after-invalidation",
    ])
  })

  it("aborts while hidden or offline and refreshes once on resume", async () => {
    const requests: Array<{
      signal: AbortSignal
      result: ReturnType<typeof deferred<string>>
    }> = []
    const onSuccess = vi.fn()
    const coordinator = makeProductionSyncCoordinator({
      onStart: vi.fn(),
      onSuccess,
      onError: vi.fn(),
    })
    coordinator.setTarget({
      key: "east:schedule",
      load: (signal) => {
        const result = deferred<string>()
        requests.push({ signal, result })
        return result.promise
      },
    })

    coordinator.setAvailable(true)
    coordinator.setAvailable(false)
    expect(requests[0]!.signal.aborted).toBe(true)
    requests[0]!.result.resolve("stale")
    await flushPromises()
    expect(onSuccess).not.toHaveBeenCalled()

    coordinator.setAvailable(true)
    await flushPromises()
    expect(requests).toHaveLength(2)
    requests[1]!.result.resolve("current")
    await flushPromises()
    expect(onSuccess).toHaveBeenCalledWith("current")
  })

  it("discards a stale response after the target changes", async () => {
    const stale = deferred<string>()
    const current = deferred<string>()
    const staleSignals: AbortSignal[] = []
    const onSuccess = vi.fn()
    const coordinator = makeProductionSyncCoordinator({
      onStart: vi.fn(),
      onSuccess,
      onError: vi.fn(),
    })
    coordinator.setTarget({
      key: "east:run-1",
      load: (signal) => {
        staleSignals.push(signal)
        return stale.promise
      },
    })
    coordinator.setAvailable(true)
    coordinator.setTarget({ key: "east:run-2", load: () => current.promise })
    expect(staleSignals[0]!.aborted).toBe(true)

    stale.resolve("run-1")
    await flushPromises()
    current.resolve("run-2")
    await flushPromises()
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith("run-2")
  })

  it("does not strand a queued refresh behind a cancelled request", async () => {
    const stale = deferred<string>()
    const current = deferred<string>()
    const currentLoad = vi.fn(() => current.promise)
    const coordinator = makeProductionSyncCoordinator({
      onStart: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
    })
    coordinator.setTarget({ key: "east:run-1", load: () => stale.promise })
    coordinator.setAvailable(true)

    coordinator.setTarget(
      { key: "east:run-2", load: currentLoad },
      { reuseCurrent: true }
    )
    const refreshed = coordinator.refresh({ afterMutation: true })
    stale.resolve("stale")
    await flushPromises()

    expect(currentLoad).toHaveBeenCalledOnce()
    current.resolve("current")
    await expect(refreshed).resolves.toBe("current")
  })

  it("does not start a timer after a failure", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        unexpectedError({ code: "processor_test_offline", message: "offline" })
      )
      .mockResolvedValueOnce("recovered")
    const onError = vi.fn()
    const coordinator = makeProductionSyncCoordinator({
      onStart: vi.fn(),
      onSuccess: vi.fn(),
      onError,
    })
    coordinator.setTarget({ key: "east:schedule", load })
    coordinator.setAvailable(true)
    await flushPromises()
    expect(load).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)

    await coordinator.refresh()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
