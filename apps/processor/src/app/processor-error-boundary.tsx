import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import * as Sentry from "@sentry/react"
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function ProcessorErrorBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Sentry.ErrorBoundary
      showDialog={false}
      beforeCapture={(scope) =>
        scope.setTag("error.boundary", "processor-root")
      }
      fallback={() => (
        <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
          <Card className="w-full max-w-lg bg-background" role="alert">
            <CardHeader>
              <div className="mb-3 grid size-10 place-items-center rounded-lg bg-destructive/10 text-destructive">
                <IconAlertTriangle aria-hidden="true" />
              </div>
              <CardTitle>{t("errorBoundary.title")}</CardTitle>
              <CardDescription>
                {t("errorBoundary.description")}
              </CardDescription>
            </CardHeader>
            <CardFooter>
              <Button onClick={() => window.location.reload()}>
                <IconRefresh data-icon="inline-start" />
                {t("errorBoundary.reload")}
              </Button>
            </CardFooter>
          </Card>
        </main>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}
