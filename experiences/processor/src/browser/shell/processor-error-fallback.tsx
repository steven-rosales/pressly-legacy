import { useTranslation } from "react-i18next"
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react"
import { Button } from "../components/ui/button"
import { useProcessorBrowserCapabilities } from "../browser-capabilities.tsx"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card"

export function ProcessorErrorFallback() {
  const browser = useProcessorBrowserCapabilities()
  const { t } = useTranslation()

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg bg-background" role="alert">
        <CardHeader>
          <div className="mb-3 grid size-10 place-items-center rounded-lg bg-destructive/10 text-destructive">
            <IconAlertTriangle aria-hidden="true" />
          </div>
          <CardTitle>{t("errorBoundary.title")}</CardTitle>
          <CardDescription>{t("errorBoundary.description")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={browser.navigation.reload}>
            <IconRefresh data-icon="inline-start" />
            {t("errorBoundary.reload")}
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
