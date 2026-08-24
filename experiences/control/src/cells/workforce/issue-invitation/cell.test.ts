import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { issueControlInvitationCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.issue-invitation.v1",
  declaration: issueControlInvitationCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "issue invitation preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          issueControlInvitationCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          issueControlInvitationCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          issueControlInvitationCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(issueControlInvitationCellDeclaration.surfaces[0]).toMatchObject(
          {
            kind: "http",
            method: "POST",
            path: "/control/invitations",
          },
        )
        await expectControlOperationSuccess("control.issue-invitation.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.issue-invitation.v1",
  declaration: issueControlInvitationCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.issue-invitation.v1 preserves workforce_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.issue-invitation.v1",
          "workforce_rejected",
        ),
    },
  ],
})
