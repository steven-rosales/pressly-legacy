import type { ProcessorRemainingDayForecast } from "../../../contracts/remaining-day-forecast.ts"

export type LoadRemainingDayForecastRequest = Readonly<{
  locationId: string
  serviceDay: string
  signal?: AbortSignal
}>

export type LoadRemainingDayForecastClientOperation = Readonly<{
  operationId: "processor.load-remaining-day-forecast.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Readonly<{
    forecast: Readonly<{ method: "GET"; path: string }>
  }>
}>

export type LoadRemainingDayForecastClient = (
  request: LoadRemainingDayForecastRequest
) => Promise<ProcessorRemainingDayForecast>
