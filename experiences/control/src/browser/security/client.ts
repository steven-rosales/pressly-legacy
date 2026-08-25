import { controlSecurityEventListSchema } from "../contracts/security.ts"
import {
  appendBrowserQuery,
  strictWireCodec,
  type ControlBrowserRequestTransport,
} from "../transport.ts"
import type {
  ControlSecurityBrowserClient,
  ControlSecurityOperations,
} from "./types.ts"

const securityEventListCodec = strictWireCodec(controlSecurityEventListSchema)

export const makeControlSecurityBrowserClient = (
  input: Readonly<{
    operations: ControlSecurityOperations
    request: ControlBrowserRequestTransport
  }>,
): ControlSecurityBrowserClient =>
  Object.freeze({
    listSecurityEvents: (cursor) => {
      const surface = input.operations.listSecurityEvents.http.events
      return input.request(
        {
          method: surface.method,
          path: appendBrowserQuery(surface.path, [
            ["limit", 25],
            ["cursor", cursor ?? null],
          ]),
        },
        securityEventListCodec,
      )
    },
  })
