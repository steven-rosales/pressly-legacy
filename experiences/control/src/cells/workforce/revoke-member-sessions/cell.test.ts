import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { revokeControlMemberSessionsCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.revoke-member-sessions.v1",
  declaration: revokeControlMemberSessionsCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "revoke member sessions preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          revokeControlMemberSessionsCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          revokeControlMemberSessionsCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          revokeControlMemberSessionsCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          revokeControlMemberSessionsCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/team/:membershipId/sessions/revoke",
        })
        await expectControlOperationSuccess("control.revoke-member-sessions.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.revoke-member-sessions.v1",
  declaration: revokeControlMemberSessionsCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.revoke-member-sessions.v1 preserves workforce_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.revoke-member-sessions.v1",
          "workforce_rejected",
        ),
    },
  ],
})
