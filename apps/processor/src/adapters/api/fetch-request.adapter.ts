import type { z } from "zod"
import { RequestFailure, type RequestFailureKind } from "@/ports/request.error"
import type { RequestInput, RequestPort } from "@/ports/request.port"

type ApiEnvelope =
  | Readonly<{ ok: true; data: unknown }>
  | Readonly<{
      ok: false
      error: Readonly<{ code?: string; message?: string }>
    }>

const failureKind = (status: number): RequestFailureKind => {
  if (status === 401) return "unauthorized"
  if (status === 403) return "forbidden"
  if (status === 409) return "conflict"
  if (status === 502 || status === 503 || status === 504) return "unavailable"
  return "unexpected"
}

const isUnsafe = (method: string): boolean =>
  !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())

const joinUrl = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`

export const makeFetchRequestAdapter = (input: {
  baseUrl: string
  readCsrfToken: () => string | null
  onUnauthorized?: () => void
  fetch?: typeof globalThis.fetch
}): RequestPort => {
  const fetcher = input.fetch ?? globalThis.fetch

  return async <Input, Output>(
    request: RequestInput<Input>,
    outputSchema: z.ZodType<Output>
  ): Promise<Output> => {
    const method = request.method ?? "GET"
    const csrfToken = isUnsafe(method) ? input.readCsrfToken() : null
    let response: Response

    try {
      response = await fetcher(joinUrl(input.baseUrl, request.path), {
        method,
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          ...(request.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          ...(csrfToken === null ? {} : { "X-CSRF-Token": csrfToken }),
        },
        body:
          request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: request.signal,
      })
    } catch {
      throw new RequestFailure({
        kind: "unavailable",
        code: "NETWORK_UNAVAILABLE",
        message: "The production service is unavailable.",
      })
    }

    let envelope: ApiEnvelope
    try {
      envelope = (await response.json()) as ApiEnvelope
    } catch {
      throw new RequestFailure({
        kind: "invalid_response",
        code: "INVALID_API_RESPONSE",
        message: "The production service returned an unreadable response.",
        status: response.status,
      })
    }

    if (!response.ok || envelope.ok === false) {
      const kind = failureKind(response.status)
      if (kind === "unauthorized") input.onUnauthorized?.()
      const error = envelope.ok === false ? envelope.error : {}
      throw new RequestFailure({
        kind,
        code: error.code ?? `HTTP_${response.status}`,
        message: error.message ?? "The request could not be completed.",
        status: response.status,
      })
    }

    const parsed = outputSchema.safeParse(envelope.data)
    if (!parsed.success)
      throw new RequestFailure({
        kind: "invalid_response",
        code: "INVALID_API_RESPONSE",
        message: "The production service returned data outside its contract.",
        status: response.status,
      })

    return parsed.data
  }
}
