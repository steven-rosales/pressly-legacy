import {
  controlCustomerListSchema,
  controlCustomerSchema,
  userMutationResultSchema,
} from "../contracts/customers.ts"
import {
  appendBrowserQuery,
  renderBrowserPath,
  strictWireCodec,
  type ControlBrowserRequestTransport,
} from "../transport.ts"
import type {
  ControlCustomerOperations,
  ControlCustomersBrowserClient,
} from "./types.ts"

const customerListCodec = strictWireCodec(controlCustomerListSchema)
const customerCodec = strictWireCodec(controlCustomerSchema)
const mutationCodec = strictWireCodec(userMutationResultSchema)

export const makeControlCustomersBrowserClient = (
  input: Readonly<{
    operations: ControlCustomerOperations
    request: ControlBrowserRequestTransport
    idempotencyKey: () => string
  }>,
): ControlCustomersBrowserClient =>
  Object.freeze({
    list: ({ query, active, cursor, limit = 25 }) => {
      const surface = input.operations.listCustomers.http.customers
      const trimmedQuery = query.trim()
      return input.request(
        {
          method: surface.method,
          path: appendBrowserQuery(surface.path, [
            ["query", trimmedQuery.length === 0 ? null : trimmedQuery],
            ["active", active],
            ["cursor", cursor],
            ["limit", limit],
          ]),
        },
        customerListCodec,
      )
    },
    get: (customerId) => {
      const surface = input.operations.getCustomer.http.request
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, { userId: customerId }),
        },
        customerCodec,
      )
    },
    create: (profile) => {
      const surface = input.operations.createCustomer.http.customers
      return input.request(
        {
          method: surface.method,
          path: surface.path,
          body: { idempotencyKey: input.idempotencyKey(), profile },
          csrf: true,
        },
        mutationCodec,
      )
    },
    update: ({ customerId, expectedVersion, changes }) => {
      const surface = input.operations.updateCustomer.http.request
      return input.request(
        {
          method: surface.method,
          path: renderBrowserPath(surface.path, { userId: customerId }),
          body: {
            idempotencyKey: input.idempotencyKey(),
            expectedVersion,
            changes,
          },
          csrf: true,
        },
        mutationCodec,
      )
    },
  })
