import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { listControlCustomersCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.list-customers.v1",
  declaration: listControlCustomersCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "list customers preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(listControlCustomersCellDeclaration.contract.input.version).toBe(
          1,
        )
        expect(
          listControlCustomersCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          listControlCustomersCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(listControlCustomersCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/control/customers",
        })
        await expectControlOperationSuccess("control.list-customers.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.list-customers.v1",
  declaration: listControlCustomersCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.list-customers.v1 preserves customer_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.list-customers.v1",
          "customer_rejected",
        ),
    },
  ],
})
