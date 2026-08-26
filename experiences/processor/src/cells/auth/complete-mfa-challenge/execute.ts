import type {
  AccessExecute,
  AccessInput,
  ProcessorChallengeInput,
} from "../../../server/authentication/model.ts"
import type { ProcessorSessionDependencies } from "../../../server/authentication/session.ts"
import { processorAccessFailure } from "../../../server/authentication/model.ts"
import { establishProcessorSession } from "../../../server/authentication/session.ts"
import { processorCompleteMfaChallengeCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

const challengeAccessInput = (
  input: ProcessorChallengeInput
): AccessInput<"completeMfaChallenge"> => ({
  challengeToken: input.challengeToken,
  method: input.method,
  code: input.code,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export type ProcessorChallengeDependencies = ProcessorSessionDependencies &
  Readonly<{
    completeMfaChallenge: AccessExecute<"completeMfaChallenge">
  }>

export const makeProcessorCompleteMfaChallengeCell = (
  dependencies: ProcessorChallengeDependencies
) =>
  defineOperation(
    processorCompleteMfaChallengeCellDeclaration,
    async (input) => {
      const completed = await dependencies.completeMfaChallenge.execute(
        challengeAccessInput(input)
      )
      if (completed.kind === "failure")
        return {
          kind: "failure",
          failure: processorAccessFailure(
            completed.failure,
            [],
            input.requestId
          ),
        }
      const established = await establishProcessorSession(dependencies, {
        accessToken: completed.value.accessToken,
        expiresAt: completed.value.expiresAt,
        ...(input.requestId === undefined
          ? {}
          : { requestId: input.requestId }),
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
    }
  )
