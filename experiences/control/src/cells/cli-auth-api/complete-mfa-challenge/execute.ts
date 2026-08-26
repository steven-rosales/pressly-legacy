import type { AccessExecute, AccessInput } from "../../../auth/model/access.ts"
import {
  establishCliAuthApiSession,
  type CliAuthApiSessionDependencies,
} from "../../../auth/model/cli-auth-api-session.ts"
import type { CliAuthApiChallengeInput } from "../../../auth/model/cli-auth-api.ts"
import { controlCliAuthApiCompleteMfaChallengeCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

export type ControlCliAuthApiCompleteMfaChallengeDependencies =
  CliAuthApiSessionDependencies &
    Readonly<{ completeMfaChallenge: AccessExecute<"completeMfaChallenge"> }>

const accessInput = (
  input: CliAuthApiChallengeInput,
): AccessInput<"completeMfaChallenge"> => ({
  challengeToken: input.challengeToken,
  method: input.method,
  code: input.code,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export const makeControlCliAuthApiCompleteMfaChallengeCell = (
  dependencies: ControlCliAuthApiCompleteMfaChallengeDependencies,
) =>
  defineOperation(
    controlCliAuthApiCompleteMfaChallengeCellDeclaration,
    async (input) => {
      const authenticated = await dependencies.completeMfaChallenge.execute(
        accessInput(input),
      )
      if (authenticated.kind === "failure") return authenticated
      return establishCliAuthApiSession(dependencies, {
        accessToken: authenticated.value.accessToken,
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
      })
    },
  )
