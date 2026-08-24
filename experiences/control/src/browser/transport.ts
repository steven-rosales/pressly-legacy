import {
  decode,
  type BoundaryContract,
  type ContractIssue,
} from "@pressly/cells"
import { z } from "zod"

export type BrowserHttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT"

export type BrowserHttpSurface<Method extends BrowserHttpMethod> = Readonly<{
  method: Method
  path: string
}>

export type GeneratedBrowserOperation<
  Id extends string,
  Http extends Readonly<Record<string, BrowserHttpSurface<BrowserHttpMethod>>>,
> = Readonly<{
  operationId: Id
  contract: Readonly<{
    inputVersion: number
    outputVersion: number
    failureVersion: number
  }>
  http: Http
}>

export type BrowserResponseCodec<Output> = Pick<
  BoundaryContract<Output>,
  "decode"
>

export type ControlBrowserRequest = Readonly<{
  method: BrowserHttpMethod
  path: string
  body?: unknown
  csrf?: true
}>

export type ControlBrowserRequestTransport = <Output>(
  request: ControlBrowserRequest,
  output: BrowserResponseCodec<Output>,
) => Promise<Output>

export type ControlBrowserHttpClient = Readonly<{
  request: <Output>(
    input: ControlBrowserRequest,
    schema: z.ZodType<Output>,
  ) => Promise<Output>
  acceptCsrfToken: (token: string) => void
  clearCsrfToken: () => void
}>

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

export const strictWireCodec = <Output>(
  schema: z.ZodType<Output>,
): BrowserResponseCodec<Output> =>
  Object.freeze({
    decode: (serialized: unknown) => {
      const parsed = z.safeDecode(schema, serialized)
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(issues(parsed.error.issues))
    },
  })

export const renderBrowserPath = (
  template: string,
  parameters: Readonly<Record<string, string>>,
): string =>
  Object.entries(parameters).reduce(
    (path, [name, value]) =>
      path.replace(`:${name}`, encodeURIComponent(value)),
    template,
  )

export const appendBrowserQuery = (
  path: string,
  parameters: readonly (readonly [string, string | number | boolean | null])[],
): string => {
  const query = new URLSearchParams()
  for (const [name, value] of parameters)
    if (value !== null) query.set(name, String(value))
  const rendered = query.toString()
  return rendered.length === 0 ? path : `${path}?${rendered}`
}

const browserResponseSchema = <Output>(
  codec: BrowserResponseCodec<Output>,
): z.ZodType<Output> =>
  z.unknown().transform((serialized, context) => {
    const decoded = codec.decode(serialized)
    if (decoded.kind === "valid") return decoded.value
    for (const issue of decoded.issues)
      context.addIssue({
        code: "custom",
        path: [...issue.path],
        message: issue.message,
        input: serialized,
      })
    return z.NEVER
  })

export const makeControlBrowserRequestTransport = (
  client: Pick<ControlBrowserHttpClient, "request">,
): ControlBrowserRequestTransport =>
  Object.freeze((request, output) =>
    client.request(request, browserResponseSchema(output)),
  )
