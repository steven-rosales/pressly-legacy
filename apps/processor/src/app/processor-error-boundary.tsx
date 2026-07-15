import type { ReactNode } from "react"
import * as Sentry from "@sentry/react"
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function ProcessorErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <Sentry.ErrorBoundary
      showDialog={false}
      beforeCapture={(scope) =>
        scope.setTag("error.boundary", "processor-root")
      }
      fallback={({ eventId }) => (
        <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
          <Card className="w-full max-w-lg bg-background" role="alert">
            <CardHeader>
              <div className="mb-3 grid size-10 place-items-center rounded-lg bg-destructive/10 text-destructive">
                <IconAlertTriangle aria-hidden="true" />
              </div>
              <CardTitle>Processor needs to reload</CardTitle>
              <CardDescription>
                Your last action may not have completed. Reload, then confirm
                the floor state before trying it again.
              </CardDescription>
            </CardHeader>
            {eventId.length > 0 && (
              <CardContent>
                <p className="text-xs text-muted-foreground">Error reference</p>
                <code className="mt-1 block rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs select-all">
                  {eventId}
                </code>
              </CardContent>
            )}
            <CardFooter>
              <Button onClick={() => window.location.reload()}>
                <IconRefresh data-icon="inline-start" />
                Reload Processor
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
