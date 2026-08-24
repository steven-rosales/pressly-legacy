import type { CliFailure } from "../../../cli/model.ts"
import type { ProductionBootstrapCliOutput } from "./contract.ts"
import type { CliInvocation, CliInvocationFailure } from "@pressly/cells"
import { mappedCliInput } from "../../../cli/model.ts"
import { cli } from "@pressly/cells"

export const firstStringOption = (
  invocation: CliInvocation,
  name: string,
): string | undefined => {
  const value = invocation.options[name]
  if (typeof value === "string") return value
  return Array.isArray(value)
    ? value.find((entry): entry is string => typeof entry === "string")
    : undefined
}

export const toInput = (invocation: CliInvocation) => {
  const extra = invocation.arguments["extra"]
  if (Array.isArray(extra) && extra[0] !== undefined)
    return mappedCliInput.invalid(
      `Unknown production bootstrap argument: ${extra[0]}.`,
    )
  const dryRun = invocation.options["dry-run"] === true
  const apply = invocation.options["apply"] === true
  if (dryRun && apply)
    return mappedCliInput.invalid("Choose either --dry-run or --apply.")
  return mappedCliInput.valid({
    file: firstStringOption(invocation, "file"),
    actorId: firstStringOption(invocation, "actor-id"),
    idempotencyKey: firstStringOption(invocation, "idempotency-key"),
    dryRun: !apply,
  })
}

export const details = (
  failure: CliInvocationFailure,
): Readonly<Record<string, unknown>> | undefined =>
  typeof failure.details === "object" &&
  failure.details !== null &&
  !Array.isArray(failure.details)
    ? (failure.details as Readonly<Record<string, unknown>>)
    : undefined

export const firstIssue = (
  failure: CliInvocationFailure,
): string | undefined => {
  const issues = details(failure)?.["issues"]
  if (!Array.isArray(issues)) return undefined
  const issue = issues[0]
  return typeof issue === "object" &&
    issue !== null &&
    "message" in issue &&
    typeof issue.message === "string"
    ? issue.message
    : undefined
}

export const invalidMessage = (failure: CliInvocationFailure): string => {
  const option = details(failure)?.["option"]
  if (
    (failure.code === "option_missing" ||
      failure.code === "option_value_missing") &&
    typeof option === "string"
  )
    return `--${option} requires a value.`
  if (failure.code === "option_unknown" && typeof option === "string")
    return `Unknown production bootstrap argument: ${option}.`
  if (failure.code === "input_contract_invalid") {
    const issue = firstIssue(failure)
    if (
      issue === "Choose either --dry-run or --apply." ||
      issue?.startsWith("Unknown production bootstrap argument:") === true
    )
      return issue
    return "An unexpected error occurred."
  }
  return failure.message
}

export const surface = cli.command<ProductionBootstrapCliOutput, CliFailure>({
  id: "control.cli-bootstrap-production-command.v2",
  name: ["bootstrap", "production"],
  arguments: [{ name: "extra", required: false, variadic: true }],
  options: [
    {
      name: "file",
      short: null,
      value: "string",
      required: true,
      repeatable: true,
    },
    {
      name: "actor-id",
      short: null,
      value: "string",
      required: true,
      repeatable: true,
    },
    {
      name: "idempotency-key",
      short: null,
      value: "string",
      required: true,
      repeatable: true,
    },
    {
      name: "dry-run",
      short: null,
      value: "boolean",
      required: false,
      repeatable: true,
    },
    {
      name: "apply",
      short: null,
      value: "boolean",
      required: false,
      repeatable: true,
    },
  ],
  presentation: {
    success: { stream: "stdout", exitCodes: [0, 2] },
    failure: { stream: "stderr", exitCodes: [1] },
    invalidInvocation: { stream: "stderr", exitCode: 1 },
  },
  toSerializedInput: toInput,
  present: (outcome) => {
    if (outcome.kind === "failure")
      return { stderr: `${outcome.failure.message}\n`, exitCode: 1 }
    return {
      stdout: `${JSON.stringify(outcome.value, null, 2)}\n`,
      exitCode:
        outcome.value.location.status === "rejected" ||
        outcome.value.production.status === "rejected" ||
        outcome.value.sourceLocationBindings.status === "rejected"
          ? 2
          : 0,
    }
  },
  presentInvalidInvocation: (failure) => ({
    stderr: `${invalidMessage(failure)}\n`,
    exitCode: 1,
  }),
})
