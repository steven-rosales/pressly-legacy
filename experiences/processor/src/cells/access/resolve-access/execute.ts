import type {
  AccessExperienceOperations,
  ProductionCapabilitiesForLocation,
} from "@pressly/access-system/capabilities/experience-access-v1"
import { bindCell } from "@pressly/cells"
import { resolveProcessorAccessCellDeclaration } from "./cell.ts"
import type { ProcessorApplicationOrigins } from "./model.ts"
import { resolveProcessorAccess } from "./policy.ts"

export type ResolveProcessorAccessDependencies = Readonly<{
  listActiveProductionLocations: Pick<
    AccessExperienceOperations["listActiveProductionLocations"],
    "execute"
  >
  resolveProductionCapabilities: ProductionCapabilitiesForLocation
  clock: Readonly<{ now: () => Date }>
  origins: ProcessorApplicationOrigins
}>

export const makeResolveProcessorAccessCell = (
  dependencies: ResolveProcessorAccessDependencies
) =>
  bindCell(resolveProcessorAccessCellDeclaration, async (session) => {
    const locations =
      await dependencies.listActiveProductionLocations.execute(null)
    if (locations.kind === "failure") return locations

    return {
      kind: "success",
      value: resolveProcessorAccess({
        session,
        locations: locations.value.locations,
        origins: dependencies.origins,
        now: dependencies.clock.now(),
        resolveCapabilities: dependencies.resolveProductionCapabilities,
      }),
    }
  })
