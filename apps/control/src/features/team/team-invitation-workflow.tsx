import { useState, type FormEvent } from "react"
import { IconCopy, IconKey, IconShieldCheck } from "@tabler/icons-react"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@/components/ui"
import type {
  ControlAuthenticatedSession,
  WorkforceRole,
} from "@pressly/contracts/auth"

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

export function OneTimeInvitationSheet({
  link,
  onClose,
}: {
  link: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(link)
    setCopied(true)
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false)
          onClose()
        }
      }}
    >
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("team.oneTimeInvitation.title")}</SheetTitle>
          <SheetDescription>
            {t("team.oneTimeInvitation.description")}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 px-4">
          <Alert>
            <IconKey />
            <AlertTitle>
              {t("team.oneTimeInvitation.credentialTitle")}
            </AlertTitle>
            <AlertDescription>
              {t("team.oneTimeInvitation.credentialDescription")}
            </AlertDescription>
          </Alert>
          <Field className="mt-4">
            <FieldLabel htmlFor="one-time-invitation-link">
              {t("team.oneTimeInvitation.linkLabel")}
            </FieldLabel>
            <Input
              id="one-time-invitation-link"
              value={link}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
            />
          </Field>
        </div>
        <SheetFooter>
          <Button onClick={() => void copy()}>
            <IconCopy data-icon="inline-start" />
            {copied
              ? t("team.oneTimeInvitation.copied")
              : t("team.oneTimeInvitation.copy")}
          </Button>
          <Button variant="outline" onClick={onClose}>
            {t("team.oneTimeInvitation.saved")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export function InviteTeamMemberSheet({
  locations,
  busy,
  error,
  onClose,
  onIssue,
}: {
  locations: ControlAuthenticatedSession["access"]["locations"]
  busy: boolean
  error: string | null
  onClose: () => void
  onIssue: (input: {
    displayName: string
    email: string
    intendedRole: WorkforceRole
    intendedLocationId: string | null
  }) => Promise<void>
}) {
  const { t } = useTranslation()
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<WorkforceRole>("operator")
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "")

  const locationRequired = role === "operator"
  const selectedLocation =
    role === "owner" || locationId === "business"
      ? null
      : (locations.find(({ id }) => id === locationId) ?? null)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (locationRequired && selectedLocation === null) return
    void onIssue({
      displayName,
      email,
      intendedRole: role,
      intendedLocationId: selectedLocation?.id ?? null,
    })
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("team.invite.title")}</SheetTitle>
          <SheetDescription>{t("team.invite.description")}</SheetDescription>
        </SheetHeader>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <FieldGroup>
              {error !== null && (
                <Alert variant="destructive">
                  <AlertTitle>{t("team.invitationAttention")}</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="invite-display-name">
                  {t("team.invite.employeeName")}
                </FieldLabel>
                <Input
                  id="invite-display-name"
                  autoComplete="name"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-email">
                  {t("team.common.email")}
                </FieldLabel>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-role">
                  {t("team.accessLevel")}
                </FieldLabel>
                <Select
                  value={role}
                  onValueChange={(value) => {
                    const nextRole = value as WorkforceRole
                    setRole(nextRole)
                    setLocationId(
                      nextRole === "owner"
                        ? "business"
                        : nextRole === "operator"
                          ? (locations[0]?.id ?? "")
                          : "business",
                    )
                  }}
                >
                  <SelectTrigger id="invite-role" className="w-full">
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
              {role !== "owner" && (
                <Field
                  data-invalid={locationRequired && locationId.length === 0}
                >
                  <FieldLabel htmlFor="invite-location">
                    {role === "operator"
                      ? t("team.invite.workLocation")
                      : t("team.invite.locationScope")}
                  </FieldLabel>
                  <Select value={locationId} onValueChange={setLocationId}>
                    <SelectTrigger id="invite-location" className="w-full">
                      <SelectValue
                        placeholder={t("team.invite.chooseLocation")}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {role === "manager" && (
                          <SelectItem value="business">
                            {t("team.entireBusiness")}
                          </SelectItem>
                        )}
                        {locations.map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {locationRequired && locations.length === 0 && (
                    <FieldError>{t("team.invite.locationRequired")}</FieldError>
                  )}
                </Field>
              )}
              <Alert>
                <IconShieldCheck />
                <AlertTitle>{t("team.accessPreview.title")}</AlertTitle>
                <AlertDescription>
                  {accessPreview(t, role, selectedLocation?.name ?? null)}
                </AlertDescription>
              </Alert>
              <FieldDescription>
                {t("team.invite.managerBoundary")}
              </FieldDescription>
            </FieldGroup>
          </div>
          <SheetFooter className="border-t">
            <Button
              type="submit"
              disabled={
                busy ||
                displayName.trim().length === 0 ||
                email.trim().length === 0 ||
                (locationRequired && selectedLocation === null)
              }
            >
              {busy && <Spinner data-icon="inline-start" />}
              {t("team.invite.create")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              {t("team.common.cancel")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
