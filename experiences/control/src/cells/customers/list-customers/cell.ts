import type {
  CustomerList,
  ListControlCustomersInput,
} from "../../../management/customers/contracts.ts"
import type { ControlCustomerFailure } from "../../../management/model/failure.ts"
import { listControlCustomersContract } from "./contract.ts"
import { listSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const readAuthorization = {
  capability: "customers:read",
  timing: "before-input",
} as const

export const listControlCustomersCellDeclaration = defineOperation<
  ListControlCustomersInput,
  CustomerList,
  ControlCustomerFailure
>({
  kind: "query",
  id: "control.list-customers.v1",
  contract: listControlCustomersContract,
  authorization: readAuthorization,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [listSurface],
  observability: { operation: "control.list_customers" },
})
