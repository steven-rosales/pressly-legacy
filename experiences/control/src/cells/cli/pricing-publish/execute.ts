import type { AdminCliPricingDependencies } from "../../../cli/pricing-dependencies.ts"
import type { CliFailure } from "../../../cli/model.ts"
import { cliFailure, readRequiredSession } from "../../../cli/model.ts"
import { adminCliPricingPublishCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

const withPricingSession = async <Output>(
  dependencies: AdminCliPricingDependencies,
  operation: (accessToken: string) => Promise<
    | Readonly<{
        kind: "failure"
        failure: CliFailure
      }>
    | Readonly<{
        kind: "success"
        value: Output
      }>
  >,
) => {
  const session = await readRequiredSession(dependencies.session)
  return session.kind === "failure"
    ? session
    : operation(session.value.accessToken)
}

export const makeAdminCliPricingPublishCell = (
  dependencies: AdminCliPricingDependencies,
) =>
  defineOperation(adminCliPricingPublishCellDeclaration, (input) => {
    if (input.stage === "plan")
      return withPricingSession(dependencies, async (accessToken) => {
        const planned = await dependencies.api.planChange(accessToken, input)
        return planned.kind === "failure"
          ? planned
          : {
              kind: "success",
              value: { tag: "plan" as const, value: planned.value },
            }
      })
    if (!input.confirmed)
      return Promise.resolve({
        kind: "failure",
        failure: cliFailure(
          "invalid_cli_command",
          "pricing publish requires --yes to commit.",
        ),
      })
    return withPricingSession(dependencies, async (accessToken) => {
      const published = await dependencies.api.publishChange(accessToken, input)
      return published.kind === "failure"
        ? published
        : {
            kind: "success",
            value: { tag: "published" as const, value: published.value },
          }
    })
  })
