import { describe, expect, it, vi } from "vitest"
import {
  makeResolveProcessorAccessCell,
  processorCellDeclarations,
  resolveProcessorAccess,
  resolveProcessorAccessCellDeclaration,
  type ProcessorAccessSession,
} from "../src/server.ts"

const now = new Date("2026-08-22T16:00:00.000Z")
const session: ProcessorAccessSession = {
  principal: {
    identityId: "identity-1",
    kind: "human",
    displayName: "Processor Operator",
    sessionId: "session-1",
    sessionIssuedAt: new Date("2026-08-22T15:55:00.000Z"),
    sessionExpiresAt: new Date("2026-08-22T16:30:00.000Z"),
  },
  principalAttributes: {
    assignments: [
      {
        role: "manager",
        scope: { kind: "location", id: "east" },
        state: "active",
        version: 1,
      },
      {
        role: "operator",
        scope: { kind: "location", id: "west" },
        state: "active",
        version: 1,
      },
    ],
    identityActive: true,
    assuranceLevel: "mfa",
  },
}
const locations = [
  {
    id: "east",
    businessId: "business-a",
    name: "East",
    timezone: "America/New_York",
  },
  {
    id: "west",
    businessId: "business-b",
    name: "West",
    timezone: "America/Chicago",
  },
] as const
const origins = {
  processor: "https://processor.pressly.test",
  control: "https://control.pressly.test",
} as const

describe("Processor access resolver", () => {
  it("preserves the selected projection and single-business Control rule", () => {
    const access = resolveProcessorAccess({
      session,
      locations,
      origins,
      now,
      resolveCapabilities: ({ locationId }) =>
        locationId === "east"
          ? ["production:read", "production:schedule"]
          : ["production:read"],
    })

    expect(access).toEqual({
      locations: [
        {
          id: "east",
          name: "East",
          timezone: "America/New_York",
          capabilities: [
            "processor:view",
            "production:read",
            "production:schedule",
          ],
        },
        {
          id: "west",
          name: "West",
          timezone: "America/Chicago",
          capabilities: ["processor:view", "production:read"],
        },
      ],
      applications: [
        {
          id: "processor",
          label: "Pressly Processor",
          description: "Run intake, scheduling, and laundry-floor production.",
          href: origins.processor,
        },
        {
          id: "control",
          label: "Pressly Control",
          description:
            "Manage people, customers, orders, and account security.",
          href: origins.control,
        },
      ],
    })
  })

  it("returns null when no active location grants production read", () => {
    expect(
      resolveProcessorAccess({
        session,
        locations,
        origins,
        now,
        resolveCapabilities: () => [],
      })
    ).toBeNull()
  })

  it("performs one ordered Access read before clock and capability projection", async () => {
    const events: string[] = []
    const listActiveProductionLocations = {
      execute: vi.fn(async () => {
        events.push("list-locations")
        return { kind: "success" as const, value: { locations } }
      }),
    }
    const cell = makeResolveProcessorAccessCell({
      listActiveProductionLocations,
      resolveProductionCapabilities: ({ locationId }) => {
        events.push(`capabilities:${locationId}`)
        return ["production:read"]
      },
      clock: {
        now: () => {
          events.push("clock")
          return now
        },
      },
      origins,
    })

    await expect(cell.execute(session)).resolves.toMatchObject({
      kind: "success",
      value: { locations: [{ id: "east" }, { id: "west" }] },
    })
    expect(listActiveProductionLocations.execute).toHaveBeenCalledOnce()
    expect(events).toEqual([
      "list-locations",
      "clock",
      "capabilities:east",
      "capabilities:west",
    ])
  })

  it("publishes a strict headless ISO boundary and the 12-cell composite inventory", () => {
    expect(Object.keys(processorCellDeclarations)).toHaveLength(12)
    expect(resolveProcessorAccessCellDeclaration.surfaces).toEqual([])
    const encoded =
      resolveProcessorAccessCellDeclaration.contract.input.encode(session)
    expect(encoded).toMatchObject({
      principal: {
        sessionIssuedAt: "2026-08-22T15:55:00.000Z",
        sessionExpiresAt: "2026-08-22T16:30:00.000Z",
      },
    })
    expect(
      resolveProcessorAccessCellDeclaration.contract.input.decode(encoded)
    ).toEqual({ kind: "valid", value: session })
    expect(
      resolveProcessorAccessCellDeclaration.contract.input.decode({
        unexpected: true,
      }).kind
    ).toBe("invalid")
  })
})
