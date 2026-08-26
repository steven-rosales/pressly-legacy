import type { AccessExecute } from "../../../auth/model/access.ts"
import type {
  ControlBrowserPresentation,
  ResolveControlAccess,
} from "../../../auth/model/ports.ts"
import type {
  InvitationAcceptance,
  InvitationBootstrapData,
  InvitationBootstrapOutput,
  InvitationFailure,
} from "../../../management/invitations/contracts.ts"
import { controlSession } from "../../../auth/model/session.ts"
import {
  invitationAuthFailure,
  invitationExistingIdentityRequired,
  invitationPeerFailure,
} from "../../../management/invitations/failure.ts"
import { acceptExistingPasswordCellDeclaration } from "./cell.ts"
import { defineOperation } from "@pressly/cells"
import { invariantViolationError } from "@pressly/errors/factories"

type PreviewExecute = AccessExecute<"previewWorkforceInvitation">

type AcceptExecute = AccessExecute<"acceptWorkforceInvitation">

type RawAcceptance = Extract<
  Awaited<ReturnType<AcceptExecute["execute"]>>,
  Readonly<{
    kind: "success"
  }>
>["value"]

const projectAcceptance = (value: RawAcceptance): InvitationAcceptance => ({
  invitationId: value.invitation.id,
  membershipId: value.membershipId,
  identityId: value.identityId,
  identityCreated: value.identityCreated,
  privilegedAccessEffective: value.privilegedAccessEffective,
  replayed: value.replayed,
})

type BootstrapDependencies = Readonly<{
  acceptInvitation: AcceptExecute
  loadSession: AccessExecute<"loadSession">
  revokeSession: AccessExecute<"revokeSession">
  resolveAccess: ResolveControlAccess
  presentation: ControlBrowserPresentation
  controlOrigin: string
  processorOrigin: string
}>

const destinationFor = (
  role: RawAcceptance["invitation"]["intendedRole"],
  dependencies: BootstrapDependencies,
) =>
  role === "operator"
    ? {
        id: "processor" as const,
        label: "Pressly Processor",
        description: "Run intake, scheduling, and laundry-floor production.",
        href: dependencies.processorOrigin,
      }
    : {
        id: "control" as const,
        label: "Pressly Control",
        description: "Manage people, customers, orders, and account security.",
        href: dependencies.controlOrigin,
      }

const revokeBootstrap = async (
  dependencies: BootstrapDependencies,
  accessToken: string,
  requestIdValue?: string,
): Promise<readonly string[]> => {
  await dependencies.revokeSession.execute({
    bearerToken: accessToken,
    ...(requestIdValue === undefined ? {} : { requestId: requestIdValue }),
  })
  return dependencies.presentation.serializeCookies([
    { action: "clear", cookie: "session" },
  ])
}

const acceptAndEstablish = async (
  dependencies: BootstrapDependencies,
  command: Readonly<{
    acceptanceToken: string
    idempotencyKey: string
    accessToken: string
    expiresAt: Date
    requestId?: string
  }>,
): Promise<
  | Readonly<{
      kind: "success"
      value: InvitationBootstrapOutput
    }>
  | Readonly<{
      kind: "failure"
      failure: InvitationFailure
    }>
> => {
  const loaded = await dependencies.loadSession.execute({
    bearerToken: command.accessToken,
  })
  if (loaded.kind === "failure")
    return {
      kind: "failure",
      failure: invitationAuthFailure(
        loaded.failure,
        await revokeBootstrap(
          dependencies,
          command.accessToken,
          command.requestId,
        ),
        command.requestId,
      ),
    }
  const sessionId = loaded.value.principal.sessionId
  if (sessionId === undefined) {
    await revokeBootstrap(dependencies, command.accessToken, command.requestId)
    throw invariantViolationError({
      code: "invitation_bootstrap_session_id_missing",
      message: "Invitation bootstrap session has no session identifier.",
      safeMessage: "Invitation could not be accepted.",
    })
  }
  const accepted = await dependencies.acceptInvitation.execute({
    rawToken: command.acceptanceToken,
    idempotencyKey: command.idempotencyKey,
    acceptance: {
      kind: "existing_identity",
      authenticatedIdentityId: loaded.value.principal.identityId,
      authenticatedSessionId: sessionId,
    },
  })
  if (accepted.kind === "failure")
    return {
      kind: "failure",
      failure: invitationPeerFailure(
        accepted.failure,
        await revokeBootstrap(
          dependencies,
          command.accessToken,
          command.requestId,
        ),
      ),
    }
  const access = await dependencies.resolveAccess(loaded.value)
  const destination = destinationFor(
    accepted.value.invitation.intendedRole,
    dependencies,
  )
  if (access === null) {
    await dependencies.revokeSession.execute({
      bearerToken: command.accessToken,
      ...(command.requestId === undefined
        ? {}
        : { requestId: command.requestId }),
    })
    return {
      kind: "success",
      value: {
        data: {
          status: "accepted",
          acceptance: projectAcceptance(accepted.value),
          session: null,
          destination,
        },
        setCookieHeaders: [
          ...dependencies.presentation.serializeCookies([
            { action: "clear", cookie: "session" },
            { action: "clear", cookie: "mfa" },
          ]),
        ],
      },
    }
  }
  return {
    kind: "success",
    value: {
      data: {
        status: "accepted",
        acceptance: projectAcceptance(accepted.value),
        session: controlSession(
          loaded.value,
          access,
          command.accessToken,
          dependencies.presentation,
        ),
        destination,
      },
      setCookieHeaders: [
        ...dependencies.presentation.serializeCookies([
          {
            action: "set",
            cookie: "session",
            value: command.accessToken,
            expiresAt: command.expiresAt,
          },
          { action: "clear", cookie: "mfa" },
        ]),
      ],
    },
  }
}

export type AcceptExistingPasswordDependencies = BootstrapDependencies &
  Readonly<{
    previewInvitation: PreviewExecute
    login: AccessExecute<"login">
  }>

export const makeAcceptExistingPasswordCell = (
  dependencies: AcceptExistingPasswordDependencies,
) =>
  defineOperation(acceptExistingPasswordCellDeclaration, async (input) => {
    const preview = await dependencies.previewInvitation.execute(
      input.acceptanceToken,
    )
    if (preview.kind === "failure")
      return {
        kind: "failure",
        failure: invitationPeerFailure(preview.failure),
      }
    if (!preview.value.existingIdentity)
      return { kind: "failure", failure: invitationExistingIdentityRequired() }
    const authenticated = await dependencies.login.execute({
      email: preview.value.emailNormalized,
      password: input.password,
      ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
      ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    })
    if (authenticated.kind === "failure")
      return {
        kind: "failure",
        failure: invitationAuthFailure(authenticated.failure),
      }
    if ("status" in authenticated.value) {
      const data: InvitationBootstrapData = {
        status: "mfa_required",
        methods: ["totp", "recovery"],
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
    return acceptAndEstablish(dependencies, {
      acceptanceToken: input.acceptanceToken,
      idempotencyKey: input.idempotencyKey,
      accessToken: authenticated.value.accessToken,
      expiresAt: authenticated.value.expiresAt,
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    })
  })
