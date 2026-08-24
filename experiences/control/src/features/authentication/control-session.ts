import {
  controlAuthenticatedSessionSchema as sharedControlAuthenticatedSessionSchema,
  controlLoginResultSchema as sharedControlLoginResultSchema,
  presslyApplicationSchema,
  type PresslyApplication,
} from "../../browser/contracts/authentication.ts"

const expectedProductionOrigins: Readonly<
  Record<PresslyApplication["id"], string>
> = {
  processor: "https://processor.trypressly.com",
  control: "https://control.trypressly.com",
}

const expectedDevelopmentPorts: Readonly<
  Record<PresslyApplication["id"], string>
> = {
  processor: "4173",
  control: "4174",
}

export function isAllowedApplicationHref(
  applicationId: PresslyApplication["id"],
  href: string,
) {
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
  ) {
    return false
  }

  if (url.origin === expectedProductionOrigins[applicationId]) return true

  if (
    url.protocol === "https:" &&
    url.hostname === `${applicationId}.pressly.test` &&
    url.port.length > 0
  ) {
    return true
  }

  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    url.port === expectedDevelopmentPorts[applicationId]
  )
}

export const applicationDestinationSchema =
  presslyApplicationSchema.superRefine((application, context) => {
    if (!isAllowedApplicationHref(application.id, application.href)) {
      context.addIssue({
        code: "custom",
        path: ["href"],
        message: "Application destination is not allowlisted.",
      })
    }
  })

function validateApplicationDestinations(
  applications: readonly PresslyApplication[],
) {
  const issues = applications.flatMap((application, index) =>
    isAllowedApplicationHref(application.id, application.href)
      ? []
      : [
          {
            index,
            message: "Application destination is not allowlisted.",
          },
        ],
  )
  const identifiers = new Set(applications.map(({ id }) => id))

  return {
    issues,
    hasDuplicateIdentifiers: identifiers.size !== applications.length,
    exceedsApplicationLimit: applications.length > 2,
  }
}

function addApplicationDestinationIssues(
  applications: readonly PresslyApplication[],
  addIssue: (issue: {
    code: "custom"
    path: Array<string | number>
    message: string
  }) => void,
) {
  const validation = validateApplicationDestinations(applications)
  for (const issue of validation.issues) {
    addIssue({
      code: "custom",
      path: ["access", "applications", issue.index, "href"],
      message: issue.message,
    })
  }
  if (validation.hasDuplicateIdentifiers) {
    addIssue({
      code: "custom",
      path: ["access", "applications"],
      message: "Application destinations must be unique.",
    })
  }
  if (validation.exceedsApplicationLimit) {
    addIssue({
      code: "custom",
      path: ["access", "applications"],
      message: "Application destinations exceed the supported limit.",
    })
  }
}

export const controlAuthenticatedSessionSchema =
  sharedControlAuthenticatedSessionSchema.superRefine((session, context) => {
    addApplicationDestinationIssues(session.access.applications, (issue) =>
      context.addIssue(issue),
    )
  })

export const controlLoginResultSchema =
  sharedControlLoginResultSchema.superRefine((result, context) => {
    if (result.status !== "authenticated") return
    addApplicationDestinationIssues(result.access.applications, (issue) =>
      context.addIssue(issue),
    )
  })
