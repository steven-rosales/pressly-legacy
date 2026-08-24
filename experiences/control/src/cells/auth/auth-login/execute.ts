import type { AccessExecute, AccessInput } from "../../../auth/model/access.ts"
import type {
  ControlLoginData,
  LoginInput,
} from "../../../auth/model/schemas.ts"
import type { ControlSessionDependencies } from "../../../auth/model/session.ts"
import {
  accessFailure,
  establishControlSession,
} from "../../../auth/model/session.ts"
import { controlLoginCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

export type ControlLoginDependencies = ControlSessionDependencies &
  Readonly<{
    login: AccessExecute<"login">
  }>

const loginAccessInput = (input: LoginInput): AccessInput<"login"> => ({
  email: input.email,
  password: input.password,
  ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
  ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export const makeControlLoginCell = (dependencies: ControlLoginDependencies) =>
  bindCell(controlLoginCellDeclaration, async (input) => {
    const authenticated = await dependencies.login.execute(
      loginAccessInput(input),
    )
    if (authenticated.kind === "failure")
      return {
        kind: "failure",
        failure: accessFailure(authenticated.failure, [], input.requestId),
      }
    if ("status" in authenticated.value) {
      const data: ControlLoginData = {
        status: "mfa_required",
        methods: ["totp", "recovery"],
      }
      return {
        kind: "success",
        value: {
          data,
          setCookieHeaders: [
            ...dependencies.presentation.serializeCookies([
              { action: "clear", cookie: "session" },
              {
                action: "set",
                cookie: "mfa",
                value: authenticated.value.challengeToken,
                expiresAt: authenticated.value.expiresAt,
              },
            ]),
          ],
        },
      }
    }
    const established = await establishControlSession(dependencies, {
      accessToken: authenticated.value.accessToken,
      expiresAt: authenticated.value.expiresAt,
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    })
    return established.kind === "failure"
      ? established
      : {
          kind: "success",
          value: {
            data: established.session,
            setCookieHeaders: established.setCookieHeaders,
          },
        }
  })
