import type {
  ActiveProductionLocation,
  ProductionCapabilitiesForLocation,
} from "@pressly/access-system/capabilities/experience-access-v1"
import type { ProcessorAccess } from "../../../server/authentication/model.ts"
import type {
  ProcessorAccessSession,
  ProcessorApplicationOrigins,
} from "./model.ts"

type ResolveProductionCapabilities = ProductionCapabilitiesForLocation

const applicationsFor = (input: {
  origins: ProcessorApplicationOrigins
  includeControl: boolean
}): ProcessorAccess["applications"] => [
  {
    id: "processor",
    label: "Pressly Processor",
    description: "Run intake, scheduling, and laundry-floor production.",
    href: input.origins.processor,
  },
  ...(input.includeControl
    ? [
        {
          id: "control" as const,
          label: "Pressly Control",
          description:
            "Manage people, customers, orders, and account security.",
          href: input.origins.control,
        },
      ]
    : []),
]

const controlBusinessIdsFor = (
  session: ProcessorAccessSession,
  locations: readonly ActiveProductionLocation[]
): readonly string[] => [
  ...new Set(
    session.principalAttributes.assignments.flatMap((assignment) => {
      if (assignment.role !== "owner" && assignment.role !== "manager")
        return []
      if (assignment.scope.kind === "business") return [assignment.scope.id]
      if (assignment.scope.kind !== "location") return []
      const location = locations.find(
        (candidate) => candidate.id === assignment.scope.id
      )
      return location === undefined ? [] : [location.businessId]
    })
  ),
]

export const resolveProcessorAccess = (input: {
  session: ProcessorAccessSession
  locations: readonly ActiveProductionLocation[]
  origins: ProcessorApplicationOrigins
  now: Date
  resolveCapabilities: ResolveProductionCapabilities
}): ProcessorAccess | null => {
  const locations = input.locations.flatMap((location) => {
    const capabilities = input.resolveCapabilities({
      principal: input.session.principal,
      principalAttributes: input.session.principalAttributes,
      locationId: location.id,
      businessId: location.businessId,
      now: input.now,
    })
    if (!capabilities.includes("production:read")) return []

    return [
      {
        id: location.id,
        name: location.name,
        timezone: location.timezone,
        capabilities: ["processor:view" as const, ...capabilities],
      },
    ]
  })
  if (locations.length === 0) return null

  const controlBusinessIds = controlBusinessIdsFor(
    input.session,
    input.locations
  )
  return {
    locations,
    applications: applicationsFor({
      origins: input.origins,
      includeControl: controlBusinessIds.length === 1,
    }),
  }
}
