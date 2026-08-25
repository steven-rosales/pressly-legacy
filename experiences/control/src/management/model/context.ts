import type { HttpRequest } from "@pressly/cells"
import { invariantViolationError } from "@pressly/errors/factories"
import { z } from "zod"
import {
  controlAccessSchema,
  type ControlAccess,
} from "../../auth/model/schemas.ts"

export type ControlManagementContext = Readonly<{
  access: ControlAccess
  actor: Readonly<{ identityId: string; sessionId: string }>
  command: Readonly<{
    origin: "pressly_control"
    principal: Readonly<{
      kind: "human" | "service" | "system"
      id: string
    }>
  }>
}>

export const controlManagementContextSchema = z
  .object({
    access: controlAccessSchema,
    actor: z.object({ identityId: z.string(), sessionId: z.string() }).strict(),
    command: z
      .object({
        origin: z.literal("pressly_control"),
        principal: z
          .object({
            kind: z.enum(["human", "service", "system"]),
            id: z.string(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()

export const controlManagementContext = (
  request: HttpRequest,
): ControlManagementContext => {
  const parsed = controlManagementContextSchema.safeParse(request.context)
  if (parsed.success) return parsed.data
  throw invariantViolationError({
    code: "control_management_context_missing",
    message: "Control management request context was not provided.",
    safeMessage: "Session could not be loaded.",
    cause: parsed.error,
  })
}
