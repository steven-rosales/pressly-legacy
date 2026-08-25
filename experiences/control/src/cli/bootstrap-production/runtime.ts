import {
  productionBootstrapManifestSchema,
  productionBootstrapResultSchema,
} from "@pressly/production-system/contracts/resources/manage-resources"
import type {
  AccessProductionLocation,
  ReconcileProductionLocationResult,
} from "@pressly/access-system/contracts/reconcile-production-location-v1"
import {
  manageSourceLocationBindingsResultSchema,
  sourceLocationBindingResourceInputSchema,
} from "@pressly/ingress-system/contracts/webhook-ingestion-v1"
import { validationError } from "@pressly/errors/factories"
import type { BootstrapAuthorityResult } from "../../cells/cli/bootstrap-production/contract.ts"
import type { AdminCliProductionBootstrapDependencies } from "../../cells/cli/bootstrap-production/execute.ts"
import type { CliFailure } from "../model.ts"
import {
  type ReconcileSourceLocationBindingsResult,
  type SourceLocationBindingsManifest,
} from "@pressly/ingress-system/capabilities/source-location-bindings-v1"
import {
  type ManageResourcesExpectedFailure,
  type ManageResourcesResult,
  type ProductionBootstrapManifest,
} from "@pressly/production-system/contracts/resources/manage-resources"
import { z } from "zod"
import { cliFailureFromUnknown } from "../adapters/outcome.ts"

const MAX_MANIFEST_BYTES = 1_048_576

const lpmsBootstrapManifestSchema = productionBootstrapManifestSchema
  .safeExtend({
    sourceLocationBindings: z
      .array(sourceLocationBindingResourceInputSchema)
      .default([]),
  })
  .superRefine((manifest, context) => {
    manifest.sourceLocationBindings.forEach((binding, index) => {
      if (binding.locationId !== manifest.location.id)
        context.addIssue({
          code: "custom",
          path: ["sourceLocationBindings", index, "locationId"],
          message:
            "Every source-location binding must belong to the manifest location.",
        })
    })

    const seen = new Set<string>()
    manifest.sourceLocationBindings.forEach((binding, index) => {
      const key = `${binding.source}\u0000${binding.externalLocationId}`
      if (seen.has(key))
        context.addIssue({
          code: "custom",
          path: ["sourceLocationBindings", index],
          message: `Duplicate source-location binding: ${binding.source}:${binding.externalLocationId}.`,
        })
      seen.add(key)
    })
  })

type LpmsBootstrapManifest = z.output<typeof lpmsBootstrapManifestSchema>
type ProductionBootstrapWireManifest = z.output<
  typeof productionBootstrapManifestSchema
>

type ProductionAuthorityOutcome = Promise<
  | Readonly<{ kind: "success"; value: BootstrapAuthorityResult }>
  | Readonly<{ kind: "failure"; failure: CliFailure }>
>

export type ProductionAuthorities = Readonly<{
  manageLocation: (
    input: Readonly<{
      location: AccessProductionLocation
      dryRun: boolean
    }>,
  ) => ProductionAuthorityOutcome
  manageProduction: (
    input: Readonly<{
      manifest: ProductionBootstrapManifest
      actorId: string
      dryRun: boolean
      idempotencyKey: string
    }>,
  ) => ProductionAuthorityOutcome
  manageSourceLocationBindings: (
    input: Readonly<{
      manifest: SourceLocationBindingsManifest
      dryRun: boolean
    }>,
  ) => ProductionAuthorityOutcome
}>

export type ProductionAuthorityCells = Readonly<{
  manageLocation: (
    input: Parameters<ProductionAuthorities["manageLocation"]>[0],
  ) => Promise<
    | Readonly<{ kind: "success"; value: ReconcileProductionLocationResult }>
    | Readonly<{ kind: "failure"; failure: never }>
  >
  manageProduction: (
    input: Parameters<ProductionAuthorities["manageProduction"]>[0],
  ) => Promise<
    | Readonly<{ kind: "success"; value: ManageResourcesResult }>
    | Readonly<{
        kind: "failure"
        failure: ManageResourcesExpectedFailure
      }>
  >
  manageSourceLocationBindings: (
    input: Parameters<ProductionAuthorities["manageSourceLocationBindings"]>[0],
  ) => Promise<
    | Readonly<{
        kind: "success"
        value: ReconcileSourceLocationBindingsResult
      }>
    | Readonly<{ kind: "failure"; failure: unknown }>
  >
}>

const sourceBindingsManifest = (
  bindings: LpmsBootstrapManifest["sourceLocationBindings"],
): SourceLocationBindingsManifest => ({
  sourceLocationBindings: bindings.map((binding) => ({
    source: binding.source,
    externalLocationId: binding.externalLocationId,
    locationId: binding.locationId,
    isActive: binding.isActive,
  })),
})

const productionManifest = (
  manifest: ProductionBootstrapWireManifest,
): ProductionBootstrapManifest => ({
  schemaVersion: manifest.schemaVersion,
  location: {
    id: manifest.location.id,
    businessId: manifest.location.businessId,
    name: manifest.location.name,
    timezone: manifest.location.timezone,
    isActive: manifest.location.isActive,
  },
  stations: manifest.stations.map((station) => ({
    locationId: station.locationId,
    kind: station.kind,
    label: station.label,
    sortOrder: station.sortOrder,
    isActive: station.isActive,
  })),
  machines: manifest.machines.map((machine) => ({
    locationId: machine.locationId,
    stationKind: machine.stationKind,
    label: machine.label,
    manufacturerCapacityLbs: machine.manufacturerCapacityLbs,
    effectiveCapacityLbs: machine.effectiveCapacityLbs,
    capacitySafetyMarginLbs: machine.capacitySafetyMarginLbs,
    isActive: machine.isActive,
  })),
  schedulerConfig: {
    locationId: manifest.schedulerConfig.locationId,
    pulseMinutes: manifest.schedulerConfig.pulseMinutes,
    foldLbsPerFolderMinute: manifest.schedulerConfig.foldLbsPerFolderMinute,
    algorithmVersion: manifest.schedulerConfig.algorithmVersion,
    stageFitAssertion: {
      sortingFits: manifest.schedulerConfig.stageFitAssertion.sortingFits,
      washingFits: manifest.schedulerConfig.stageFitAssertion.washingFits,
      dryingFits: manifest.schedulerConfig.stageFitAssertion.dryingFits,
    },
  },
})

const productionResult = (
  result: ManageResourcesResult,
): BootstrapAuthorityResult =>
  productionBootstrapResultSchema.parse({
    mode: result.mode,
    status: result.status,
    configurationHash: result.configurationHash,
    operations: result.operations.map((operation) => ({
      resourceType: operation.resourceType,
      naturalKey: operation.naturalKey,
      outcome: operation.outcome,
      changedFields: [...operation.changedFields],
    })),
    rejections: result.rejections.map((rejection) => ({
      resourceType: rejection.resourceType,
      naturalKey: rejection.naturalKey,
      outcome: rejection.outcome,
      code: rejection.code,
      message: rejection.message,
    })),
    summary: {
      created: result.summary.created,
      updated: result.summary.updated,
      noop: result.summary.noop,
      rejected: result.summary.rejected,
    },
    replayed: result.replayed,
    applied: result.applied,
  })

const locationResult = (
  result: ReconcileProductionLocationResult,
): BootstrapAuthorityResult => ({
  mode: result.mode,
  status: result.status,
  applied: result.applied,
  operation: result.operation,
  rejections: result.rejections.map((rejection) => ({ ...rejection })),
})

const sourceBindingsResult = (
  result: ReconcileSourceLocationBindingsResult,
): BootstrapAuthorityResult =>
  manageSourceLocationBindingsResultSchema.parse({
    mode: result.mode,
    status: result.status,
    applied: result.applied,
    operations: result.operations.map((operation) => ({
      source: operation.source,
      externalLocationId: operation.externalLocationId,
      locationId: operation.locationId,
      outcome: operation.outcome,
    })),
    rejections: result.rejections.map((rejection) => ({
      source: rejection.source,
      externalLocationId: rejection.externalLocationId,
      code: rejection.code,
      message: rejection.message,
    })),
  })

const productionFailure = (
  failure: ManageResourcesExpectedFailure,
): CliFailure => ({
  kind: "diagnostic",
  code: failure.code,
  message: failure.safeMessage,
})

export const makeProductionAuthorities = (
  cells: ProductionAuthorityCells,
): ProductionAuthorities =>
  Object.freeze({
    manageLocation: async (input) => {
      const outcome = await cells.manageLocation(input)
      return outcome.kind === "failure"
        ? outcome
        : { kind: "success", value: locationResult(outcome.value) }
    },
    manageProduction: async (input) => {
      const outcome = await cells.manageProduction(input)
      return outcome.kind === "failure"
        ? { kind: "failure", failure: productionFailure(outcome.failure) }
        : { kind: "success", value: productionResult(outcome.value) }
    },
    manageSourceLocationBindings: async (input) => {
      const outcome = await cells.manageSourceLocationBindings(input)
      return outcome.kind === "failure"
        ? {
            kind: "failure",
            failure: {
              kind: "diagnostic",
              code: "source_location_bindings_unexpected_failure",
              message: "Source-location bindings could not be managed.",
            },
          }
        : { kind: "success", value: sourceBindingsResult(outcome.value) }
    },
  })

export const readProductionManifest = async (
  file: string,
  readText: (file: string) => Promise<string>,
): Promise<LpmsBootstrapManifest> => {
  const source = await readText(file)
  if (new TextEncoder().encode(source).byteLength > MAX_MANIFEST_BYTES)
    throw validationError({
      code: "production_bootstrap_file_too_large",
      message: "Production bootstrap input exceeds one MiB.",
      safeMessage: "Production bootstrap input exceeds one MiB.",
    })

  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (cause) {
    throw validationError({
      code: "production_bootstrap_json_invalid",
      message: "Production bootstrap input is not valid JSON.",
      safeMessage: "Production bootstrap input is not valid JSON.",
      cause,
    })
  }

  const manifest = lpmsBootstrapManifestSchema.safeParse(parsed)
  if (!manifest.success)
    throw validationError({
      code: "production_bootstrap_manifest_invalid",
      message: "Production bootstrap manifest violates its contract.",
      safeMessage: "Production bootstrap manifest is invalid.",
      details: {
        issues: manifest.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      },
    })
  return manifest.data
}

export const makeProductionBootstrap = (
  input: Readonly<{
    authorities: () => ProductionAuthorities
    readText: (file: string) => Promise<string>
    runExclusive: <Value>(work: () => Promise<Value>) => Promise<Value>
  }>,
): AdminCliProductionBootstrapDependencies => ({
  runExclusive: input.runExclusive,
  prepare: async (file) => {
    try {
      const authorities = input.authorities()
      const manifest = await readProductionManifest(file, input.readText)
      const { sourceLocationBindings, ...productionInput } = manifest
      const mappedProduction = productionManifest(
        productionBootstrapManifestSchema.parse(productionInput),
      )
      const mappedBindings = sourceBindingsManifest(sourceLocationBindings)

      return Object.freeze({
        kind: "success" as const,
        value: Object.freeze({
          manageLocation: ({ dryRun }: Readonly<{ dryRun: boolean }>) =>
            authorities.manageLocation({
              location: mappedProduction.location,
              dryRun,
            }),
          manageProduction: ({
            actorId,
            dryRun,
            idempotencyKey,
          }: Readonly<{
            actorId: string
            dryRun: boolean
            idempotencyKey: string
          }>) =>
            authorities.manageProduction({
              manifest: mappedProduction,
              actorId,
              dryRun,
              idempotencyKey,
            }),
          manageSourceLocationBindings: ({
            dryRun,
          }: Readonly<{ dryRun: boolean }>) =>
            authorities.manageSourceLocationBindings({
              manifest: mappedBindings,
              dryRun,
            }),
        }),
      })
    } catch (error: unknown) {
      return Object.freeze({
        kind: "failure" as const,
        failure: cliFailureFromUnknown(error),
      })
    }
  },
})
