import type { IdempotencyPort } from "@/ports/idempotency.port"

const canonicalize = (value: unknown): unknown => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value

  if (Array.isArray(value)) return value.map(canonicalize)

  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, field]) => field !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([field, entry]) => [field, canonicalize(entry)])
    )

  throw new TypeError("Idempotency payloads must be JSON-compatible.")
}

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")

export const makeWebCryptoIdempotencyAdapter = (
  crypto: Crypto = globalThis.crypto
): IdempotencyPort => ({
  key: async ({ operation, payload }) => {
    if (!/^[a-z0-9-]{1,48}$/.test(operation))
      throw new TypeError("Idempotency operation names must be stable slugs.")
    const canonicalPayload = JSON.stringify(canonicalize(payload))
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonicalPayload)
    )
    return `processor:v1:${operation}:${hex(digest)}`
  },
})
