import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { suspendControlMembershipCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.suspend-membership.v1",
  declaration: suspendControlMembershipCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "suspend membership preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          suspendControlMembershipCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          suspendControlMembershipCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          suspendControlMembershipCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          suspendControlMembershipCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/team/:membershipId/suspend",
        })
        await expectControlOperationSuccess("control.suspend-membership.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.suspend-membership.v1",
  declaration: suspendControlMembershipCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.suspend-membership.v1 preserves workforce_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.suspend-membership.v1",
          "workforce_rejected",
        ),
    },
  ],
})
