import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type CellOutcome,
  type ContractIssue,
  type DecodeResult,
  type HttpResponse,
} from "@pressly/cells"
import {
  invariantViolationError,
  validationError,
} from "@pressly/errors/factories"

export type UpstreamProductionQueryFailure = Readonly<{
  tag: "ProductionFailure"
  kind: string
  code: string
  message: string
  safeMessage: string
  classification?: string
  details?: unknown
}>

export type ProductionQueryFailure = UpstreamProductionQueryFailure &
  Readonly<{ reason: "upstream_production_query_failed" }>

export type ProductionQueryOutcome<Output> = CellOutcome<
  Output,
  ProductionQueryFailure
>

export type ProductionQuery<Input, Output> = (
  input: Input
) => Promise<CellOutcome<Output, UpstreamProductionQueryFailure>>

type BoundaryParseResult<Value> =
  | Readonly<{ success: true; data: Value }>
  | Readonly<{
      success: false
      error: Readonly<{
        issues: readonly Readonly<{
          path: readonly PropertyKey[]
          message: string
        }>[]
      }>
    }>

export type BoundarySchema<Value> = Readonly<{
  safeParse: (value: unknown) => BoundaryParseResult<Value>
}>

export const isRecord = (
  value: unknown
): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const prefixedIssues = (
  prefix: string,
  issues: readonly Readonly<{
    path: readonly PropertyKey[]
    message: string
  }>[]
): readonly ContractIssue[] =>
  issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)],
    message: issue.message,
  }))

const isUpstreamProductionQueryFailure = (
  value: unknown
): value is UpstreamProductionQueryFailure =>
  isRecord(value) &&
  value["tag"] === "ProductionFailure" &&
  typeof value["kind"] === "string" &&
  typeof value["code"] === "string" &&
  typeof value["message"] === "string" &&
  typeof value["safeMessage"] === "string" &&
  (value["classification"] === undefined ||
    typeof value["classification"] === "string")

export const productionQueryFailure = (
  failure: UpstreamProductionQueryFailure
): ProductionQueryFailure =>
  Object.freeze({
    ...failure,
    reason: "upstream_production_query_failed",
  })

export const productionQueryFailureOutcome = (
  failure: UpstreamProductionQueryFailure
): Readonly<{ kind: "failure"; failure: ProductionQueryFailure }> =>
  Object.freeze({
    kind: "failure",
    failure: productionQueryFailure(failure),
  })

export const defineProcessorQueryContract = <Input, Output>(definition: {
  decodeInput: (serialized: unknown) => DecodeResult<Input>
  encodeInput: (input: Input) => unknown
  outputSchema: BoundarySchema<Output>
  operation: string
}) =>
  defineCellContract<Input, Output, ProductionQueryFailure>({
    input: defineBoundaryContract({
      version: 1,
      decode: definition.decodeInput,
      encode: definition.encodeInput,
    }),
    output: defineBoundaryContract({
      version: 1,
      decode: (serialized) => {
        const parsed = definition.outputSchema.safeParse(serialized)
        return parsed.success
          ? decode.valid(parsed.data)
          : decode.invalid(prefixedIssues("output", parsed.error.issues))
      },
      encode: (value) => {
        const parsed = definition.outputSchema.safeParse(value)
        if (!parsed.success)
          throw invariantViolationError({
            code: "invalid_processor_query_success_response",
            message: `${definition.operation} returned an invalid Processor projection.`,
            safeMessage: "The request could not be completed.",
            cause: parsed.error,
          })
        return parsed.data
      },
    }),
    failure: defineBoundaryContract({
      version: 1,
      decode: (serialized) =>
        isUpstreamProductionQueryFailure(serialized)
          ? decode.valid(productionQueryFailure(serialized))
          : decode.invalid([
              {
                path: [],
                message: `${definition.operation} returned an invalid Production failure.`,
              },
            ]),
      encode: ({ reason: _reason, ...failure }) => ({ ...failure }),
    }),
  })

export type RequestLocation = "body" | "query" | "params"

export const invalidRequest = (
  location: RequestLocation,
  issues: readonly Readonly<{
    path: readonly PropertyKey[]
    message: string
  }>[]
): never => {
  throw validationError({
    code: `invalid_${location}_type`,
    message: `Validation ${location} failed.`,
    publicDetails: {
      location,
      issues: issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    },
  })
}

export const presentProcessorQuery = <Output>(
  outcome: ProductionQueryOutcome<Output>,
  encode: (value: Output) => unknown
): HttpResponse => {
  if (outcome.kind === "failure") throw outcome.failure
  return { status: 200, body: { ok: true, data: encode(outcome.value) } }
}
