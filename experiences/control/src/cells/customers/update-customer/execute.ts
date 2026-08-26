import type { CustomerManagementExecute } from "../../../management/model/dependencies.ts"
import { customerFailure } from "../../../management/model/failure.ts"
import { updateControlCustomerCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

export const makeUpdateControlCustomerCell = (
  customers: CustomerManagementExecute<"updateCustomer">,
) =>
  defineOperation(updateControlCustomerCellDeclaration, async (input) => {
    const outcome = await customers.execute({
      businessId: input.context.access.business.id,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      expectedVersion: input.expectedVersion,
      changes: {
        ...(input.changes.firstName === undefined
          ? {}
          : { firstName: input.changes.firstName }),
        ...(input.changes.lastName === undefined
          ? {}
          : { lastName: input.changes.lastName }),
        ...(input.changes.businessName === undefined
          ? {}
          : { businessName: input.changes.businessName }),
        ...(input.changes.phone === undefined
          ? {}
          : { phone: input.changes.phone }),
        ...(input.changes.email === undefined
          ? {}
          : { email: input.changes.email }),
        ...(input.changes.active === undefined
          ? {}
          : { active: input.changes.active }),
      },
      context: input.context.command,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: customerFailure(outcome.failure) }
      : { kind: "success", value: outcome.value }
  })
