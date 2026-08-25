import type { AccessExecute, AccessInput } from "../../../auth/model/access.ts"
import {
  controlAccessUnavailable,
  establishCliAuthApiSession,
  type CliAuthApiSessionDependencies,
} from "../../../auth/model/cli-auth-api-session.ts"
import type { CliAuthApiLoginInput } from "../../../auth/model/cli-auth-api.ts"
import { controlCliAuthApiLoginCellDeclaration } from "./cell.ts"
import { bindCell } from "@pressly/cells"

export type ControlCliAuthApiLoginDependencies = CliAuthApiSessionDependencies &
  Readonly<{ login: AccessExecute<"login"> }>

const accessInput = (input: CliAuthApiLoginInput): AccessInput<"login"> => ({
  email: input.email,
  password: input.password,
  ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
  ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
})

export const makeControlCliAuthApiLoginCell = (
  dependencies: ControlCliAuthApiLoginDependencies,
) =>
  bindCell(controlCliAuthApiLoginCellDeclaration, async (input) => {
    const authenticated = await dependencies.login.execute(accessInput(input))
    if (authenticated.kind === "failure") return authenticated

    if ("status" in authenticated.value) {
      const access =
        authenticated.value.principal.audience === "customer"
          ? null
          : await dependencies.resolveIdentityAccess({
              identityId: authenticated.value.principal.identityId,
            })
      return access === null
        ? { kind: "failure", failure: controlAccessUnavailable() }
        : {
            kind: "success",
            value: {
              status: "mfa_required" as const,
              challengeToken: authenticated.value.challengeToken,
              expiresAt: authenticated.value.expiresAt.toISOString(),
            },
          }
    }

    return establishCliAuthApiSession(dependencies, {
      accessToken: authenticated.value.accessToken,
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    })
  })
