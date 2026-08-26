import type {
  CustomerProjection,
  GetControlCustomerInput,
} from "../../../management/customers/contracts.ts"
import type { ControlCustomerFailure } from "../../../management/model/failure.ts"
import { getControlCustomerContract } from "./contract.ts"
import { getSurface } from "./http.ts"
import { defineOperation } from "@pressly/cells"

export const readAuthorization = {
  capability: "customers:read",
  timing: "before-input",
} as const

export const getControlCustomerCellDeclaration = defineOperation<
  GetControlCustomerInput,
  CustomerProjection,
  ControlCustomerFailure
>({
  kind: "query",
  id: "control.get-customer.v1",
  contract: getControlCustomerContract,
  authorization: readAuthorization,
  consistency: { transaction: "none", concurrency: "none" },
  surfaces: [getSurface],
  observability: { operation: "control.get_customer" },
})
