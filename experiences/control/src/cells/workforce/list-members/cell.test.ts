import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { listControlMembersCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.list-members.v1",
  declaration: listControlMembersCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "list members preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(listControlMembersCellDeclaration.contract.input.version).toBe(1)
        expect(listControlMembersCellDeclaration.contract.output.version).toBe(
          1,
        )
        expect(listControlMembersCellDeclaration.contract.failure.version).toBe(
          1,
        )
        expect(listControlMembersCellDeclaration.surfaces[0]).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/control/team",
        })
        await expectControlOperationSuccess("control.list-members.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.list-members.v1",
  declaration: listControlMembersCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.list-members.v1 preserves workforce_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.list-members.v1",
          "workforce_rejected",
        ),
    },
  ],
})
