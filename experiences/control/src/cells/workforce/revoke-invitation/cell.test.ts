import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { revokeControlInvitationCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.revoke-invitation.v1",
  declaration: revokeControlInvitationCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "revoke invitation preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          revokeControlInvitationCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          revokeControlInvitationCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          revokeControlInvitationCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          revokeControlInvitationCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/invitations/:invitationId/revoke",
        })
        await expectControlOperationSuccess("control.revoke-invitation.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.revoke-invitation.v1",
  declaration: revokeControlInvitationCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.revoke-invitation.v1 preserves workforce_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.revoke-invitation.v1",
          "workforce_rejected",
        ),
    },
  ],
})
