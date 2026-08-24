import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { getControlMemberCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.get-member.v1",
  declaration: getControlMemberCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "get member preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(getControlMemberCellDeclaration.contract.input.version).toBe(1)
        expect(getControlMemberCellDeclaration.contract.output.version).toBe(1)
        expect(getControlMemberCellDeclaration.contract.failure.version).toBe(1)
        expect(getControlMemberCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/control/team/:membershipId",
        })
        await expectControlOperationSuccess("control.get-member.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.get-member.v1",
  declaration: getControlMemberCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.get-member.v1 preserves workforce_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.get-member.v1",
          "workforce_rejected",
        ),
    },
  ],
})
