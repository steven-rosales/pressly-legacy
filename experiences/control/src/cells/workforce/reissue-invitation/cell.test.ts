import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { reissueControlInvitationCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.reissue-invitation.v1",
  declaration: reissueControlInvitationCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "reissue invitation preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          reissueControlInvitationCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          reissueControlInvitationCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          reissueControlInvitationCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          reissueControlInvitationCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/invitations/:invitationId/reissue",
        })
        await expectControlOperationSuccess("control.reissue-invitation.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.reissue-invitation.v1",
  declaration: reissueControlInvitationCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.reissue-invitation.v1 preserves workforce_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.reissue-invitation.v1",
          "workforce_rejected",
        ),
    },
  ],
})
