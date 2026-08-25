import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { endControlMembershipCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.end-membership.v1",
  declaration: endControlMembershipCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "end membership preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(endControlMembershipCellDeclaration.contract.input.version).toBe(
          1,
        )
        expect(
          endControlMembershipCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          endControlMembershipCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(endControlMembershipCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/team/:membershipId/end",
        })
        await expectControlOperationSuccess("control.end-membership.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.end-membership.v1",
  declaration: endControlMembershipCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.end-membership.v1 preserves workforce_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.end-membership.v1",
          "workforce_rejected",
        ),
    },
  ],
})
