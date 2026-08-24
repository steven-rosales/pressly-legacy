import type { CliFailure, CliRecoveryCodes } from "../../../cli/model.ts"
import type { CliInvocation } from "@pressly/cells"
import { mappedCliInput } from "../../../cli/model.ts"
import {
  authCliUsage,
  presentCliOutcome,
  presentInvalidInvocation,
} from "../../../cli/presentation.ts"
import { cli } from "@pressly/cells"

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

export const mapConfirmInput = (invocation: CliInvocation) =>
  mappedCliInput.valid({
    code: (invocation.stdin ?? "").replace(/\r?\n$/, ""),
  })

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
      maxBytes: 128,
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

export const recoveryPlain = (output: CliRecoveryCodes): string =>
  [
    "MFA recovery codes",
    "",
    ...output.recoveryCodes,
    "",
    "Store these offline. They will not be shown again.",
  ].join("\n")

export const confirmSurface = authSurface<CliRecoveryCodes>({
  id: "control.cli-auth-mfa-confirm-command.v1",
  action: "mfa-confirm",
  toSerializedInput: mapConfirmInput,
  presentPlain: recoveryPlain,
})
