import type { ProductionCapabilitiesForLocation } from "@pressly/access-system/capabilities/experience-access-v1"
import type { ProcessorAccess } from "../../../server/authentication/model.ts"

export type ProcessorAccessSession =
  Parameters<ProductionCapabilitiesForLocation>[0]["principal"] extends infer Principal
    ? Readonly<{
        principal: Principal
        principalAttributes: Parameters<ProductionCapabilitiesForLocation>[0]["principalAttributes"]
      }>
    : never

export type ProcessorApplicationOrigins = Readonly<{
  processor: string
  control: string
}>

export type ResolvedProcessorAccess = ProcessorAccess | null
