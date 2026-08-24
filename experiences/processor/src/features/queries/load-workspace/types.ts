import type { ProcessorProductionWorkspace } from "../../../contracts/production-workspace.ts"

export type LoadProductionWorkspaceClientOperation = Readonly<{
  operationId: "processor.load-production-workspace.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    workspace: Readonly<{ method: "GET"; path: string }>
  }>
}>

export type LoadProductionWorkspaceClient = (
  locationId: string,
  shiftId?: string,
  signal?: AbortSignal
) => Promise<ProcessorProductionWorkspace>
