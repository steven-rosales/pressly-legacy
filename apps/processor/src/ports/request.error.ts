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

  constructor(input: {
    kind: RequestFailureKind
    code: string
    message: string
    status?: number
  }) {
    super(input.message)
    this.name = "RequestFailure"
    this.kind = input.kind
    this.code = input.code
    this.status = input.status
  }
}
