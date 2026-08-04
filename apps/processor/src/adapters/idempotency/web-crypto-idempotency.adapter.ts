import { canonicalJson } from "@pressly/codec"
import { invariantViolationError } from "@pressly/errors/factories"
import type { IdempotencyPort } from "@/ports/idempotency.port"

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")

export const makeWebCryptoIdempotencyAdapter = (
  crypto: Crypto = globalThis.crypto
): IdempotencyPort => ({
  key: async ({ operation, payload }) => {
    if (!/^[a-z0-9-]{1,48}$/.test(operation))
      throw invariantViolationError({
        code: "processor_idempotency_operation_invalid",
        message: "Idempotency operation names must be stable slugs.",
      })

    const canonicalPayload = canonicalJson(payload)

    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonicalPayload)
    )

    return `processor:v1:${operation}:${hex(digest)}`
  },
})
