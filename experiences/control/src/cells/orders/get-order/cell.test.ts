import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { getControlOrderCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.get-order.v1",
  declaration: getControlOrderCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "get order preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(getControlOrderCellDeclaration.contract.input.version).toBe(1)
        expect(getControlOrderCellDeclaration.contract.output.version).toBe(1)
        expect(getControlOrderCellDeclaration.contract.failure.version).toBe(1)
        expect(getControlOrderCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/control/orders/:orderId",
        })
        await expectControlOperationSuccess("control.get-order.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.get-order.v1",
  declaration: getControlOrderCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.get-order.v1 preserves order_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.get-order.v1",
          "order_rejected",
        ),
    },
  ],
})
