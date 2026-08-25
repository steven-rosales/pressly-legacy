import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { revokeControlAccessCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.revoke-access.v1",
  declaration: revokeControlAccessCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "revoke access preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(revokeControlAccessCellDeclaration.contract.input.version).toBe(
          1,
        )
        expect(revokeControlAccessCellDeclaration.contract.output.version).toBe(
          1,
        )
        expect(
          revokeControlAccessCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(revokeControlAccessCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/grants/:grantId/revoke",
        })
        await expectControlOperationSuccess("control.revoke-access.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.revoke-access.v1",
  declaration: revokeControlAccessCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.revoke-access.v1 preserves workforce_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.revoke-access.v1",
          "workforce_rejected",
        ),
    },
  ],
})
