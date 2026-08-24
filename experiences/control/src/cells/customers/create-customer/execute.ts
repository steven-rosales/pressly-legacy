import type { CustomerManagementExecute } from "../../../management/model/dependencies.ts"
import { customerFailure } from "../../../management/model/failure.ts"
import { createControlCustomerCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

export const makeCreateControlCustomerCell = (
  customers: CustomerManagementExecute<"createCustomer">,
) =>
  bindCell(createControlCustomerCellDeclaration, async (input) => {
    const outcome = await customers.execute({
      businessId: input.context.access.business.id,
      idempotencyKey: input.idempotencyKey,
      context: input.context.command,
      profile: input.profile,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: customerFailure(outcome.failure) }
      : { kind: "success", value: outcome.value }
  })
