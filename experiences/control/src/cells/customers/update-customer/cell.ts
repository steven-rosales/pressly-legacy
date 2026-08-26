import type {
  CustomerMutation,
  UpdateControlCustomerInput,
} from "../../../management/customers/contracts.ts"
import type { ControlCustomerFailure } from "../../../management/model/failure.ts"
import { updateControlCustomerContract } from "./contract.ts"
import { updateSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const writeAuthorization = {
  capability: "customers:write",
  timing: "before-input",
} as const

export const updateControlCustomerCellDeclaration = defineOperation<
  UpdateControlCustomerInput,
  CustomerMutation,
  ControlCustomerFailure
>({
  kind: "command",
  id: "control.update-customer.v1",
  contract: updateControlCustomerContract,
  authorization: writeAuthorization,
  consistency: { transaction: "none", concurrency: "none" },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: [updateSurface],
  observability: { operation: "control.update_customer" },
})
