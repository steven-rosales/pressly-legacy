import type { z } from "zod"
import {
  controlAuthenticatedSessionSchema,
  controlLoginResultSchema,
  type PresslyApplication,
} from "./contracts/authentication.ts"
import { controlInvitationBootstrapResultSchema } from "./contracts/invitations.ts"

type ApplicationId = PresslyApplication["id"]

const productionOrigins: Readonly<Record<ApplicationId, string>> = {
  control: "https://control.trypressly.com",
  processor: "https://processor.trypressly.com",
}

const developmentPorts: Readonly<Record<ApplicationId, string>> = {
  control: "4174",
  processor: "4173",
}

export const isAllowedControlApplicationHref = (
  applicationId: ApplicationId,
  href: string,
): boolean => {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return false
  }

  if (
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.pathname !== "/" ||
    url.search.length > 0 ||
    url.hash.length > 0
  )
    return false
  if (url.origin === productionOrigins[applicationId]) return true
  if (
    url.protocol === "https:" &&
    url.hostname === `${applicationId}.pressly.test` &&
    url.port.length > 0
  )
    return true
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    url.port === developmentPorts[applicationId]
  )
}

const addDestinationIssues = (
  applications: readonly Readonly<{ id: ApplicationId; href: string }>[],
  context: z.core.$RefinementCtx,
  path: readonly PropertyKey[],
): void => {
  applications.forEach((application, index) => {
    if (isAllowedControlApplicationHref(application.id, application.href))
      return
    context.addIssue({
      code: "custom",
      path: [...path, index, "href"],
      message: "Application destination is not allowlisted.",
      input: application.href,
    })
  })
}

export const controlBrowserSessionWireSchema =
  controlAuthenticatedSessionSchema.superRefine((session, context) =>
    addDestinationIssues(session.access.applications, context, [
      "access",
      "applications",
    ]),
  )

export const controlBrowserLoginWireSchema =
  controlLoginResultSchema.superRefine((result, context) => {
    if (result.status !== "authenticated") return
    addDestinationIssues(result.access.applications, context, [
      "access",
      "applications",
    ])
  })

export const controlInvitationBootstrapWireSchema =
  controlInvitationBootstrapResultSchema.superRefine((result, context) => {
    if (result.status !== "accepted") return
    if (
      !isAllowedControlApplicationHref(
        result.destination.id,
        result.destination.href,
      )
    )
      context.addIssue({
        code: "custom",
        path: ["destination"],
        message: "Application destination is not allowlisted.",
        input: result.destination,
      })
    if (result.session !== null)
      addDestinationIssues(result.session.access.applications, context, [
        "session",
        "access",
        "applications",
      ])
  })
