import { describe, expect, it, vi } from "vitest"
import { makeResolveControlAccessCell } from "../src/cells/access/resolve-access/execute.ts"

const origins = {
  controlOrigin: "https://control.pressly.test",
  processorOrigin: "https://processor.pressly.test",
}

describe("resolve Control access", () => {
  it("returns null without loading locations when Control grants are absent or ambiguous", async () => {
    const listActiveBusinessLocations = {
      execute: vi.fn(async () => ({
        kind: "success" as const,
        value: { locations: [] },
      })),
    }
    const absent = makeResolveControlAccessCell({
      ...origins,
      listActiveBusinessLocations,
      listEffectiveAccessGrants: {
        execute: async () => ({
          kind: "success",
          value: {
            grants: [
              {
                businessId: "business-a",
                businessName: "Business A",
                role: "operator",
                scopeKind: "business",
                scopeId: "business-a",
              },
            ],
          },
        }),
      },
    })
    await expect(
      absent.execute({ identityId: "identity-1", assuranceLevel: "mfa" }),
    ).resolves.toEqual({ kind: "success", value: null })

    const ambiguous = makeResolveControlAccessCell({
      ...origins,
      listActiveBusinessLocations,
      listEffectiveAccessGrants: {
        execute: async () => ({
          kind: "success",
          value: {
            grants: [
              {
                businessId: "business-a",
                businessName: "Business A",
                role: "owner",
                scopeKind: "business",
                scopeId: "business-a",
              },
              {
                businessId: "business-b",
                businessName: "Business B",
                role: "manager",
                scopeKind: "business",
                scopeId: "business-b",
              },
            ],
          },
        }),
      },
    })
    await expect(
      ambiguous.execute({ identityId: "identity-1", assuranceLevel: "mfa" }),
    ).resolves.toEqual({ kind: "success", value: null })
    expect(listActiveBusinessLocations.execute).not.toHaveBeenCalled()
  })

  it("preserves location filtering, capabilities, ordering and application links", async () => {
    const cell = makeResolveControlAccessCell({
      ...origins,
      listEffectiveAccessGrants: {
        execute: async () => ({
          kind: "success",
          value: {
            grants: [
              {
                businessId: "business-a",
                businessName: "Business A",
                role: "manager",
                scopeKind: "location",
                scopeId: "east",
              },
              {
                businessId: "business-a",
                businessName: "Business A",
                role: "operator",
                scopeKind: "location",
                scopeId: "west",
              },
            ],
          },
        }),
      },
      listActiveBusinessLocations: {
        execute: async () => ({
          kind: "success",
          value: {
            locations: [
              { id: "east", name: "East", timezone: "America/New_York" },
              { id: "west", name: "West", timezone: "America/New_York" },
            ],
          },
        }),
      },
    })

    await expect(
      cell.execute({ identityId: "identity-1", assuranceLevel: "mfa" }),
    ).resolves.toMatchObject({
      kind: "success",
      value: {
        business: { id: "business-a", name: "Business A" },
        locations: [{ id: "east" }],
        selectedLocationId: "east",
        capabilities: [
          "control:view",
          "team:read",
          "team:write",
          "customers:read",
          "customers:write",
          "orders:read",
          "orders:write",
          "security:read",
          "processor:view",
        ],
        applications: [{ id: "control" }, { id: "processor" }],
      },
    })
  })
})
