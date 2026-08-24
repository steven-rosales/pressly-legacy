export type SubscribeChangesClientOperation = Readonly<{
  operationId: "production.subscribe-changes.v1"
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
    eventVersion: number
  }>
  eventStream: Readonly<{
    method: "GET"
    path: string
    retryMs: number
    eventTypes: readonly ["ready", "change", "resync"]
  }>
}>

export type SubscribeChangesEventSourceDescriptor = Readonly<{
  operationId: "production.subscribe-changes.v1"
  method: "GET"
  url: string
  retryMs: number
  eventTypes: readonly ["ready", "change", "resync"]
}>

export type DescribeSubscribeChangesEventSource = (input: {
  apiBaseUrl: string
  locationId: string
}) => SubscribeChangesEventSourceDescriptor
