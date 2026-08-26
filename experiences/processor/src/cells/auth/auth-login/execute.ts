import type {
  AccessExecute,
  AccessInput,
  ProcessorLoginData,
  ProcessorLoginInput,
} from "../../../server/authentication/model.ts"
import type { ProcessorSessionDependencies } from "../../../server/authentication/session.ts"
import { processorAccessFailure } from "../../../server/authentication/model.ts"
import { establishProcessorSession } from "../../../server/authentication/session.ts"
import { processorLoginCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

const loginAccessInput = (
  input: ProcessorLoginInput
): AccessInput<"login"> => ({
  email: input.email,
  password: input.password,
  ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
  ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export type ProcessorLoginDependencies = ProcessorSessionDependencies &
  Readonly<{
    login: AccessExecute<"login">
  }>

export const makeProcessorLoginCell = (
  dependencies: ProcessorLoginDependencies
) =>
  defineOperation(processorLoginCellDeclaration, async (input) => {
    const authenticated = await dependencies.login.execute(
      loginAccessInput(input)
    )
    if (authenticated.kind === "failure")
      return {
        kind: "failure",
        failure: processorAccessFailure(
          authenticated.failure,
          [],
          input.requestId
        ),
      }
    if ("status" in authenticated.value) {
      const data: ProcessorLoginData = {
        status: "mfa_required",
        expiresAt: authenticated.value.expiresAt,
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
    const established = await establishProcessorSession(dependencies, {
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
