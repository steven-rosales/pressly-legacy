import { IconAlertTriangle, IconPackage } from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { useIntakeModel, type IntakeModelInput } from "./intake.model"

export function IntakeWorkspace(input: IntakeModelInput) {
  const { t } = useTranslation()
  const {
    bagCounts,
    priorities,
    busyOrderId,
    error,
    setBagCount,
    setPriority,
    record,
  } = useIntakeModel(input)

  return (
    <Card className="bg-background">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconPackage /> {t("intake.title")}
            </CardTitle>
            <CardDescription>{t("intake.description")}</CardDescription>
          </div>
          <Badge variant="secondary">
            {t("intake.pending", { count: input.orders.length })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error !== null && (
          <Alert variant="destructive" role="alert">
            <IconAlertTriangle />
            <AlertTitle>{t("intake.attention")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="divide-y rounded-lg border">
          {input.orders.map((order) => {
            const value = bagCounts[order.id] ?? ""
            const priority = priorities[order.id] ?? order.priority
            const invalid =
              value.length > 0 &&
              (!Number.isInteger(Number(value)) || Number(value) < 0)
            return (
              <div
                key={order.id}
                className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {t("intake.order", { orderId: order.externalOrderId })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("intake.orderDetail", {
                      weight: order.derivedWeightLbs,
                      due: order.dueBucket,
                    })}
                  </p>
                </div>
                <Field className="sm:w-32" data-invalid={invalid}>
                  <FieldLabel htmlFor={`bags-${order.id}`}>
                    {t("intake.bags")}
                  </FieldLabel>
                  <Input
                    id={`bags-${order.id}`}
                    className="h-11"
                    type="number"
                    min={0}
                    step={1}
                    value={value}
                    onChange={(event) =>
                      setBagCount(order.id, event.target.value)
                    }
                    aria-invalid={invalid}
                  />
                </Field>
                <Field orientation="horizontal" className="min-h-11 sm:w-28">
                  <Switch
                    id={`priority-${order.id}`}
                    checked={priority}
                    onCheckedChange={(checked) =>
                      setPriority(order.id, checked)
                    }
                  />
                  <FieldLabel htmlFor={`priority-${order.id}`}>
                    {t("intake.priority")}
                  </FieldLabel>
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={
                    busyOrderId !== null || value.length === 0 || invalid
                  }
                  onClick={() => void record(order)}
                >
                  {busyOrderId === order.id && (
                    <Spinner data-icon="inline-start" />
                  )}
                  {t("intake.record")}
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
