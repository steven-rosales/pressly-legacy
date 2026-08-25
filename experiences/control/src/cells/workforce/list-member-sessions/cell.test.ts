import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { listControlMemberSessionsCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.list-member-sessions.v1",
  declaration: listControlMemberSessionsCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "list member sessions preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          listControlMemberSessionsCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          listControlMemberSessionsCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          listControlMemberSessionsCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          listControlMemberSessionsCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/control/team/:membershipId/sessions",
        })
        await expectControlOperationSuccess("control.list-member-sessions.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.list-member-sessions.v1",
  declaration: listControlMemberSessionsCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.list-member-sessions.v1 preserves workforce_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.list-member-sessions.v1",
          "workforce_rejected",
        ),
    },
  ],
})
