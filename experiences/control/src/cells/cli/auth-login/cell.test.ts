import { proveOperation } from "@pressly/testkit/operation-proof"
import { expect } from "vitest"
import { adminCliAuthLoginCellDeclaration } from "./cell.ts"
import { loginSurface, mapLoginInput } from "./cli.ts"

import {
  expectControlCliDiagnosticFailure,
  expectControlOperationSuccess,
} from "../../../../test/support/control-operation-proof.ts"

proveOperation({
  operationId: "control.cli-auth-login.v1",
  declaration: adminCliAuthLoginCellDeclaration,
  layer: "unit",
  scenarios: [
    {
      name: "cli auth login preserves its contract, protocol, and successful capability execution",
      proves: ["contract", "protocol", "executor-success"],
      run: async () => {
        expect(adminCliAuthLoginCellDeclaration.contract.input.version).toBe(1)
        expect(adminCliAuthLoginCellDeclaration.contract.output.version).toBe(1)
        expect(adminCliAuthLoginCellDeclaration.contract.failure.version).toBe(
          1,
        )
        expect(adminCliAuthLoginCellDeclaration.surfaces[0]).toMatchObject({
          kind: "cli",
          name: ["auth", "login"],
          arguments: [],
          stdin: {
            mode: "required",
            encoding: "utf8",
            maxBytes: 4_096,
            tty: "forbid",
          },
        })
        expect(loginSurface.options.map(({ name }) => name)).toEqual([
          "email",
          "secret-stdin",
          "json",
          "help",
        ])
        const mapped = mapLoginInput({
          command: { id: loginSurface.id, name: loginSurface.name },
          arguments: {},
          options: {
            email: "owner@example.com",
            "secret-stdin": true,
          },
          stdin: JSON.stringify({
            password: "correct horse battery staple",
            recoveryCode: "AAAA-BBBB-CCCC-DDDD",
          }),
          context: {},
          prompt: null,
          signal: new AbortController().signal,
        })
        expect(mapped).toEqual({
          kind: "valid",
          value: {
            email: "owner@example.com",
            password: "correct horse battery staple",
            recoveryCode: "AAAA-BBBB-CCCC-DDDD",
          },
        })
        await expectControlOperationSuccess("control.cli-auth-login.v1")
      },
    },
    {
      name: "preserves arbitrary diagnostic code under the finite CLI failure kind",
      proves: ["expected-rejection-no-partial-write"],
      run: async () => {
        await expectControlCliDiagnosticFailure(
          "control.cli-auth-login.v1",
          "diagnostic",
        )
      },
    },
  ],
})
