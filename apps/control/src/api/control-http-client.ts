import { z, type ZodType } from "zod"

const requestTimeoutMilliseconds = 15_000
const apiEnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: z.string().max(120).optional(),
          message: z.string().max(500).optional(),
          traceId: z.string().max(200).optional(),
          // API failures may carry structured diagnostics. Control validates
          // envelope compatibility but deliberately does not expose or retain
          // those details in presentation state.
          details: z.unknown().optional(),
        })
        .strict(),
    })
    .strict(),
])

export class ControlApiError extends Error {
  readonly status: number | null
  readonly kind: ControlApiErrorKind
  readonly code: string | null

  constructor(
    status: number | null,
    kind: ControlApiErrorKind,
    code: string | null = null,
  ) {
    super(kind)
    this.name = "ControlApiError"
    this.status = status
    this.kind = kind
    this.code = code
  }
}

export type ControlApiErrorKind =
  | "session_refresh_required"
  | "request_timeout"
  | "service_unreachable"
  | "unreadable_response"
  | "authentication_required"
  | "permission_denied"
  | "record_not_found"
  | "conflict"
  | "invalid_request"
  | "rate_limited"
  | "service_unavailable"
  | "request_rejected"

const errorKindForStatus = (status: number): ControlApiErrorKind => {
  if (status === 401) return "authentication_required"
  if (status === 403) return "permission_denied"
  if (status === 404) return "record_not_found"
  if (status === 409) return "conflict"
  if (status === 400 || status === 422) return "invalid_request"
  if (status === 429) return "rate_limited"
  if (status >= 500) return "service_unavailable"
  return "request_rejected"
}

type FetchImplementation = typeof fetch

export type ControlHttpClient = Readonly<{
  request: <Result>(
    input: {
      method?: "GET" | "POST" | "PATCH"
      path: string
      body?: unknown
      csrf?: boolean
    },
    schema: ZodType<Result>,
  ) => Promise<Result>
  acceptCsrfToken: (token: string) => void
  clearCsrfToken: () => void
}>

export function makeControlHttpClient(
  input: {
    fetchImplementation?: FetchImplementation
    apiBaseUrl?: string
  } = {},
): ControlHttpClient {
  const fetchImplementation = input.fetchImplementation ?? fetch
  const apiBaseUrl = (
    input.apiBaseUrl ??
    import.meta.env["VITE_API_URL"] ??
    "/api"
  ).replace(/\/$/, "")
  let csrfToken: string | null = null

  const request = async <Result>(
    requestInput: {
      method?: "GET" | "POST" | "PATCH"
      path: string
      body?: unknown
      csrf?: boolean
    },
    schema: ZodType<Result>,
  ): Promise<Result> => {
    if (requestInput.csrf === true && csrfToken === null) {
      throw new ControlApiError(null, "session_refresh_required")
    }

    let response: Response
    try {
      response = await fetchImplementation(
        `${apiBaseUrl}${requestInput.path}`,
        {
          method: requestInput.method ?? "GET",
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(requestTimeoutMilliseconds),
          headers: {
            Accept: "application/json",
            ...(requestInput.body === undefined
              ? {}
              : { "Content-Type": "application/json" }),
            ...(requestInput.csrf === true && csrfToken !== null
              ? { "X-CSRF-Token": csrfToken }
              : {}),
          },
          ...(requestInput.body === undefined
            ? {}
            : { body: JSON.stringify(requestInput.body) }),
        },
      )
    } catch (error) {
      throw new ControlApiError(
        null,
        error instanceof Error && error.name === "TimeoutError"
          ? "request_timeout"
          : "service_unreachable",
      )
    }

    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new ControlApiError(response.status, "unreadable_response")
    }

    let decoded: unknown
    try {
      decoded = await response.json()
    } catch {
      throw new ControlApiError(response.status, "unreadable_response")
    }

    const parsedEnvelope = apiEnvelopeSchema.safeParse(decoded)
    if (!parsedEnvelope.success) {
      throw new ControlApiError(response.status, "unreadable_response")
    }
    const envelope = parsedEnvelope.data

    if (!response.ok || envelope.ok === false) {
      const code = envelope.ok === false ? (envelope.error.code ?? null) : null
      throw new ControlApiError(
        response.status,
        errorKindForStatus(response.status),
        code,
      )
    }

    const result = schema.safeParse(envelope.data)
    if (!result.success) {
      throw new ControlApiError(response.status, "unreadable_response")
    }
    return result.data
  }

  return {
    request,
    acceptCsrfToken: (token) => {
      csrfToken = token
    },
    clearCsrfToken: () => {
      csrfToken = null
    },
  }
}
