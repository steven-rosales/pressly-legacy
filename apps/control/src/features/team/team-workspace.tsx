import { useCallback, useEffect, useMemo, useState } from "react"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import {
  IconDots,
  IconMailPlus,
  IconRefresh,
  IconShieldCheck,
  IconUsers,
} from "@tabler/icons-react"
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"
import { WorkspaceSectionHeading } from "@/components/layout/workspace-section-heading"
import { controlErrorMessage } from "@/i18n/control-error-message"
import type {
  ControlAuthenticatedSession,
  ControlWorkforceInvitationProjection as WorkforceInvitation,
  ControlWorkforceMemberProjection as WorkforceMember,
  WorkforceRole,
} from "@pressly/contracts/auth"
import {
  InviteTeamMemberSheet,
  OneTimeInvitationSheet,
} from "./team-invitation-workflow"
import type { ControlTeamApi } from "./team-api"
import { MemberDetailSheet } from "./team-member-detail-sheet"

type TeamState =
  | { status: "loading"; members: readonly []; invitations: readonly [] }
  | {
      status: "ready"
      members: readonly WorkforceMember[]
      invitations: readonly WorkforceInvitation[]
    }
  | {
      status: "error"
      members: readonly WorkforceMember[]
      invitations: readonly WorkforceInvitation[]
      message: string
    }

type InvitationAction = Readonly<{
  invitation: WorkforceInvitation
  action: "reissue" | "revoke"
}> | null

const formatDate = (value: string, locale: "en-US" | "es-US") =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))

const roleLabel = (t: TFunction, role: WorkforceRole) => {
  if (role === "owner") return t("team.roles.owner")
  if (role === "manager") return t("team.roles.manager")
  return t("team.roles.operator")
}

const errorMessage = (error: unknown, fallback: string, t: TFunction) => {
  return controlErrorMessage(error, t, fallback, {
    conflict: t("team.errors.conflict"),
  })
}

const stateBadgeVariant = (state: WorkforceMember["state"]) =>
  state === "active"
    ? ("secondary" as const)
    : state === "suspended"
      ? ("destructive" as const)
      : ("outline" as const)

const memberStateLabel = (t: TFunction, state: WorkforceMember["state"]) =>
  state === "active"
    ? t("team.membershipStates.active")
    : state === "suspended"
      ? t("team.membershipStates.suspended")
      : t("team.membershipStates.ended")

const memberAccessLabel = (t: TFunction, member: WorkforceMember) => {
  const effective = member.grants.filter((grant) => grant.effective)
  return effective.length === 0
    ? t("team.members.noEffectiveAccess")
    : [...new Set(effective.map((grant) => roleLabel(t, grant.role)))].join(
        ", ",
      )
}

function InvitationActions({
  invitation,
  onAction,
}: {
  invitation: WorkforceInvitation
  onAction: (action: Exclude<InvitationAction, null>) => void
}) {
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-11 md:size-7"
          aria-label={t("team.table.actionsFor", {
            name: invitation.displayName,
          })}
        >
          <IconDots />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => onAction({ invitation, action: "reissue" })}
        >
          {t("team.invitations.replace")}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onAction({ invitation, action: "revoke" })}
        >
          {t("team.invitations.revoke")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TeamWorkspace({
  api,
  session,
}: {
  api: ControlTeamApi
  session: ControlAuthenticatedSession
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith("es") ? "es-US" : "en-US"
  const [state, setState] = useState<TeamState>({
    status: "loading",
    members: [],
    invitations: [],
  })
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [oneTimeLink, setOneTimeLink] = useState<string | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [invitationAction, setInvitationAction] =
    useState<InvitationAction>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const canWrite = session.access.capabilities.includes("team:write")

  const load = useCallback(async () => {
    try {
      const [members, invitations] = await Promise.all([
        api.listMembers(),
        api.listInvitations(),
      ])
      setState({
        status: "ready",
        members: members.members,
        invitations: invitations.invitations,
      })
    } catch (loadError) {
      setState((current) => ({
        status: "error",
        members: current.members,
        invitations: current.invitations,
        message: errorMessage(loadError, t("team.errors.load"), t),
      }))
    }
  }, [api, t])

  useEffect(() => {
    void load()
  }, [load])

  const locationNames = useMemo(
    () =>
      new Map(
        session.access.locations.map((location) => [
          location.id,
          location.name,
        ]),
      ),
    [session.access.locations],
  )

  const showLink = (token: string) => {
    const link = new URL(window.location.origin)
    link.hash = new URLSearchParams({ invite: token }).toString()
    setOneTimeLink(link.href)
  }

  const issue = async (input: {
    displayName: string
    email: string
    intendedRole: WorkforceRole
    intendedLocationId: string | null
  }) => {
    setInviteBusy(true)
    setInviteError(null)
    try {
      const result = await api.issueInvitation(input)
      await load()
      if (result.status === "issued") {
        setInviteOpen(false)
        showLink(result.acceptanceToken)
      } else {
        setInviteError(t("team.errors.invitationReplay"))
      }
    } catch (error) {
      setInviteError(errorMessage(error, t("team.errors.invitationCreate"), t))
    } finally {
      setInviteBusy(false)
    }
  }

  const confirmInvitationAction = async () => {
    if (invitationAction === null) return
    setActionBusy(true)
    try {
      if (invitationAction.action === "reissue") {
        const result = await api.reissueInvitation(invitationAction.invitation)
        if (result.status === "issued") showLink(result.acceptanceToken)
      } else {
        await api.revokeInvitation(invitationAction.invitation)
      }
      setInvitationAction(null)
      await load()
    } catch (error) {
      setState((current) => ({
        status: "error",
        members: current.members,
        invitations: current.invitations,
        message: errorMessage(error, t("team.errors.invitationChange"), t),
      }))
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <section
      className="flex flex-col gap-6"
      aria-labelledby="team-workspace-title"
    >
      <WorkspaceSectionHeading
        title={t("team.workspace.title")}
        titleId="team-workspace-title"
        description={t("team.workspace.description")}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="h-11 sm:h-8"
              onClick={() => void load()}
              disabled={state.status === "loading"}
            >
              <IconRefresh data-icon="inline-start" />
              {t("team.common.refresh")}
            </Button>
            {canWrite && (
              <Button
                className="h-11 sm:h-8"
                onClick={() => setInviteOpen(true)}
              >
                <IconMailPlus data-icon="inline-start" />
                {t("team.invite.action")}
              </Button>
            )}
          </div>
        }
      />

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertTitle>{t("team.workspace.attention")}</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {!canWrite && (
        <Alert>
          <IconShieldCheck />
          <AlertTitle>{t("team.workspace.readOnlyTitle")}</AlertTitle>
          <AlertDescription>
            {t("team.workspace.readOnlyDescription")}
          </AlertDescription>
        </Alert>
      )}

      {state.status === "loading" ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Spinner />
            </EmptyMedia>
            <EmptyTitle>{t("team.workspace.loadingTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("team.workspace.loadingDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {state.invitations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("team.invitations.title")}</CardTitle>
                <CardDescription>
                  {t("team.invitations.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="ps-4">
                          {t("team.table.person")}
                        </TableHead>
                        <TableHead>{t("team.table.access")}</TableHead>
                        <TableHead>{t("team.table.expires")}</TableHead>
                        {canWrite && (
                          <TableHead className="w-12 pe-4 text-end">
                            <span className="sr-only">
                              {t("team.table.actions")}
                            </span>
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {state.invitations.map((invitation) => (
                        <TableRow key={invitation.id}>
                          <TableCell className="ps-4">
                            <p className="font-medium">
                              {invitation.displayName}
                            </p>
                            <p className="text-muted-foreground">
                              {invitation.email}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p>{roleLabel(t, invitation.intendedRole)}</p>
                            <p className="text-muted-foreground">
                              {invitation.intendedLocationId === null
                                ? t("team.entireBusiness")
                                : (locationNames.get(
                                    invitation.intendedLocationId,
                                  ) ?? t("team.assignedLocation"))}
                            </p>
                          </TableCell>
                          <TableCell>
                            {formatDate(invitation.expiresAt, locale)}
                          </TableCell>
                          {canWrite && (
                            <TableCell className="pe-4 text-end">
                              <InvitationActions
                                invitation={invitation}
                                onAction={setInvitationAction}
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div
                  role="list"
                  aria-label={t("team.invitations.title")}
                  className="grid gap-3 px-4 md:hidden"
                >
                  {state.invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      role="listitem"
                      className="rounded-lg border p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {invitation.displayName}
                          </p>
                          <p className="text-muted-foreground truncate text-sm">
                            {invitation.email}
                          </p>
                        </div>
                        {canWrite && (
                          <InvitationActions
                            invitation={invitation}
                            onAction={setInvitationAction}
                          />
                        )}
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <dt className="text-muted-foreground">
                            {t("team.table.access")}
                          </dt>
                          <dd className="font-medium">
                            {roleLabel(t, invitation.intendedRole)}
                          </dd>
                          <dd className="text-muted-foreground">
                            {invitation.intendedLocationId === null
                              ? t("team.entireBusiness")
                              : (locationNames.get(
                                  invitation.intendedLocationId,
                                ) ?? t("team.assignedLocation"))}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            {t("team.table.expires")}
                          </dt>
                          <dd className="font-medium">
                            {formatDate(invitation.expiresAt, locale)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("team.members.title")}</CardTitle>
              <CardDescription>{t("team.members.description")}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {state.members.length === 0 ? (
                <Empty className="min-h-56">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <IconUsers />
                    </EmptyMedia>
                    <EmptyTitle>{t("team.members.emptyTitle")}</EmptyTitle>
                    <EmptyDescription>
                      {t("team.members.emptyDescription")}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="ps-4">
                            {t("team.table.person")}
                          </TableHead>
                          <TableHead>{t("team.table.access")}</TableHead>
                          <TableHead>{t("team.table.security")}</TableHead>
                          <TableHead>{t("team.table.status")}</TableHead>
                          <TableHead className="pe-4 text-end">
                            <span className="sr-only">
                              {t("team.table.open")}
                            </span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {state.members.map((member) => (
                          <TableRow key={member.membershipId}>
                            <TableCell className="ps-4">
                              <p className="font-medium">
                                {member.displayName}
                              </p>
                              <p className="text-muted-foreground">
                                {member.email}
                              </p>
                            </TableCell>
                            <TableCell>
                              {memberAccessLabel(t, member)}
                            </TableCell>
                            <TableCell>
                              {member.mfaEnabled ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <IconShieldCheck className="size-4" />
                                  {t("team.members.mfaEnabled")}
                                </span>
                              ) : (
                                t("team.members.passwordOnly")
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={stateBadgeVariant(member.state)}>
                                {memberStateLabel(t, member.state)}
                              </Badge>
                            </TableCell>
                            <TableCell className="pe-4 text-end">
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={t("team.members.reviewFor", {
                                  name: member.displayName,
                                })}
                                onClick={() =>
                                  setSelectedMemberId(member.membershipId)
                                }
                              >
                                {t("team.members.review")}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div
                    role="list"
                    aria-label={t("team.members.title")}
                    className="grid gap-3 px-4 md:hidden"
                  >
                    {state.members.map((member) => (
                      <div
                        key={member.membershipId}
                        role="listitem"
                        className="rounded-lg border p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{member.displayName}</p>
                            <p className="text-muted-foreground truncate text-sm">
                              {member.email}
                            </p>
                          </div>
                          <Badge variant={stateBadgeVariant(member.state)}>
                            {memberStateLabel(t, member.state)}
                          </Badge>
                        </div>
                        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <dt className="text-muted-foreground">
                              {t("team.table.access")}
                            </dt>
                            <dd className="font-medium">
                              {memberAccessLabel(t, member)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">
                              {t("team.table.security")}
                            </dt>
                            <dd className="font-medium">
                              {member.mfaEnabled
                                ? t("team.members.mfaEnabled")
                                : t("team.members.passwordOnly")}
                            </dd>
                          </div>
                        </dl>
                        <Button
                          className="mt-4 h-11 w-full"
                          variant="outline"
                          aria-label={t("team.members.reviewFor", {
                            name: member.displayName,
                          })}
                          onClick={() =>
                            setSelectedMemberId(member.membershipId)
                          }
                        >
                          {t("team.members.review")}
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {inviteOpen && (
        <InviteTeamMemberSheet
          locations={session.access.locations}
          busy={inviteBusy}
          error={inviteError}
          onClose={() => {
            if (!inviteBusy) {
              setInviteOpen(false)
              setInviteError(null)
            }
          }}
          onIssue={issue}
        />
      )}
      {oneTimeLink !== null && (
        <OneTimeInvitationSheet
          link={oneTimeLink}
          onClose={() => setOneTimeLink(null)}
        />
      )}
      {selectedMemberId !== null && (
        <MemberDetailSheet
          key={selectedMemberId}
          api={api}
          memberId={selectedMemberId}
          currentIdentityId={session.principal.identityId}
          businessId={session.access.business.id}
          locations={session.access.locations}
          canWrite={canWrite}
          onClose={() => setSelectedMemberId(null)}
          onChanged={load}
        />
      )}
      <AlertDialog
        open={invitationAction !== null}
        onOpenChange={(open) => {
          if (!open && !actionBusy) setInvitationAction(null)
        }}
      >
        {invitationAction !== null && (
          <AlertDialogContent
            onEscapeKeyDown={(event) => {
              if (actionBusy) event.preventDefault()
            }}
          >
            <AlertDialogHeader>
              <AlertDialogMedia>
                {invitationAction.action === "revoke" ? (
                  <IconShieldCheck />
                ) : (
                  <IconMailPlus />
                )}
              </AlertDialogMedia>
              <AlertDialogTitle>
                {invitationAction.action === "reissue"
                  ? t("team.invitations.replaceTitle", {
                      name: invitationAction.invitation.displayName,
                    })
                  : t("team.invitations.revokeTitle", {
                      name: invitationAction.invitation.displayName,
                    })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {invitationAction.action === "reissue"
                  ? t("team.invitations.replaceDescription")
                  : t("team.invitations.revokeDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionBusy}>
                {t("team.common.cancel")}
              </AlertDialogCancel>
              <Button
                variant={
                  invitationAction.action === "revoke"
                    ? "destructive"
                    : "default"
                }
                disabled={actionBusy}
                onClick={() => void confirmInvitationAction()}
              >
                {actionBusy && <Spinner data-icon="inline-start" />}
                {t("team.common.confirm")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </section>
  )
}
