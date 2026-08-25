import type { CliFailure, CliSession } from "../../../cli/model.ts"
import type { CliInvocation } from "@pressly/cells"
import { mappedCliInput } from "../../../cli/model.ts"
import {
  authCliUsage,
  lastStringOption,
  presentCliOutcome,
  presentInvalidInvocation,
} from "../../../cli/presentation.ts"
import { cli } from "@pressly/cells"
import { loginSecretInputSchema } from "./contract.ts"

export const authPresentation = Object.freeze({
  success: Object.freeze({ stream: "stdout" as const, exitCodes: [0] }),
  failure: Object.freeze({ stream: "stderr" as const, exitCodes: [1] }),
  invalidInvocation: Object.freeze({
    stream: "stderr" as const,
    exitCode: 1,
  }),
})

export const authOptions = Object.freeze([
  {
    name: "email",
    short: null,
    value: "string" as const,
    required: false,
    repeatable: true,
  },
  {
    name: "secret-stdin",
    short: null,
    value: "boolean" as const,
    required: true,
    repeatable: false,
  },
  {
    name: "json",
    short: null,
    value: "boolean" as const,
    required: false,
    repeatable: false,
  },
  {
    name: "help",
    short: "h",
    value: "boolean" as const,
    required: false,
    repeatable: false,
  },
])

export const mapLoginInput = (invocation: CliInvocation) => {
  let secretInput: unknown
  try {
    secretInput = JSON.parse(invocation.stdin ?? "")
  } catch {
    return mappedCliInput.invalid(
      "Login standard input must be a JSON object with a password and at most one MFA or recovery code.",
    )
  }
  const decoded = loginSecretInputSchema.safeParse(secretInput)
  if (!decoded.success)
    return mappedCliInput.invalid(
      "Login standard input must be a JSON object with a password and at most one MFA or recovery code.",
    )
  return mappedCliInput.valid({
    ...(lastStringOption(invocation, "email") === undefined
      ? {}
      : { email: lastStringOption(invocation, "email") }),
    ...decoded.data,
  })
}

export const authSurface = <Output>(input: {
  id: string
  action: string
  toSerializedInput: (invocation: CliInvocation) => unknown
  presentPlain: (output: Output) => string
}) =>
  cli.command<Output, CliFailure>({
    id: input.id,
    name: ["auth", input.action],
    arguments: [],
    options: authOptions,
    stdin: {
      mode: "required",
      encoding: "utf8",
      maxBytes: 4_096,
      tty: "forbid",
    },
    presentation: authPresentation,
    toSerializedInput: input.toSerializedInput,
    present: (outcome, invocation) =>
      presentCliOutcome({
        outcome,
        invocation,
        plain: input.presentPlain,
      }),
    presentInvalidInvocation: presentInvalidInvocation(authCliUsage),
  })

export const loginSurface = authSurface<CliSession>({
  id: "control.cli-auth-login-command.v1",
  action: "login",
  toSerializedInput: mapLoginInput,
  presentPlain: (output) =>
    [
      `Signed in as ${output.principal.displayName}.`,
      `Identity: ${output.principal.identityId}`,
      `Roles: ${output.principal.roles.join(", ")}`,
      `Expires: ${output.expiresAt}`,
    ].join("\n"),
})
