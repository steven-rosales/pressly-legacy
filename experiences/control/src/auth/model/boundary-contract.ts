import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type BoundaryContract,
  type CellContract,
  type ContractIssue,
} from "@pressly/cells"
import { invariantViolationError } from "@pressly/errors/factories"
import { z } from "zod"

const issues = (
  values: readonly Readonly<{
    path: readonly PropertyKey[]
    message: string
  }>[],
): readonly ContractIssue[] =>
  values.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }))

const serializedIssues = (
  value: unknown,
  path: readonly (string | number)[] = [],
  ancestors: ReadonlySet<object> = new Set(),
): readonly ContractIssue[] => {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return []
  if (typeof value === "number")
    return Number.isFinite(value)
      ? []
      : [{ path, message: "Numbers must be finite." }]
  if (value === undefined)
    return [{ path, message: "Undefined is not serialized data." }]
  if (typeof value !== "object")
    return [{ path, message: "Expected a JSON-compatible value." }]
  if (ancestors.has(value))
    return [{ path, message: "Cyclic values are not serialized data." }]

  const nextAncestors = new Set(ancestors).add(value)
  if (Array.isArray(value))
    return value.flatMap((entry, index) =>
      serializedIssues(entry, [...path, index], nextAncestors),
    )

  const prototype = Object.getPrototypeOf(value) as unknown
  if (prototype !== Object.prototype && prototype !== null)
    return [{ path, message: "Expected a plain serialized object." }]
  return Object.entries(value).flatMap(([key, entry]) =>
    serializedIssues(entry, [...path, key], nextAncestors),
  )
}

const boundary = <Value>(
  schema: z.ZodType<Value>,
  label: string,
): BoundaryContract<Value> =>
  defineBoundaryContract({
    version: 1,
    decode: (serialized) => {
      const representationIssues = serializedIssues(serialized)
      if (representationIssues.length > 0)
        return decode.invalid(representationIssues)
      const parsed = z.safeDecode(schema, serialized)
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(issues(parsed.error.issues))
    },
    encode: (value) => {
      const parsed = z.safeEncode(schema, value)
      if (parsed.success && serializedIssues(parsed.data).length === 0)
        return parsed.data
      throw invariantViolationError({
        code: "control_auth_contract_encode_invalid",
        message: `${label} did not encode as strict serialized data.`,
        safeMessage: "Authentication data is inconsistent.",
        cause: parsed.success ? undefined : parsed.error,
      })
    },
  })

export const defineControlAuthContract = <Input, Output, Failure>(input: {
  label: string
  input: z.ZodType<Input>
  output: z.ZodType<Output>
  failure: z.ZodType<Failure>
}): CellContract<Input, Output, Failure> =>
  defineCellContract({
    input: boundary(input.input, `${input.label} input`),
    output: boundary(input.output, `${input.label} output`),
    failure: boundary(input.failure, `${input.label} failure`),
  })

export const encodeControlAuthValue = <Value>(
  schema: z.ZodType<Value>,
  value: Value,
  label: string,
): unknown => {
  const encoded = z.safeEncode(schema, value)
  if (encoded.success && serializedIssues(encoded.data).length === 0)
    return encoded.data
  throw invariantViolationError({
    code: "control_auth_presentation_encode_invalid",
    message: `${label} did not encode as strict serialized data.`,
    safeMessage: "Authentication data is inconsistent.",
    cause: encoded.success ? undefined : encoded.error,
  })
}
