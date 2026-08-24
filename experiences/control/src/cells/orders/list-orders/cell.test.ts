import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { listControlOrdersCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.list-orders.v1",
  declaration: listControlOrdersCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "list orders preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(listControlOrdersCellDeclaration.contract.input.version).toBe(1)
        expect(listControlOrdersCellDeclaration.contract.output.version).toBe(1)
        expect(listControlOrdersCellDeclaration.contract.failure.version).toBe(
          1,
        )
        expect(listControlOrdersCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/control/orders",
        })
        await expectControlOperationSuccess("control.list-orders.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.list-orders.v1",
  declaration: listControlOrdersCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.list-orders.v1 preserves order_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.list-orders.v1",
          "order_rejected",
        ),
    },
    {
      name: "control.list-orders.v1 preserves location_not_found from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.list-orders.v1",
          "location_not_found",
        ),
    },
  ],
})
