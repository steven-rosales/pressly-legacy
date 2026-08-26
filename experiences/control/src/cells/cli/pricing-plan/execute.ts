import type { AdminCliPricingDependencies } from "../../../cli/pricing-dependencies.ts"
import type { CliFailure } from "../../../cli/model.ts"
import { readRequiredSession } from "../../../cli/model.ts"
import { adminCliPricingPlanCellDeclaration } from "./cell.ts"
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

export const makeAdminCliPricingPlanCell = (
  dependencies: AdminCliPricingDependencies,
) =>
  defineOperation(adminCliPricingPlanCellDeclaration, (input) =>
    withPricingSession(dependencies, (accessToken) =>
      dependencies.api.planChange(accessToken, input),
    ),
  )
