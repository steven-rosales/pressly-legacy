import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { createControlCustomerCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.create-customer.v1",
  declaration: createControlCustomerCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "create customer preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          createControlCustomerCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          createControlCustomerCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          createControlCustomerCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(createControlCustomerCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/customers",
        })
        await expectControlOperationSuccess("control.create-customer.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.create-customer.v1",
  declaration: createControlCustomerCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.create-customer.v1 preserves customer_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.create-customer.v1",
          "customer_rejected",
        ),
    },
  ],
})
