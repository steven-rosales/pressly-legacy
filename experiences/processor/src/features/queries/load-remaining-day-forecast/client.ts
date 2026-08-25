import {
  processorRemainingDayForecastSchema,
  type ProcessorRemainingDayForecast,
} from "../../../contracts/remaining-day-forecast.ts"
import type {
  LoadRemainingDayForecastClient,
  LoadRemainingDayForecastClientOperation,
} from "./types.ts"

export type LoadRemainingDayForecastRequestTransport = (
  input: Readonly<{
    method: "GET"
    path: string
    signal?: AbortSignal
  }>,
  outputSchema: typeof processorRemainingDayForecastSchema
) => Promise<ProcessorRemainingDayForecast>

const renderPath = (
  template: string,
  parameters: Readonly<{ locationId: string }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

export const makeLoadRemainingDayForecastClient =
  (input: {
    operation: LoadRemainingDayForecastClientOperation
    request: LoadRemainingDayForecastRequestTransport
  }): LoadRemainingDayForecastClient =>
  async ({ locationId, serviceDay, signal }) =>
    input.request(
      {
        method: input.operation.http.forecast.method,
        path: `${renderPath(input.operation.http.forecast.path, {
          locationId,
        })}?${new URLSearchParams({ serviceDay }).toString()}`,
        ...(signal === undefined ? {} : { signal }),
      },
      processorRemainingDayForecastSchema
    )
