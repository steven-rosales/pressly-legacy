import {
  defineCliProgram,
  type CellOutcome,
  type CliInteractiveFrame,
  type CliInvocation,
  type CliInvocationFailure,
  type CliPresentation,
} from "@pressly/cells"
import type { CliFailure } from "./model.ts"

export const authCliUsage = [
  "Pressly auth CLI",
  "",
  "Usage:",
  "  credential-source | pressly-admin auth login --email user@example.com --secret-stdin",
  "  pressly-admin auth session",
  "  pressly-admin auth logout",
  "  pressly-admin auth mfa-enroll",
  "  code-source | pressly-admin auth mfa-confirm --secret-stdin",
  "  pressly-admin auth mfa-recovery-codes",
  "  pressly-admin auth mfa-remove",
  "",
  "Options:",
  "  --email         Email for login",
  "  --secret-stdin  Read secrets from bounded redirected stdin",
  "  --json          Print JSON output",
  "  --help          Show help",
  "",
  "Secure stdin:",
  "  login reads JSON with password and, when needed, either mfaCode or recoveryCode",
  "  mfa-confirm reads the enrollment confirmation code as plain UTF-8",
  "  stdin must be redirected; secrets are never accepted as arguments",
].join("\n")

export const pricingCliUsage = [
  "Pressly pricing CLI",
  "",
  "Usage:",
  "  pressly-admin pricing show --service wash-fold",
  '  pressly-admin pricing plan --service wash-fold --set delivery_fee=4.95 --reason "Update delivery fee"',
  '  pressly-admin pricing publish --service wash-fold --set delivery_fee=4.95 --reason "Update delivery fee" --yes',
  "",
  "Options:",
  "  --service   Pricing service: wash-fold or dry-cleaning",
  "  --set       Item change as code=money. Repeat for multiple items",
  "  --reason    Required for plan/publish",
  "  --yes       Required to commit publish",
  "  --json      Print JSON output",
  "  --help      Show help",
].join("\n")

const globalUsage = `${authCliUsage}\n\n${pricingCliUsage}\n`

export const presslyAdminCliProgram = defineCliProgram({
  id: "control.pressly-admin-cli.v1",
  helpOptions: ["--help", "-h"],
  help: { stdout: globalUsage, exitCode: 0 },
  unknown: {
    stream: "stderr",
    exitCode: 1,
    prefix: "Unknown command namespace: ",
    suffix: `.\n\n`,
    token: "first",
    appendHelp: true,
  },
  groups: [
    {
      name: ["auth"],
      help: { stdout: `${authCliUsage}\n`, exitCode: 0 },
      unknown: {
        stream: "stderr",
        exitCode: 1,
        prefix: "Expected a supported auth action.\n\n",
        suffix: "",
        token: "none",
        appendHelp: true,
      },
    },
    {
      name: ["pricing"],
      help: { stdout: `${pricingCliUsage}\n`, exitCode: 0 },
      unknown: {
        stream: "stderr",
        exitCode: 1,
        prefix: "Expected pricing action: show, plan, or publish.\n\n",
        suffix: "",
        token: "none",
        appendHelp: true,
      },
    },
  ],
})

export const lastStringOption = (
  invocation: CliInvocation,
  name: string,
): string | undefined => {
  const value = invocation.options[name]
  if (typeof value === "string") return value
  if (!Array.isArray(value)) return undefined
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .at(-1)
}

export const stringOptions = (
  invocation: CliInvocation,
  name: string,
): readonly string[] => {
  const value = invocation.options[name]
  if (typeof value === "string") return [value]
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : []
}

export const booleanOption = (
  invocation: CliInvocation,
  name: string,
): boolean => invocation.options[name] === true

const jsonFailure = (failure: CliFailure): unknown => ({
  ok: false,
  error: {
    code: failure.code,
    message: failure.message,
    ...(failure.traceId === undefined ? {} : { traceId: failure.traceId }),
    ...(failure.details === undefined ? {} : { details: failure.details }),
  },
})

export const presentCliOutcome = <Output>(input: {
  outcome: CellOutcome<Output, CliFailure>
  invocation: CliInvocation
  plain: (output: Output) => string
}): CliPresentation => {
  if (input.outcome.kind === "failure")
    return {
      stderr: booleanOption(input.invocation, "json")
        ? `${JSON.stringify(jsonFailure(input.outcome.failure), null, 2)}\n`
        : `${input.outcome.failure.message}\n`,
      exitCode: 1,
    }
  return {
    stdout: booleanOption(input.invocation, "json")
      ? `${JSON.stringify(input.outcome.value, null, 2)}\n`
      : `${input.plain(input.outcome.value).trimEnd()}\n`,
    exitCode: 0,
  }
}

const failureDetails = (
  failure: CliInvocationFailure,
): Readonly<Record<string, unknown>> | undefined =>
  typeof failure.details === "object" &&
  failure.details !== null &&
  !Array.isArray(failure.details)
    ? (failure.details as Readonly<Record<string, unknown>>)
    : undefined

const inputContractMessage = (
  failure: CliInvocationFailure,
): string | undefined => {
  const issues = failureDetails(failure)?.["issues"]
  if (!Array.isArray(issues)) return undefined
  const first = issues[0]
  return typeof first === "object" &&
    first !== null &&
    "message" in first &&
    typeof first.message === "string"
    ? first.message
    : undefined
}

const invalidMessage = (
  failure: CliInvocationFailure,
  missingOptions: Readonly<Record<string, string>>,
): string => {
  const details = failureDetails(failure)
  const option = details?.["option"]
  if (failure.code === "input_contract_invalid")
    return inputContractMessage(failure) ?? failure.message
  if (failure.code === "option_missing" && typeof option === "string")
    return missingOptions[option] ?? failure.message
  if (failure.code === "option_value_missing" && typeof option === "string")
    return `Option '--${option} <value>' argument missing`
  if (failure.code === "option_value_unexpected" && typeof option === "string")
    return `Option '--${option}' does not take an argument`
  if (failure.code === "option_unknown" && typeof option === "string")
    return `Unknown option '${option}'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "${option}"`
  return failure.message
}

export const presentInvalidInvocation =
  (usage: string, missingOptions: Readonly<Record<string, string>> = {}) =>
  (failure: CliInvocationFailure): CliPresentation => ({
    stderr: `${invalidMessage(failure, missingOptions)}\n\n${usage}\n`,
    exitCode: 1,
  })

export const interactiveFrame = (
  text: string,
  tone: "default" | "error" | "info" | "warning" = "default",
): CliInteractiveFrame => ({
  lines: text.split("\n").map((line) => ({
    text: line === "" ? " " : line,
    ...(tone === "default" ? {} : { tone }),
  })),
})
