import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { reactivateControlMembershipCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.reactivate-membership.v1",
  declaration: reactivateControlMembershipCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "reactivate membership preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          reactivateControlMembershipCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          reactivateControlMembershipCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          reactivateControlMembershipCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          reactivateControlMembershipCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/team/:membershipId/reactivate",
        })
        await expectControlOperationSuccess("control.reactivate-membership.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.reactivate-membership.v1",
  declaration: reactivateControlMembershipCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.reactivate-membership.v1 preserves workforce_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.reactivate-membership.v1",
          "workforce_rejected",
        ),
    },
  ],
})
