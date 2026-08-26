import { defineOperation } from "@pressly/cells"
import type { AccessExecute } from "../../../auth/model/access.ts"
import type { ControlAccess } from "../../../auth/model/schemas.ts"
import type { ResolveControlAccessInput } from "./contract.ts"
import { resolveControlAccessCellDeclaration } from "./cell.ts"

export type ResolveControlAccessDependencies = Readonly<{
  listEffectiveAccessGrants: AccessExecute<"listEffectiveAccessGrants">
  listActiveBusinessLocations: AccessExecute<"listActiveBusinessLocations">
  controlOrigin: string
  processorOrigin: string
}>

const capabilitiesFor = (
  roleFacts: readonly Readonly<{ role: "manager" | "owner" }>[],
  assuranceLevel: ResolveControlAccessInput["assuranceLevel"],
) => {
  if (assuranceLevel !== "mfa")
    return ["control:view", "auth:mfa:enroll"] as const

  return [
    "control:view",
    "team:read",
    "team:write",
    "customers:read",
    "customers:write",
    "orders:read",
    "orders:write",
    "security:read",
    "processor:view",
    ...(roleFacts.some((grant) => grant.role === "owner")
      ? (["security:write"] as const)
      : []),
  ] as const
}

export const makeResolveControlAccessCell = (
  dependencies: ResolveControlAccessDependencies,
) =>
  defineOperation(resolveControlAccessCellDeclaration, async (input) => {
    const listed = await dependencies.listEffectiveAccessGrants.execute(
      input.identityId,
    )
    if (listed.kind === "failure") return listed

    const controlGrants = listed.value.grants.filter(
      (
        grant,
      ): grant is typeof grant & Readonly<{ role: "manager" | "owner" }> =>
        grant.role === "owner" || grant.role === "manager",
    )
    if (controlGrants.length === 0) return { kind: "success", value: null }

    const businessIds = new Set(controlGrants.map((grant) => grant.businessId))
    if (businessIds.size !== 1) return { kind: "success", value: null }

    const firstGrant = controlGrants[0]
    if (firstGrant === undefined) return { kind: "success", value: null }
    const businessId = firstGrant.businessId
    const locations =
      await dependencies.listActiveBusinessLocations.execute(businessId)
    if (locations.kind === "failure") return locations

    const hasBusinessScope = controlGrants.some(
      (grant) => grant.scopeKind === "business",
    )
    const allowedLocationIds = new Set(
      controlGrants.flatMap((grant) =>
        grant.scopeKind === "location" ? [grant.scopeId] : [],
      ),
    )
    const visibleLocations = hasBusinessScope
      ? locations.value.locations
      : locations.value.locations.filter((location) =>
          allowedLocationIds.has(location.id),
        )
    const businessGrants = listed.value.grants.filter(
      (grant) => grant.businessId === businessId,
    )
    const value: ControlAccess = {
      business: { id: businessId, name: firstGrant.businessName },
      locations: visibleLocations.map((location) => ({ ...location })),
      selectedLocationId: visibleLocations[0]?.id ?? null,
      capabilities: [...capabilitiesFor(controlGrants, input.assuranceLevel)],
      applications: [
        {
          id: "control",
          label: "Pressly Control",
          description:
            "Manage people, customers, orders, and account security.",
          href: dependencies.controlOrigin,
        },
        ...(visibleLocations.length > 0 &&
        businessGrants.some((grant) =>
          ["owner", "manager", "operator"].includes(grant.role),
        )
          ? [
              {
                id: "processor" as const,
                label: "Pressly Processor",
                description:
                  "Run intake, scheduling, and laundry-floor production.",
                href: dependencies.processorOrigin,
              },
            ]
          : []),
      ],
    }
    return { kind: "success", value }
  })
