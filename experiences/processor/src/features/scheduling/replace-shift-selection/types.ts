import type {
  ReplaceProductionShiftSelectionCommand,
  ReplaceProductionShiftSelectionResult,
} from "@pressly/production-system/contracts/scheduling/replace-shift-selection"

export type ReplaceShiftSelectionClientOperation = Readonly<{
  operationId: "production.replace-shift-selection.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    selection: Readonly<{ method: "PUT"; path: string }>
  }>
}>

export type ReplaceShiftSelectionClient = (
  request: ReplaceProductionShiftSelectionCommand
) => Promise<ReplaceProductionShiftSelectionResult>
