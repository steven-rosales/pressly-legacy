import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { listControlSecurityEventsCellDeclaration } from "./cell.ts"

import {
  expectControlManagementFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.list-security-events.v1",
  declaration: listControlSecurityEventsCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "list security events preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          listControlSecurityEventsCellDeclaration.contract.input.version,
        ).toBe(1)
        expect(
          listControlSecurityEventsCellDeclaration.contract.output.version,
        ).toBe(1)
        expect(
          listControlSecurityEventsCellDeclaration.contract.failure.version,
        ).toBe(1)
        expect(
          listControlSecurityEventsCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "GET",
          path: "/control/security/events",
        })
        await expectControlOperationSuccess("control.list-security-events.v1")
      },
    },
  ],
})

proveOperation({
  operationId: "control.list-security-events.v1",
  declaration: listControlSecurityEventsCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "control.list-security-events.v1 preserves workforce_rejected from its reachable executor branch",
      proves: ["executor-success"],
      run: () =>
        expectControlManagementFailure(
          "control.list-security-events.v1",
          "workforce_rejected",
        ),
    },
  ],
})
