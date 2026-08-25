import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { acceptNewControlInvitationCellDeclaration } from "./cell.ts"

import {
  expectControlFailureKind,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.accept-new-invitation.v1",
  declaration: acceptNewControlInvitationCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "accept new invitation preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          acceptNewControlInvitationCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          acceptNewControlInvitationCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          acceptNewControlInvitationCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          acceptNewControlInvitationCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/invitations/accept/new",
        })
        await expectControlOperationSuccess("control.accept-new-invitation.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.accept-new-invitation.v1",
  declaration: acceptNewControlInvitationCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "accept new invitation preserves validation from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-new-invitation.v1",
          "validation",
        ),
    },
    {
      name: "accept new invitation preserves authentication from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-new-invitation.v1",
          "authentication",
        ),
    },
    {
      name: "accept new invitation preserves permission from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-new-invitation.v1",
          "permission",
        ),
    },
    {
      name: "accept new invitation preserves not_found from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-new-invitation.v1",
          "not_found",
        ),
    },
    {
      name: "accept new invitation preserves conflict from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind(
          "control.accept-new-invitation.v1",
          "conflict",
        ),
    },
  ],
})
