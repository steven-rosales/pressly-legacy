import { useCallback, useEffect, useState } from "react"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@/components/ui"
import { controlErrorMessage } from "@/i18n/control-error-message"
import type {
  ControlAuthenticatedSession,
  ControlWorkforceMemberDetailProjection as WorkforceMemberDetail,
  ControlWorkforceSession as WorkforceSession,
} from "@pressly/contracts/auth"
import type { ControlTeamApi } from "./team-api"
import {
  MemberAccessControls,
  MemberLifecycleControls,
  MemberSessionControls,
} from "./team-member-controls"

const formatDate = (value: string, locale: "en-US" | "es-US") =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))

const errorMessage = (error: unknown, fallback: string, t: TFunction) => {
  return controlErrorMessage(error, t, fallback, {
    conflict: t("team.errors.conflict"),
  })
}

export function MemberDetailSheet({
  api,
  memberId,
  currentIdentityId,
  businessId,
  locations,
  canWrite,
  onClose,
  onChanged,
}: {
  api: ControlTeamApi
  memberId: string
  currentIdentityId: string
  businessId: string
  locations: ControlAuthenticatedSession["access"]["locations"]
  canWrite: boolean
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith("es") ? "es-US" : "en-US"
  const [member, setMember] = useState<WorkforceMemberDetail | null>(null)
  const [sessions, setSessions] = useState<readonly WorkforceSession[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [loaded, loadedSessions] = await Promise.all([
        api.getMember(memberId),
        api.listMemberSessions(memberId),
      ])
      setError(null)
      setMember(loaded)
      setSessions(loadedSessions.sessions)
    } catch (loadError) {
      setError(errorMessage(loadError, t("team.errors.memberLoad"), t))
    }
  }, [api, memberId, t])

  useEffect(() => {
    let active = true
    Promise.all([api.getMember(memberId), api.listMemberSessions(memberId)])
      .then(([loaded, loadedSessions]) => {
        if (active) {
          setError(null)
          setMember(loaded)
          setSessions(loadedSessions.sessions)
        }
      })
      .catch((loadError: unknown) => {
        if (active)
          setError(errorMessage(loadError, t("team.errors.memberLoad"), t))
      })
    return () => {
      active = false
    }
  }, [api, memberId, t])

  const mutate = async (operation: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await operation()
      await Promise.all([load(), onChanged()])
    } catch (mutationError) {
      setError(errorMessage(mutationError, t("team.errors.accessChange"), t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="workspace">
        <SheetHeader>
          <SheetTitle>
            {member?.displayName ?? t("team.memberDetail.fallbackTitle")}
          </SheetTitle>
          <SheetDescription>
            {member === null
              ? t("team.memberDetail.loading")
              : t("team.memberDetail.joined", {
                  email: member.email,
                  date: formatDate(member.startedAt, locale),
                })}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {member === null && error === null ? (
            <div className="grid min-h-48 place-items-center">
              <Spinner />
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {error !== null && (
                <Alert variant="destructive">
                  <AlertTitle>{t("team.accessAttention")}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {member !== null && (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Card size="sm">
                      <CardHeader>
                        <CardDescription>
                          {t("team.memberDetail.status")}
                        </CardDescription>
                        <CardTitle>
                          {member.state === "active"
                            ? t("team.membershipStates.active")
                            : member.state === "suspended"
                              ? t("team.membershipStates.suspended")
                              : t("team.membershipStates.ended")}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card size="sm">
                      <CardHeader>
                        <CardDescription>
                          {t("team.memberDetail.mfa")}
                        </CardDescription>
                        <CardTitle>
                          {member.mfaEnabled
                            ? t("team.memberDetail.enabled")
                            : t("team.memberDetail.notSetUp")}
                        </CardTitle>
                      </CardHeader>
                    </Card>
                    <Card size="sm">
                      <CardHeader>
                        <CardDescription>
                          {t("team.memberDetail.activeSessions")}
                        </CardDescription>
                        <CardTitle>{member.activeSessionCount}</CardTitle>
                      </CardHeader>
                    </Card>
                  </div>

                  <MemberAccessControls
                    api={api}
                    member={member}
                    businessId={businessId}
                    locations={locations}
                    canWrite={canWrite}
                    self={member.identityId === currentIdentityId}
                    busy={busy}
                    mutate={mutate}
                  />
                  <MemberSessionControls
                    api={api}
                    member={member}
                    sessions={sessions}
                    canWrite={canWrite}
                    self={member.identityId === currentIdentityId}
                    busy={busy}
                    mutate={mutate}
                  />
                  <MemberLifecycleControls
                    api={api}
                    member={member}
                    canWrite={canWrite}
                    self={member.identityId === currentIdentityId}
                    busy={busy}
                    mutate={mutate}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
