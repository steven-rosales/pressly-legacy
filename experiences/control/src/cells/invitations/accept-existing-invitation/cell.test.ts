import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { acceptExistingControlInvitationCellDeclaration } from "./cell.ts"

import {
  expectControlFailureKind,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.accept-existing-invitation.v1",
  declaration: acceptExistingControlInvitationCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "accept existing invitation preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          acceptExistingControlInvitationCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          acceptExistingControlInvitationCellDeclaration.contract.output
            .version,
        ).toBe(1)
        expect(
          acceptExistingControlInvitationCellDeclaration.contract.failure
            .version,
        ).toBe(1)
        expect(
          acceptExistingControlInvitationCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/invitations/accept/existing",
        })
        await expectControlOperationSuccess(
          "control.accept-existing-invitation.v1",
        )
      },
    },
  ],
})

proveOperation({
  operationId: "control.accept-existing-invitation.v1",
  declaration: acceptExistingControlInvitationCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "accept existing invitation preserves validation from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation.v1",
          "validation",
        ),
    },
    {
      name: "accept existing invitation preserves authentication from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation.v1",
          "authentication",
        ),
    },
    {
      name: "accept existing invitation preserves permission from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation.v1",
          "permission",
        ),
    },
    {
      name: "accept existing invitation preserves not_found from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation.v1",
          "not_found",
        ),
    },
    {
      name: "accept existing invitation preserves conflict from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-existing-invitation.v1",
          "conflict",
        ),
    },
  ],
})
