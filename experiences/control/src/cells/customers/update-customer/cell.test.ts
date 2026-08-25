import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { updateControlCustomerCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.update-customer.v1",
  declaration: updateControlCustomerCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "update customer preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          updateControlCustomerCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          updateControlCustomerCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          updateControlCustomerCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(updateControlCustomerCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "PATCH",
          path: "/control/customers/:userId",
        })
        await expectControlOperationSuccess("control.update-customer.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.update-customer.v1",
  declaration: updateControlCustomerCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.update-customer.v1 preserves customer_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.update-customer.v1",
          "customer_rejected",
        ),
    },
  ],
})
