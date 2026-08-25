import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { grantControlAccessCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.grant-access.v1",
  declaration: grantControlAccessCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "grant access preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(grantControlAccessCellDeclaration.contract.input.version).toBe(1)
        expect(grantControlAccessCellDeclaration.contract.output.version).toBe(
          1,
        )
        expect(grantControlAccessCellDeclaration.contract.failure.version).toBe(
          1,
        )
        expect(grantControlAccessCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/team/:membershipId/grants",
        })
        await expectControlOperationSuccess("control.grant-access.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.grant-access.v1",
  declaration: grantControlAccessCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.grant-access.v1 preserves workforce_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.grant-access.v1",
          "workforce_rejected",
        ),
    },
  ],
})
