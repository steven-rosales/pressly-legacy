import { decode, type HttpRequest, type HttpRequestInput } from "@pressly/cells"
import {
  invariantViolationError,
  validationError,
} from "@pressly/errors/factories"
import type { z } from "zod"

export const invalidRequestDescriptor = (
  location: "body" | "params" | "query",
  input?: Readonly<{
    code: string
    message: string
    safeMessage?: string
    status?: 400 | 413 | 415 | 422
  }>,
) => ({
  code: input?.code ?? `invalid_${location}_type`,
  message: input?.message ?? `Validation ${location} failed.`,
  ...(input?.safeMessage === undefined
    ? {}
    : { safeMessage: input.safeMessage }),
  ...(input?.status === undefined ? {} : { status: input.status }),
  location,
})

const invalid = (
  location: "body" | "params" | "query",
  error: z.ZodError,
  descriptor = invalidRequestDescriptor(location),
): never => {
  throw validationError({
    code: descriptor.code,
    message: descriptor.message,
    ...(descriptor.safeMessage === undefined
      ? {}
      : { safeMessage: descriptor.safeMessage }),
    ...(descriptor.status === undefined ? {} : { status: descriptor.status }),
    publicDetails: {
      location,
      issues: error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    },
  })
}

const valueAt = (
  request: HttpRequest | HttpRequestInput,
  location: "body" | "params" | "query",
): unknown => request[location]

export const parseRequest = <Value>(
  request: HttpRequest | HttpRequestInput,
  location: "body" | "params" | "query",
  schema: z.ZodType<Value>,
  descriptor = invalidRequestDescriptor(location),
): Value => {
  const parsed = schema.safeParse(valueAt(request, location))
  if (!parsed.success) invalid(location, parsed.error, descriptor)
  if (parsed.data === undefined)
    throw invariantViolationError({
      code: "control_management_parser_returned_undefined",
      message: `A successful ${location} parser returned undefined.`,
    })
  return parsed.data
}

export const validatedSerializedRequest = <Schema extends z.ZodType>(
  request: HttpRequest | HttpRequestInput,
  location: "body" | "params" | "query",
  schema: Schema,
  descriptor = invalidRequestDescriptor(location),
): z.input<Schema> => {
  parseRequest(request, location, schema, descriptor)
  const value = valueAt(request, location)
  if (value === undefined)
    throw invariantViolationError({
      code: "control_management_serialized_request_missing",
      message: `A validated ${location} value was unavailable.`,
    })
  return value as z.input<Schema>
}

export const validateRequest =
  (
    schemas: Readonly<{
      body?: z.ZodType<unknown>
      params?: z.ZodType<unknown>
      query?: z.ZodType<unknown>
    }>,
    descriptors: Readonly<{
      body?: ReturnType<typeof invalidRequestDescriptor>
      params?: ReturnType<typeof invalidRequestDescriptor>
      query?: ReturnType<typeof invalidRequestDescriptor>
    }> = {},
  ) =>
  (request: HttpRequestInput): undefined => {
    if (schemas.params !== undefined)
      parseRequest(request, "params", schemas.params, descriptors.params)
    if (schemas.query !== undefined)
      parseRequest(request, "query", schemas.query, descriptors.query)
    if (schemas.body !== undefined)
      parseRequest(request, "body", schemas.body, descriptors.body)
    return undefined
  }

export const constantAuthorizationScope = () =>
  decode.valid("control-management")
