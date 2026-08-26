import type { AdminCliPricingDependencies } from "../../../cli/pricing-dependencies.ts"
import type { CliFailure } from "../../../cli/model.ts"
import { readRequiredSession } from "../../../cli/model.ts"
import { adminCliPricingShowCellDeclaration } from "./cell.ts"
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

export const makeAdminCliPricingShowCell = (
  dependencies: AdminCliPricingDependencies,
) =>
  defineOperation(adminCliPricingShowCellDeclaration, (input) =>
    withPricingSession(dependencies, (accessToken) =>
      dependencies.api.loadCatalog(accessToken, input.serviceSlug),
    ),
  )
