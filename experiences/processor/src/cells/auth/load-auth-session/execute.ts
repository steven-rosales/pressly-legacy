import type { ProcessorSessionDependencies } from "../../../server/authentication/session.ts"
import { loadProcessorSession } from "../../../server/authentication/session.ts"
import { processorLoadSessionCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"

export const makeProcessorLoadSessionCell = (
  dependencies: ProcessorSessionDependencies
) =>
  defineOperation(processorLoadSessionCellDeclaration, async (input) => {
    const loaded = await loadProcessorSession(
      dependencies,
      input.sessionToken,
      input.requestId
    )
    return loaded.kind === "failure"
      ? loaded
      : {
          kind: "success",
          value: { data: loaded.session, setCookieHeaders: [] },
        }
  })
