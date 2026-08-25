import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { getControlCustomerCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.get-customer.v1",
  declaration: getControlCustomerCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "get customer preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(getControlCustomerCellDeclaration.contract.input.version).toBe(1)
        expect(getControlCustomerCellDeclaration.contract.output.version).toBe(
          1,
        )
        expect(getControlCustomerCellDeclaration.contract.failure.version).toBe(
          1,
        )
        expect(getControlCustomerCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/control/customers/:userId",
        })
        await expectControlOperationSuccess("control.get-customer.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.get-customer.v1",
  declaration: getControlCustomerCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.get-customer.v1 preserves customer_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.get-customer.v1",
          "customer_rejected",
        ),
    },
  ],
})
