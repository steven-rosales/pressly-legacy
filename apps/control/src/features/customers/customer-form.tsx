import { useState, type FormEvent } from "react"
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
} from "@/components/ui"
import type { ControlCustomer, CustomerProfile } from "./customer-model"

type CustomerFormValue = CustomerProfile & { active?: boolean }

const text = (value: string) => {
  const normalized = value.trim()
  return normalized.length === 0 ? null : normalized
}

const valueFrom = (customer: ControlCustomer | null): CustomerFormValue => ({
  firstName: customer?.firstName ?? null,
  lastName: customer?.lastName ?? null,
  businessName: customer?.businessName ?? null,
  phone: customer?.phone ?? null,
  email: customer?.email ?? null,
  ...(customer === null ? {} : { active: customer.active }),
})

export function CustomerForm({
  customer,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  customer: ControlCustomer | null
  busy: boolean
  error: string | null
  onSubmit: (value: CustomerFormValue) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(() => valueFrom(customer))
  const [validation, setValidation] = useState<string | null>(null)

  const update = <Key extends keyof CustomerFormValue>(
    key: Key,
    next: CustomerFormValue[Key],
  ) => setValue((current) => ({ ...current, [key]: next }))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const profile = {
      firstName: text(value.firstName ?? ""),
      lastName: text(value.lastName ?? ""),
      businessName: text(value.businessName ?? ""),
      phone: text(value.phone ?? ""),
      email: text(value.email ?? ""),
      ...(value.active === undefined ? {} : { active: value.active }),
    }
    if (
      profile.firstName === null &&
      profile.lastName === null &&
      profile.businessName === null &&
      profile.phone === null &&
      profile.email === null
    ) {
      setValidation(t("customers.form.validation.identityRequired"))
      return
    }
    setValidation(null)
    void onSubmit(profile)
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4">
        {error !== null && (
          <Alert variant="destructive">
            <AlertTitle>{t("customers.form.saveErrorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {validation !== null && <FieldError>{validation}</FieldError>}
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="customer-first-name">
                {t("customers.form.firstName")}
              </FieldLabel>
              <Input
                id="customer-first-name"
                autoComplete="given-name"
                value={value.firstName ?? ""}
                onChange={(event) => update("firstName", event.target.value)}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-last-name">
                {t("customers.form.lastName")}
              </FieldLabel>
              <Input
                id="customer-last-name"
                autoComplete="family-name"
                value={value.lastName ?? ""}
                onChange={(event) => update("lastName", event.target.value)}
                disabled={busy}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="customer-business-name">
              {t("customers.form.businessName")}
            </FieldLabel>
            <Input
              id="customer-business-name"
              autoComplete="organization"
              value={value.businessName ?? ""}
              onChange={(event) => update("businessName", event.target.value)}
              disabled={busy}
            />
            <FieldDescription>
              {t("customers.form.businessDescription")}
            </FieldDescription>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="customer-phone">
                {t("customers.form.phone")}
              </FieldLabel>
              <Input
                id="customer-phone"
                type="tel"
                autoComplete="tel"
                value={value.phone ?? ""}
                onChange={(event) => update("phone", event.target.value)}
                disabled={busy}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-email">
                {t("customers.form.email")}
              </FieldLabel>
              <Input
                id="customer-email"
                type="email"
                autoComplete="email"
                value={value.email ?? ""}
                onChange={(event) => update("email", event.target.value)}
                disabled={busy}
              />
            </Field>
          </div>
          {value.active !== undefined && (
            <Field>
              <FieldLabel htmlFor="customer-status">
                {t("customers.form.recordStatus")}
              </FieldLabel>
              <Select
                value={value.active ? "active" : "inactive"}
                onValueChange={(next) => update("active", next === "active")}
                disabled={busy}
              >
                <SelectTrigger id="customer-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="active">
                      {t("customers.status.active")}
                    </SelectItem>
                    <SelectItem value="inactive">
                      {t("customers.status.inactive")}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {t("customers.form.statusDescription")}
              </FieldDescription>
            </Field>
          )}
        </FieldGroup>
      </div>
      <div className="border-t p-4">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
          >
            {t("customers.actions.cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy
              ? t("customers.actions.saving")
              : customer === null
                ? t("customers.actions.create")
                : t("customers.actions.saveCorrection")}
          </Button>
        </div>
      </div>
    </form>
  )
}
