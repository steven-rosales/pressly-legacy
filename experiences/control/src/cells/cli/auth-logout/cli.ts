import type { CliFailure, CliLogout } from "../../../cli/model.ts"
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

export const noInput = () => mappedCliInput.valid({})

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

export const logoutSurface = authSurface<CliLogout>({
  id: "control.cli-auth-logout-command.v1",
  action: "logout",
  toSerializedInput: noInput,
  presentPlain: () => "Logged out.",
})
