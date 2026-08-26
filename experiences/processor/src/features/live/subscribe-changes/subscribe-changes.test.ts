import { describe, expect, it } from "vitest"
import { makeDescribeSubscribeChangesEventSource } from "./client.ts"
import type { SubscribeChangesClientOperation } from "./types.ts"

const operation: SubscribeChangesClientOperation = {
  operationId: "production.subscribe-changes.v1",
  contract: {
    inputVersion: 1,
    outputVersion: 1,
    failureVersion: 1,
    eventVersion: 1,
  },
  eventStream: {
    method: "GET",
    path: "/production/locations/:locationId/events",
    retryMs: 3_000,
    eventTypes: ["ready", "change", "resync"],
  },
}

describe("Processor subscribe-changes experience", () => {
  it("renders the declared stream route and retains bounded metadata", () => {
    const describe = makeDescribeSubscribeChangesEventSource({ operation })

    const descriptor = describe({
      apiBaseUrl: "/api/",
      locationId: "pressly one/east",
    })

    expect(descriptor).toEqual({
      operationId: "production.subscribe-changes.v1",
      method: "GET",
      url: "/api/production/locations/pressly%20one%2Feast/events",
      retryMs: 3_000,
      eventTypes: ["ready", "change", "resync"],
    })
    expect(Object.isFrozen(descriptor)).toBe(true)
    expect(Object.isFrozen(descriptor.eventTypes)).toBe(true)
  })
})
