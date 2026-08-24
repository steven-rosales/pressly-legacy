import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { previewControlInvitationCellDeclaration } from "./cell.ts"

import {
  expectControlFailureKind,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.preview-invitation.v1",
  declaration: previewControlInvitationCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "preview invitation preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          previewControlInvitationCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          previewControlInvitationCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          previewControlInvitationCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          previewControlInvitationCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/invitations/preview",
        })
        await expectControlOperationSuccess("control.preview-invitation.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.preview-invitation.v1",
  declaration: previewControlInvitationCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "preview invitation preserves validation from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind("control.preview-invitation.v1", "validation"),
    },
    {
      name: "preview invitation preserves not_found from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind("control.preview-invitation.v1", "not_found"),
    },
    {
      name: "preview invitation preserves conflict from Access",
      proves: ["executor-success"],
      run: () =>
        expectControlFailureKind("control.preview-invitation.v1", "conflict"),
    },
  ],
})
