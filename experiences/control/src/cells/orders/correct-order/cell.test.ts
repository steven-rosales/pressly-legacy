import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { correctControlOrderCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.correct-order.v1",
  declaration: correctControlOrderCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "correct order preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(correctControlOrderCellDeclaration.contract.input.version).toBe(
          1,
        )
        expect(correctControlOrderCellDeclaration.contract.output.version).toBe(
          1,
        )
        expect(
          correctControlOrderCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(correctControlOrderCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "PATCH",
          path: "/control/orders/:orderId",
        })
        await expectControlOperationSuccess("control.correct-order.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.correct-order.v1",
  declaration: correctControlOrderCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.correct-order.v1 preserves order_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.correct-order.v1",
          "order_rejected",
        ),
    },
  ],
})
