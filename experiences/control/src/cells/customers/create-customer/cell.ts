import type {
  CreateControlCustomerInput,
  CustomerMutation,
} from "../../../management/customers/contracts.ts"
import type { ControlCustomerFailure } from "../../../management/model/failure.ts"
import { createControlCustomerContract } from "./contract.ts"
import { createSurface } from "./http.ts"
import { declareCommandCell } from "@pressly/cells"

export const writeAuthorization = {
  capability: "customers:write",
  timing: "before-input",
} as const

export const createControlCustomerCellDeclaration = declareCommandCell<
  CreateControlCustomerInput,
  CustomerMutation,
  ControlCustomerFailure
>({
  id: "control.create-customer.v1",
  contract: createControlCustomerContract,
  authorization: writeAuthorization,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [createSurface],
  observability: { operation: "control.create_customer" },
})
