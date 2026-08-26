import type { CliOutcome } from "../../../cli/model.ts"
import type {
  BootstrapAuthorityResult,
  ProductionBootstrapCliInput,
} from "./contract.ts"
import { adminCliProductionBootstrapCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

export type PreparedProductionBootstrap = Readonly<{
  manageLocation: (
    input: Readonly<{ dryRun: boolean }>,
  ) => CliOutcome<BootstrapAuthorityResult>
  manageProduction: (
    input: Readonly<{
      actorId: string
      dryRun: boolean
      idempotencyKey: string
    }>,
  ) => CliOutcome<BootstrapAuthorityResult>
  manageSourceLocationBindings: (
    input: Readonly<{
      dryRun: boolean
    }>,
  ) => CliOutcome<BootstrapAuthorityResult>
}>

export type AdminCliProductionBootstrapDependencies = Readonly<{
  prepare: (file: string) => CliOutcome<PreparedProductionBootstrap>
  runExclusive: <Value>(work: () => Promise<Value>) => Promise<Value>
}>

const executePreparedProductionBootstrap = async (
  input: ProductionBootstrapCliInput,
  prepared: PreparedProductionBootstrap,
) => {
  const locationPreview = await prepared.manageLocation({ dryRun: true })
  if (locationPreview.kind === "failure") return locationPreview
  const productionPreview = await prepared.manageProduction({
    actorId: input.actorId,
    idempotencyKey: input.idempotencyKey,
    dryRun: true,
  })
  if (productionPreview.kind === "failure") return productionPreview
  const bindingsPreview = await prepared.manageSourceLocationBindings({
    dryRun: true,
  })
  if (bindingsPreview.kind === "failure") return bindingsPreview
  if (
    input.dryRun ||
    locationPreview.value.status === "rejected" ||
    productionPreview.value.status === "rejected" ||
    bindingsPreview.value.status === "rejected"
  )
    return {
      kind: "success" as const,
      value: {
        location: locationPreview.value,
        production: productionPreview.value,
        sourceLocationBindings: bindingsPreview.value,
      },
    }
  const location = await prepared.manageLocation({ dryRun: false })
  if (location.kind === "failure") return location
  const production = await prepared.manageProduction({
    actorId: input.actorId,
    idempotencyKey: input.idempotencyKey,
    dryRun: false,
  })
  if (production.kind === "failure") return production
  const bindings = await prepared.manageSourceLocationBindings({
    dryRun: false,
  })
  if (bindings.kind === "failure") return bindings
  return {
    kind: "success" as const,
    value: {
      location: location.value,
      production: production.value,
      sourceLocationBindings: bindings.value,
    },
  }
}

export const makeAdminCliProductionBootstrapCell = (
  dependencies: AdminCliProductionBootstrapDependencies,
) =>
  defineOperation(adminCliProductionBootstrapCellDeclaration, async (input) => {
    const prepared = await dependencies.prepare(input.file)
    if (prepared.kind === "failure") return prepared
    return dependencies.runExclusive(() =>
      executePreparedProductionBootstrap(input, prepared.value),
    )
  })
