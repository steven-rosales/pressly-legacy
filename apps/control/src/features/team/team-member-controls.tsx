import { useState } from "react"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import {
  IconDeviceDesktop,
  IconLogout,
  IconShieldCheck,
  IconUserCheck,
  IconUserOff,
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
  Field,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"
import type { ControlAuthenticatedSession } from "@/authentication/control-session"
import type { ControlTeamApi } from "./team-api"
import type {
  AccessGrant,
  WorkforceMemberDetail,
  WorkforceRole,
  WorkforceSession,
} from "./team-model"

type MutationRunner = (operation: () => Promise<unknown>) => Promise<void>

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

const accessPreview = (
  t: TFunction,
  role: WorkforceRole,
  locationName: string | null,
) => {
  if (role === "owner") return t("team.accessPreview.owner")
  if (role === "manager" && locationName === null)
    return t("team.accessPreview.managerBusiness")
  if (role === "manager")
    return t("team.accessPreview.managerLocation", { location: locationName })
  return t("team.accessPreview.operator", {
    location: locationName ?? t("team.selectedLocation"),
  })
}

const grantScopeLabel = (
  t: TFunction,
  grant: AccessGrant,
  locations: ControlAuthenticatedSession["access"]["locations"],
) =>
  grant.scope.kind === "business"
    ? t("team.allLocations")
    : (locations.find(({ id }) => id === grant.scope.id)?.name ??
      t("team.assignedLocation"))

export function MemberAccessControls({
  api,
  member,
  businessId,
  locations,
  canWrite,
  self,
  busy,
  mutate,
}: {
  api: ControlTeamApi
  member: WorkforceMemberDetail
  businessId: string
  locations: ControlAuthenticatedSession["access"]["locations"]
  canWrite: boolean
  self: boolean
  busy: boolean
  mutate: MutationRunner
}) {
  const { t } = useTranslation()
  const [grantOpen, setGrantOpen] = useState(false)
  const [grantRole, setGrantRole] = useState<WorkforceRole>("operator")
  const [grantScope, setGrantScope] = useState(locations[0]?.id ?? "")
  const [grantToRevoke, setGrantToRevoke] = useState<AccessGrant | null>(null)
  const locationName = (id: string) =>
    locations.find((location) => location.id === id)?.name ??
    t("team.assignedLocation")

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("team.access.title")}</CardTitle>
          <CardDescription>{t("team.access.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {member.grants.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("team.access.empty")}
            </p>
          ) : (
            <div className="divide-y rounded-lg border">
              {member.grants.map((grant) => (
                <div
                  key={grant.id}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{roleLabel(t, grant.role)}</p>
                    <p className="text-muted-foreground text-sm">
                      {grantScopeLabel(t, grant, locations)}
                      {!grant.effective && grant.state === "active"
                        ? t("team.access.notYetEffective")
                        : ""}
                    </p>
                  </div>
                  {canWrite && !self && grant.state === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={t("team.access.revokeFor", {
                        role: roleLabel(t, grant.role),
                        name: member.displayName,
                      })}
                      onClick={() => setGrantToRevoke(grant)}
                    >
                      {t("team.access.revoke")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {canWrite && !self && member.state !== "ended" && (
            <div className="mt-4">
              {!grantOpen ? (
                <Button variant="outline" onClick={() => setGrantOpen(true)}>
                  {t("team.access.add")}
                </Button>
              ) : (
                <form
                  className="flex flex-col gap-3 rounded-lg border p-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const scope =
                      grantRole === "owner" || grantScope === "business"
                        ? {
                            kind: "business" as const,
                            id: businessId,
                          }
                        : {
                            kind: "location" as const,
                            id: grantScope,
                          }
                    void mutate(async () => {
                      await api.grantAccess({
                        membershipId: member.membershipId,
                        identityId: member.identityId,
                        role: grantRole,
                        scope,
                      })
                      setGrantOpen(false)
                    })
                  }}
                >
                  <p className="font-medium">{t("team.access.add")}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="grant-role">
                        {t("team.accessLevel")}
                      </FieldLabel>
                      <Select
                        value={grantRole}
                        onValueChange={(value) => {
                          const next = value as WorkforceRole
                          setGrantRole(next)
                          setGrantScope(
                            next === "owner"
                              ? "business"
                              : next === "operator"
                                ? (locations[0]?.id ?? "")
                                : "business",
                          )
                        }}
                      >
                        <SelectTrigger id="grant-role" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="operator">
                              {t("team.roles.operator")}
                            </SelectItem>
                            <SelectItem value="manager">
                              {t("team.roles.manager")}
                            </SelectItem>
                            <SelectItem value="owner">
                              {t("team.roles.owner")}
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    {grantRole !== "owner" && (
                      <Field>
                        <FieldLabel htmlFor="grant-scope">
                          {t("team.access.scope")}
                        </FieldLabel>
                        <Select
                          value={grantScope}
                          onValueChange={setGrantScope}
                        >
                          <SelectTrigger id="grant-scope" className="w-full">
                            <SelectValue
                              placeholder={t("team.access.chooseScope")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {grantRole === "manager" && (
                                <SelectItem value="business">
                                  {t("team.entireBusiness")}
                                </SelectItem>
                              )}
                              {locations.map((location) => (
                                <SelectItem
                                  key={location.id}
                                  value={location.id}
                                >
                                  {location.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </div>
                  <Alert>
                    <IconShieldCheck />
                    <AlertTitle>{t("team.accessPreview.title")}</AlertTitle>
                    <AlertDescription>
                      {accessPreview(
                        t,
                        grantRole,
                        grantScope === "business"
                          ? null
                          : locationName(grantScope),
                      )}
                    </AlertDescription>
                  </Alert>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setGrantOpen(false)}
                    >
                      {t("team.common.cancel")}
                    </Button>
                    <Button
                      type="submit"
                      disabled={
                        busy ||
                        (grantRole === "operator" && grantScope.length === 0)
                      }
                    >
                      {t("team.access.add")}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={grantToRevoke !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setGrantToRevoke(null)
        }}
      >
        {grantToRevoke !== null && (
          <AlertDialogContent
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault()
            }}
          >
            <AlertDialogHeader>
              <AlertDialogMedia>
                <IconUserOff />
              </AlertDialogMedia>
              <AlertDialogTitle>
                {t("team.access.revokeTitle", {
                  role: roleLabel(t, grantToRevoke.role),
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("team.access.revokeDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>
                {t("team.access.keep")}
              </AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void mutate(async () => {
                    await api.revokeAccess({
                      grantId: grantToRevoke.id,
                      expectedVersion: grantToRevoke.version,
                      reason: "Access changed by a manager.",
                    })
                    setGrantToRevoke(null)
                  })
                }
              >
                {busy && <Spinner data-icon="inline-start" />}
                {t("team.access.confirmRevoke")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </>
  )
}

export function MemberSessionControls({
  api,
  member,
  sessions,
  canWrite,
  self,
  busy,
  mutate,
}: {
  api: ControlTeamApi
  member: WorkforceMemberDetail
  sessions: readonly WorkforceSession[]
  canWrite: boolean
  self: boolean
  busy: boolean
  mutate: MutationRunner
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith("es") ? "es-US" : "en-US"
  const [sessionAction, setSessionAction] = useState<
    { mode: "all" } | { mode: "selected"; session: WorkforceSession } | null
  >(null)
  const active = (session: WorkforceSession) =>
    session.revokedAt === null && new Date(session.expiresAt) > new Date()
  const sessionTitle = (session: WorkforceSession) =>
    session.current
      ? t("team.sessions.currentBrowser")
      : t("team.sessions.signedIn", {
          date: formatDate(session.issuedAt, locale),
        })

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("team.sessions.title")}</CardTitle>
          <CardDescription>{t("team.sessions.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t("team.sessions.empty")}
            </p>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-lg border md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("team.sessions.browser")}</TableHead>
                      <TableHead>
                        {t("team.sessions.lastUsedHeading")}
                      </TableHead>
                      <TableHead>{t("team.table.status")}</TableHead>
                      {canWrite && !self && (
                        <TableHead className="w-12 text-end">
                          <span className="sr-only">
                            {t("team.table.actions")}
                          </span>
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>
                          <span className="inline-flex items-center gap-2 font-medium">
                            <IconDeviceDesktop className="size-4 shrink-0" />
                            {sessionTitle(session)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {formatDate(session.lastUsedAt, locale)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {active(session)
                              ? t("team.sessions.active")
                              : t("team.sessions.ended")}
                          </Badge>
                        </TableCell>
                        {canWrite && !self && (
                          <TableCell className="text-end">
                            {active(session) && (
                              <Button
                                size="sm"
                                variant="outline"
                                aria-label={t("team.sessions.signOutFor", {
                                  session: sessionTitle(session),
                                })}
                                onClick={() =>
                                  setSessionAction({
                                    mode: "selected",
                                    session,
                                  })
                                }
                              >
                                {t("team.sessions.signOut")}
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div
                role="list"
                aria-label={t("team.sessions.title")}
                className="grid gap-3 md:hidden"
              >
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    role="listitem"
                    className="rounded-lg border p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <IconDeviceDesktop className="mt-0.5 size-4 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium">{sessionTitle(session)}</p>
                          <p className="text-muted-foreground mt-1 text-sm">
                            {t("team.sessions.lastUsed", {
                              date: formatDate(session.lastUsedAt, locale),
                            })}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline">
                        {active(session)
                          ? t("team.sessions.active")
                          : t("team.sessions.ended")}
                      </Badge>
                    </div>
                    {canWrite && !self && active(session) && (
                      <Button
                        className="mt-4 w-full"
                        variant="outline"
                        aria-label={t("team.sessions.signOutFor", {
                          session: sessionTitle(session),
                        })}
                        onClick={() =>
                          setSessionAction({ mode: "selected", session })
                        }
                      >
                        {t("team.sessions.signOut")}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          {canWrite && !self && sessions.some(active) && (
            <Button
              className="mt-4"
              variant="outline"
              aria-label={t("team.sessions.signOutAllFor", {
                name: member.displayName,
              })}
              onClick={() => setSessionAction({ mode: "all" })}
            >
              <IconLogout data-icon="inline-start" />
              {t("team.sessions.signOutAll")}
            </Button>
          )}
          {self && (
            <p className="text-muted-foreground mt-3 text-sm">
              {t("team.sessions.selfHint")}
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={sessionAction !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setSessionAction(null)
        }}
      >
        {sessionAction !== null && (
          <AlertDialogContent
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault()
            }}
          >
            <AlertDialogHeader>
              <AlertDialogMedia>
                <IconLogout />
              </AlertDialogMedia>
              <AlertDialogTitle>
                {sessionAction.mode === "all"
                  ? t("team.sessions.confirmAllTitle")
                  : t("team.sessions.confirmOneTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("team.sessions.confirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>
                {t("team.sessions.keepSignedIn")}
              </AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void mutate(async () => {
                    await api.revokeMemberSessions({
                      membershipId: member.membershipId,
                      ...(sessionAction.mode === "selected"
                        ? { sessionId: sessionAction.session.id }
                        : {}),
                    })
                    setSessionAction(null)
                  })
                }
              >
                {busy && <Spinner data-icon="inline-start" />}
                {t("team.sessions.confirmSignOut")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </>
  )
}

export function MemberLifecycleControls({
  api,
  member,
  canWrite,
  self,
  busy,
  mutate,
}: {
  api: ControlTeamApi
  member: WorkforceMemberDetail
  canWrite: boolean
  self: boolean
  busy: boolean
  mutate: MutationRunner
}) {
  const { t } = useTranslation()
  const [action, setAction] = useState<"suspend" | "reactivate" | "end" | null>(
    null,
  )
  const [reason, setReason] = useState("")
  const availableAction =
    member.state === "active"
      ? "suspend"
      : member.state === "suspended"
        ? "reactivate"
        : null

  if (self)
    return (
      <Alert>
        <AlertTitle>{t("team.membership.selfTitle")}</AlertTitle>
        <AlertDescription>
          {t("team.membership.selfDescription")}
        </AlertDescription>
      </Alert>
    )

  if (!canWrite || member.state === "ended") return null

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("team.membership.title")}</CardTitle>
          <CardDescription>{t("team.membership.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {availableAction !== null && (
              <Button
                variant="outline"
                aria-label={
                  availableAction === "suspend"
                    ? t("team.membership.suspendFor", {
                        name: member.displayName,
                      })
                    : t("team.membership.reactivateFor", {
                        name: member.displayName,
                      })
                }
                onClick={() => setAction(availableAction)}
              >
                {availableAction === "suspend" ? (
                  <IconUserOff data-icon="inline-start" />
                ) : (
                  <IconUserCheck data-icon="inline-start" />
                )}
                {availableAction === "suspend"
                  ? t("team.membership.suspend")
                  : t("team.membership.reactivate")}
              </Button>
            )}
            <Button
              variant="destructive"
              aria-label={t("team.membership.endFor", {
                name: member.displayName,
              })}
              onClick={() => setAction("end")}
            >
              {t("team.membership.end")}
            </Button>
          </div>
        </CardContent>
      </Card>
      <AlertDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setAction(null)
            setReason("")
          }
        }}
      >
        {action !== null && (
          <AlertDialogContent
            onEscapeKeyDown={(event) => {
              if (busy) event.preventDefault()
            }}
          >
            <AlertDialogHeader>
              <AlertDialogMedia>
                {action === "reactivate" ? <IconUserCheck /> : <IconUserOff />}
              </AlertDialogMedia>
              <AlertDialogTitle>
                {action === "suspend"
                  ? t("team.membership.suspendTitle")
                  : action === "reactivate"
                    ? t("team.membership.reactivateTitle")
                    : t("team.membership.endTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {action === "reactivate"
                  ? t("team.membership.reactivateDescription")
                  : t("team.membership.removeDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Field>
              <FieldLabel htmlFor="membership-reason">
                {t("team.membership.managerNote")}
              </FieldLabel>
              <Input
                id="membership-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={1_000}
                placeholder={t("team.membership.notePlaceholder")}
              />
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy} onClick={() => setReason("")}>
                {t("team.common.cancel")}
              </AlertDialogCancel>
              <Button
                variant={action === "end" ? "destructive" : "default"}
                disabled={busy}
                onClick={() =>
                  void mutate(async () => {
                    await api.transitionMember({
                      action,
                      membershipId: member.membershipId,
                      expectedVersion: member.version,
                      ...(reason.trim().length === 0
                        ? {}
                        : { reason: reason.trim() }),
                    })
                    setAction(null)
                    setReason("")
                  })
                }
              >
                {busy && <Spinner data-icon="inline-start" />}
                {t("team.common.confirm")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </>
  )
}
