import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { createControlOrderCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.create-order.v1",
  declaration: createControlOrderCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "create order preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(createControlOrderCellDeclaration.contract.input.version).toBe(1)
        expect(createControlOrderCellDeclaration.contract.output.version).toBe(
          1,
        )
        expect(createControlOrderCellDeclaration.contract.failure.version).toBe(
          1,
        )
        expect(createControlOrderCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/orders",
        })
        await expectControlOperationSuccess("control.create-order.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.create-order.v1",
  declaration: createControlOrderCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.create-order.v1 preserves order_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.create-order.v1",
          "order_rejected",
        ),
    },
    {
      name: "control.create-order.v1 preserves location_not_found from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.create-order.v1",
          "location_not_found",
        ),
    },
  ],
})
