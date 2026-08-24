import type { AccessExecute, AccessInput } from "../../../auth/model/access.ts"
import type { CookieChallengeInput } from "../../../auth/model/schemas.ts"
import type { ControlSessionDependencies } from "../../../auth/model/session.ts"
import {
  accessFailure,
  establishControlSession,
} from "../../../auth/model/session.ts"
import { controlCompleteMfaChallengeCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

export type ControlChallengeDependencies = ControlSessionDependencies &
  Readonly<{
    completeMfaChallenge: AccessExecute<"completeMfaChallenge">
  }>

const challengeAccessInput = (
  input: CookieChallengeInput,
): AccessInput<"completeMfaChallenge"> => ({
  challengeToken: input.challengeToken,
  method: input.method,
  code: input.code,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export const makeControlCompleteMfaChallengeCell = (
  dependencies: ControlChallengeDependencies,
) =>
  bindCell(controlCompleteMfaChallengeCellDeclaration, async (input) => {
    const completed = await dependencies.completeMfaChallenge.execute(
      challengeAccessInput(input),
    )
    if (completed.kind === "failure")
      return {
        kind: "failure",
        failure: accessFailure(completed.failure, [], input.requestId),
      }
    const established = await establishControlSession(dependencies, {
      accessToken: completed.value.accessToken,
      expiresAt: completed.value.expiresAt,
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
