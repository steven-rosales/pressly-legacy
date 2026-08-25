import type {
  DescribeSubscribeChangesEventSource,
  SubscribeChangesClientOperation,
} from "./types.ts"

const renderPath = (
  template: string,
  parameters: Readonly<{ locationId: string }>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

const joinUrl = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`

export const makeDescribeSubscribeChangesEventSource = (input: {
  operation: SubscribeChangesClientOperation
}): DescribeSubscribeChangesEventSource => {
  const { eventStream, operationId } = input.operation
  return ({ apiBaseUrl, locationId }) =>
    Object.freeze({
      operationId,
      method: eventStream.method,
      url: joinUrl(apiBaseUrl, renderPath(eventStream.path, { locationId })),
      retryMs: eventStream.retryMs,
      eventTypes: Object.freeze([...eventStream.eventTypes]) as readonly [
        "ready",
        "change",
        "resync",
      ],
    })
}
