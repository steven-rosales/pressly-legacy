import type { CustomerProjection } from "../../../management/customers/contracts.ts"
import type { CustomerManagementExecute } from "../../../management/model/dependencies.ts"
import { customerFailure } from "../../../management/model/failure.ts"
import { listControlCustomersCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

export const projectControlCustomer = (customer: {
  id: string
  businessId: string
  version: number
  active: boolean
  firstName: string | null
  lastName: string | null
  businessName: string | null
  phone: string | null
  email: string | null
  displayName: string
  possibleDuplicateCount: number
  createdAt: Date
  updatedAt: Date
}): CustomerProjection => ({
  id: customer.id,
  version: customer.version,
  active: customer.active,
  firstName: customer.firstName,
  lastName: customer.lastName,
  businessName: customer.businessName,
  phone: customer.phone,
  email: customer.email,
  displayName: customer.displayName,
  possibleDuplicateCount: customer.possibleDuplicateCount,
  createdAt: customer.createdAt,
  updatedAt: customer.updatedAt,
})

export const makeListControlCustomersCell = (
  customers: CustomerManagementExecute<"listCustomers">,
) =>
  bindCell(listControlCustomersCellDeclaration, async (input) => {
    const outcome = await customers.execute({
      businessId: input.context.access.business.id,
      query: input.query ?? null,
      active: input.active ?? null,
      limit: input.limit,
      cursor: input.cursor ?? null,
    })
    return outcome.kind === "failure"
      ? { kind: "failure", failure: customerFailure(outcome.failure) }
      : {
          kind: "success",
          value: {
            items: outcome.value.items.map(projectControlCustomer),
            nextCursor: outcome.value.nextCursor,
          },
        }
  })
