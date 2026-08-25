import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { controlCliAuthApiLogoutCellDeclaration } from "./cell.ts"
import { expectControlOperationSuccess } from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-auth-api-logout.v1",
  declaration: controlCliAuthApiLogoutCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "Control CLI API logout declares the raw bearer route and revokes once",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(
          controlCliAuthApiLogoutCellDeclaration.surfaces[0],
        ).toMatchObject({
          kind: "http",
          method: "POST",
          path: "/control/cli/auth/logout",
        })
        await expectControlOperationSuccess("control.cli-auth-api-logout.v1")
      },
    },
  ],
})
