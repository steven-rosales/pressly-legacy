import {
  processorProductionWorkspaceSchema,
  type ProcessorProductionWorkspace,
} from "../../../contracts/production-workspace.ts"
import type {
  LoadProductionWorkspaceClient,
  LoadProductionWorkspaceClientOperation,
} from "./types.ts"

export type LoadProductionWorkspaceRequestTransport = (
  input: Readonly<{
    method: "GET"
    path: string
    signal?: AbortSignal
  }>,
  outputSchema: typeof processorProductionWorkspaceSchema
) => Promise<ProcessorProductionWorkspace>

const renderPath = (
  template: string,
  parameters: Readonly<{ locationId: string }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

export const makeLoadProductionWorkspaceClient =
  (input: {
    operation: LoadProductionWorkspaceClientOperation
    request: LoadProductionWorkspaceRequestTransport
  }): LoadProductionWorkspaceClient =>
  async (locationId, shiftId, signal) => {
    const query = new URLSearchParams()
    if (shiftId !== undefined) query.set("shiftId", shiftId)
    const suffix = query.size === 0 ? "" : `?${query.toString()}`
    return input.request(
      {
        method: input.operation.http.workspace.method,
        path: `${renderPath(input.operation.http.workspace.path, {
          locationId,
        })}${suffix}`,
        ...(signal === undefined ? {} : { signal }),
      },
      processorProductionWorkspaceSchema
    )
  }
