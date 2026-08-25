import type {
  CliFailure,
  PricingChangeInput,
  PricingPlan,
} from "../../../cli/model.ts"
import type {
  CliInteractiveInvocationResult,
  CliInvocation,
} from "@pressly/cells"
import { mappedCliInput } from "../../../cli/model.ts"
import {
  booleanOption,
  interactiveFrame,
  lastStringOption,
  presentCliOutcome,
  presentInvalidInvocation,
  pricingCliUsage,
  stringOptions,
} from "../../../cli/presentation.ts"
import { cli } from "@pressly/cells"

export const pricingPresentation = Object.freeze({
  success: Object.freeze({ stream: "stdout" as const, exitCodes: [0] }),
  failure: Object.freeze({ stream: "stderr" as const, exitCodes: [1] }),
  invalidInvocation: Object.freeze({
    stream: "stderr" as const,
    exitCode: 1,
  }),
})

export const pricingOptions = Object.freeze([
  {
    name: "service",
    short: null,
    value: "string" as const,
    required: true,
    repeatable: true,
  },
  {
    name: "set",
    short: null,
    value: "string" as const,
    required: false,
    repeatable: true,
  },
  {
    name: "reason",
    short: null,
    value: "string" as const,
    required: false,
    repeatable: true,
  },
  {
    name: "yes",
    short: null,
    value: "boolean" as const,
    required: false,
    repeatable: true,
  },
  {
    name: "json",
    short: null,
    value: "boolean" as const,
    required: false,
    repeatable: true,
  },
  {
    name: "help",
    short: "h",
    value: "boolean" as const,
    required: false,
    repeatable: true,
  },
])

export const ignoredArguments = Object.freeze([
  { name: "ignored", required: false, variadic: true },
])

export const invalidPricing = presentInvalidInvocation(pricingCliUsage, {
  service: "Expected --service to be wash-fold or dry-cleaning.",
})

export const parseMoneyCents = (
  value: string,
):
  | Readonly<{
      kind: "invalid"
      message: string
    }>
  | Readonly<{
      kind: "valid"
      value: number
    }> => {
  const trimmed = value.trim()
  const raw = trimmed.startsWith("$") ? trimmed.slice(1) : trimmed
  if (/^\d+c$/i.test(raw))
    return { kind: "valid", value: Number(raw.slice(0, -1)) }
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw))
    return {
      kind: "invalid",
      message: "Use a money value like 4.95, $4.95, or 495c.",
    }
  const [dollars = "0", cents = ""] = raw.split(".")
  return {
    kind: "valid",
    value: Number(dollars) * 100 + Number(cents.padEnd(2, "0")),
  }
}

export const parsePricingItems = (values: readonly string[]) => {
  const items: PricingChangeInput["items"][number][] = []
  for (const value of values) {
    const separator = value.indexOf("=")
    if (separator <= 0 || separator === value.length - 1)
      return mappedCliInput.invalid("Use --set as item_code=money.")
    const code = value.slice(0, separator).trim()
    if (code === "")
      return mappedCliInput.invalid("Pricing item code is required in --set.")
    const price = parseMoneyCents(value.slice(separator + 1))
    if (price.kind === "invalid") return mappedCliInput.invalid(price.message)
    items.push({ code, priceCents: price.value })
  }
  return mappedCliInput.valid(items)
}

export const pricingBase = (invocation: CliInvocation) => {
  const serviceSlug = lastStringOption(invocation, "service")
  if (serviceSlug !== "wash-fold" && serviceSlug !== "dry-cleaning")
    return mappedCliInput.invalid(
      "Expected --service to be wash-fold or dry-cleaning.",
    )
  const items = parsePricingItems(stringOptions(invocation, "set"))
  if (items.kind === "invalid") return items
  return mappedCliInput.valid({ serviceSlug, items: items.value })
}

export const changeInput = (invocation: CliInvocation) => {
  const base = pricingBase(invocation)
  if (base.kind === "invalid") return base
  if (base.value.items.length === 0)
    return mappedCliInput.invalid("At least one --set item is required.")
  const reason = lastStringOption(invocation, "reason")
  if (reason === undefined || reason.trim() === "")
    return mappedCliInput.invalid("--reason is required for pricing changes.")
  return mappedCliInput.valid({ ...base.value, reason })
}

export const formatMoney = (cents: number, currency: string): string =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  )

export const renderPricingPlan = (plan: PricingPlan): string => {
  const lines = [
    "Pricing change plan",
    "",
    `Service: ${plan.serviceSlug}`,
    `Reason: ${plan.reason}`,
    `Current pricing set: ${plan.oldPricingSetId}`,
    "",
    "Changes:",
  ]
  for (const change of plan.changes)
    lines.push(
      ` ${change.code} - ${change.name}`,
      ` old: ${formatMoney(change.oldPriceCents, plan.currency)}`,
      ` new: ${formatMoney(change.newPriceCents, plan.currency)}`,
    )
  return lines.join("\n")
}

export const interactiveExit = async <Output>(
  invoked: CliInteractiveInvocationResult<Output, CliFailure>,
  render: (text: string, tone?: "error") => Promise<void> | void,
  plain: (output: Output) => string,
): Promise<number> => {
  if (invoked.kind === "invalid") {
    const details = invoked.failure.details as
      | Readonly<{
          issues?: readonly Readonly<{
            message?: string
          }>[]
        }>
      | undefined
    await render(
      details?.issues?.[0]?.message ?? invoked.failure.message,
      "error",
    )
    return 1
  }
  if (invoked.outcome.kind === "failure") {
    await render(invoked.outcome.failure.message, "error")
    return 1
  }
  await render(plain(invoked.outcome.value))
  return 0
}

export const interactiveWhen = (invocation: CliInvocation): boolean =>
  !booleanOption(invocation, "json")

export const planSurface = cli.command<PricingPlan, CliFailure>({
  id: "control.cli-pricing-plan-command.v1",
  name: ["pricing", "plan"],
  arguments: ignoredArguments,
  options: pricingOptions,
  interactive: {
    exitCodes: [0, 1],
    when: interactiveWhen,
    drive: async ({ invoke, session }) => {
      await session.render(interactiveFrame("Loading pricing...", "info"))
      return interactiveExit(
        await invoke(),
        (text, tone) => session.render(interactiveFrame(text, tone)),
        renderPricingPlan,
      )
    },
  },
  presentation: pricingPresentation,
  toSerializedInput: changeInput,
  present: (outcome, invocation) =>
    presentCliOutcome({ outcome, invocation, plain: renderPricingPlan }),
  presentInvalidInvocation: invalidPricing,
})
