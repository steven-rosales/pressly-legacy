import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { listControlInvitationsCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.list-invitations.v1",
  declaration: listControlInvitationsCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "list invitations preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          listControlInvitationsCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          listControlInvitationsCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          listControlInvitationsCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(listControlInvitationsCellDeclaration.surfaces[0]).toMatchObject(
          {
            kind: "http",
            method: "GET",
            path: "/control/invitations",
          },
        )
        await expectControlOperationSuccess("control.list-invitations.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.list-invitations.v1",
  declaration: listControlInvitationsCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.list-invitations.v1 preserves workforce_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.list-invitations.v1",
          "workforce_rejected",
        ),
    },
  ],
})
