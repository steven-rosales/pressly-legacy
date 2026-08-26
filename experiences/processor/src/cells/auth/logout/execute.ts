import type {
  AccessInput,
  ProcessorLogoutData,
} from "../../../server/authentication/model.ts"
import type { ProcessorSessionDependencies } from "../../../server/authentication/session.ts"
import { loadProcessorSession } from "../../../server/authentication/session.ts"
import { processorLogoutCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

export const makeProcessorLogoutCell = (
  dependencies: ProcessorSessionDependencies
) =>
  defineOperation(processorLogoutCellDeclaration, async (input) => {
    const loaded = await loadProcessorSession(
      dependencies,
      input.sessionToken,
      input.requestId
    )
    if (loaded.kind === "failure") return loaded
    const command: AccessInput<"revokeSession"> = {
      bearerToken: input.sessionToken,
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    }
    const revoked = await dependencies.revokeSession.execute(command)
    if (revoked.kind === "failure") return revoked
    const data: ProcessorLogoutData = { revoked: true }
    return {
      kind: "success",
      value: {
        data,
        setCookieHeaders: [
          ...dependencies.presentation.serializeCookies([
            { action: "clear", cookie: "session" },
            { action: "clear", cookie: "mfa" },
          ]),
        ],
      },
    }
  })
