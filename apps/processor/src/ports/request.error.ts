export type RequestFailureKind =
  | "unauthorized"
  | "forbidden"
  | "conflict"
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
  }) {
    const referenceId = input.traceId ?? input.requestId
    super(
      referenceId === undefined
        ? input.message
        : `${input.message} Reference: ${referenceId}`
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
