export type RequestFailureKind =
  | "unauthorized"
  | "forbidden"
  | "invalid_request"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "unavailable"
  | "invalid_response"
  | "unexpected"

export class RequestFailure extends Error {
  readonly kind: RequestFailureKind
  readonly code: string
  readonly status?: number
  readonly requestId?: string
  readonly traceId?: string
  readonly referenceId?: string

  constructor(input: {
    kind: RequestFailureKind
    code: string
    message: string
    status?: number
    requestId?: string
    traceId?: string
    cause?: unknown
  }) {
    const referenceId = input.traceId ?? input.requestId
    super(
      input.message,
      input.cause === undefined ? undefined : { cause: input.cause }
    )
    this.name = "RequestFailure"
    this.kind = input.kind
    this.code = input.code
    this.status = input.status
    this.requestId = input.requestId
    this.traceId = input.traceId
    this.referenceId = referenceId
  }
}
