import {
  incomingOrderProposalDecisionHttpResultSchema,
  incomingOrderProposalListHttpResultSchema,
  restoreIncomingOrderProposalHttpResultSchema,
} from "@pressly/orders-system/http/order-management"
import {
  strictWireCodec,
  type ProcessorBrowserRequestTransport,
} from "../transport.ts"
import type {
  ProcessorOrderOperations,
  ProcessorOrdersBrowserClient,
} from "./types.ts"

const renderPath = (
  template: string,
  parameters: Readonly<Record<string, string>>
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template
  )

const incomingOrderPath = (
  template: string,
  locationId: string,
  proposalId?: string
): string =>
  renderPath(template, {
    locationId,
    ...(proposalId === undefined ? {} : { proposalId }),
  })

const listCodec = strictWireCodec(incomingOrderProposalListHttpResultSchema)
const decisionCodec = strictWireCodec(
  incomingOrderProposalDecisionHttpResultSchema
)
const restoreCodec = strictWireCodec(
  restoreIncomingOrderProposalHttpResultSchema
)

export const makeProcessorOrdersBrowserClient = (
  input: Readonly<{
    operations: ProcessorOrderOperations
    request: ProcessorBrowserRequestTransport
  }>
): ProcessorOrdersBrowserClient =>
  Object.freeze({
    listIncomingOrders: ({
      locationId,
      view,
      limit = 100,
      cursor = null,
      signal,
    }) => {
      const surface =
        input.operations.listIncomingOrders.http["incoming-orders"]
      const query = new URLSearchParams({ limit: String(limit), view })
      if (cursor !== null) query.set("cursor", cursor)
      return input.request(
        {
          method: surface.method,
          path: `${incomingOrderPath(surface.path, locationId)}?${query.toString()}`,
          ...(signal === undefined ? {} : { signal }),
        },
        listCodec
      )
    },
    acceptIncomingOrder: ({ locationId, proposalId, request: body }) => {
      const surface = input.operations.acceptIncomingOrder.http.accept
      return input.request(
        {
          method: surface.method,
          path: incomingOrderPath(surface.path, locationId, proposalId),
          body,
        },
        decisionCodec
      )
    },
    rejectIncomingOrder: ({ locationId, proposalId, request: body }) => {
      const surface = input.operations.rejectIncomingOrder.http.reject
      return input.request(
        {
          method: surface.method,
          path: incomingOrderPath(surface.path, locationId, proposalId),
          body,
        },
        decisionCodec
      )
    },
    restoreIncomingOrder: ({ locationId, proposalId, request: body }) => {
      const surface = input.operations.restoreIncomingOrder.http.restore
      return input.request(
        {
          method: surface.method,
          path: incomingOrderPath(surface.path, locationId, proposalId),
          body,
        },
        restoreCodec
      )
    },
  })
