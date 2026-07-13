import { useMemo, useState } from "react"
import {
  IconAlertTriangle,
  IconMapPin,
  IconRefresh,
  IconWifiOff,
} from "@tabler/icons-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { AuthenticationView } from "@/features/authentication/authentication.view"
import { IntakeWorkspace } from "@/features/intake/intake.view"
import { ProductionLocationSelect } from "@/features/location-selection/location-selection.view"
import { ProductionBoardWorkspace } from "@/features/production-board/production-board.view"
import { SchedulingWorkspace } from "@/features/scheduling/scheduling.view"
import { SettingsView } from "@/features/settings/settings.view"
import { AppShell } from "./app-shell"
import type { ProcessorRuntime } from "./app.composition"
import { derivePlanningDefaults, useProcessorAppModel } from "./app.model"
import {
  readWorkspaceView,
  withWorkspaceView,
  workspaceCopy,
  type WorkspaceView,
} from "./app.navigation"
import { useTheme } from "./providers"

function WorkspaceLoading() {
  return (
    <div
      className="flex flex-col gap-4"
      aria-label="Loading production workspace"
    >
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}

function NoLocations({
  busy,
  onRefresh,
  onLogout,
}: {
  busy: boolean
  onRefresh: () => void
  onLogout: () => void
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Empty className="max-w-lg border bg-background shadow-xs">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconMapPin />
          </EmptyMedia>
          <EmptyTitle role="heading" aria-level={1}>
            No production location is available
          </EmptyTitle>
          <EmptyDescription>
            Check the active location configuration or your assignment, then
            retry.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button disabled={busy} onClick={onRefresh}>
            <IconRefresh data-icon="inline-start" />
            Refresh access
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onLogout}>
            Sign out
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  )
}

function ChooseLocation({
  model,
}: {
  model: ReturnType<typeof useProcessorAppModel>
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-md bg-background shadow-xs">
        <CardHeader>
          <div className="mb-3 grid size-10 place-items-center rounded-lg bg-foreground text-background">
            <IconMapPin />
          </div>
          <CardTitle role="heading" aria-level={1}>
            Choose a production location
          </CardTitle>
          <CardDescription>
            Select the floor you are working in. The processor will remember
            this choice on this browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="production-location-choice">
              Production location
            </FieldLabel>
            <ProductionLocationSelect
              locations={model.locations}
              value={model.selectedLocationId}
              disabled={model.locationsLoading}
              triggerId="production-location-choice"
              className="w-full"
              onValueChange={model.selectLocation}
            />
          </Field>
        </CardContent>
        <CardFooter>
          <Button
            variant="ghost"
            disabled={model.authBusy}
            onClick={() => void model.logout()}
          >
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}

function ForbiddenWorkspace({
  principalName,
  busy,
  error,
  onLogout,
}: {
  principalName: string
  busy: boolean
  error: string | null
  onLogout: () => void
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg bg-background shadow-xs">
        <CardHeader>
          <CardTitle>Processor access is not assigned</CardTitle>
          <CardDescription>
            {principalName} is authenticated, but this workspace is limited to
            owners, administrators, and production operators.
          </CardDescription>
        </CardHeader>
        {error !== null && (
          <CardContent>
            <Alert variant="destructive" role="alert">
              <AlertTitle>Sign out failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </CardContent>
        )}
        <CardFooter>
          <Button disabled={busy} onClick={onLogout}>
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}

export default function App({ runtime }: { runtime: ProcessorRuntime }) {
  const model = useProcessorAppModel(runtime)
  const [view, setView] = useState<WorkspaceView>(() =>
    readWorkspaceView(window.location.search)
  )
  const [acceptedShiftId, setAcceptedShiftId] = useState<string | null>(null)
  const { theme, setTheme } = useTheme()

  const navigate = (next: WorkspaceView) => {
    setView(next)
    window.history.replaceState(
      null,
      "",
      withWorkspaceView(window.location.href, next)
    )
  }

  const boardShiftId =
    acceptedShiftId ??
    model.workspace?.board?.productionShift.id ??
    model.workspace?.currentShift?.id ??
    null
  const planningDefaults = useMemo(
    () =>
      model.workspace === null
        ? null
        : derivePlanningDefaults({
            now: runtime.now(),
            workspace: model.workspace,
          }),
    [model.workspace, runtime]
  )

  if (model.authStatus === "restoring")
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
        <div
          className="flex w-full max-w-sm flex-col gap-3"
          aria-label="Restoring session"
        >
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </main>
    )

  if (model.authStatus === "signed_out" || model.authStatus === "mfa_required")
    return (
      <AuthenticationView
        mode={model.authStatus === "signed_out" ? "login" : "mfa"}
        busy={model.authBusy}
        error={model.authError}
        onLogin={model.login}
        onCompleteMfa={model.completeMfa}
        onRestart={model.restartLogin}
      />
    )

  if (model.authStatus === "forbidden" && model.session !== null)
    return (
      <ForbiddenWorkspace
        principalName={model.session.principal.displayName}
        busy={model.authBusy}
        error={model.authError}
        onLogout={() => void model.logout()}
      />
    )

  if (
    model.session === null ||
    (model.locations.length === 0 && model.locationsLoading)
  )
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
        <Skeleton className="h-64 w-full max-w-lg" />
      </main>
    )

  if (model.locations.length === 0)
    return (
      <NoLocations
        busy={model.locationsLoading || model.authBusy}
        onRefresh={() => void model.refreshLocations()}
        onLogout={() => void model.logout()}
      />
    )

  if (model.selectedLocationId === null) return <ChooseLocation model={model} />

  const location = model.selectedLocation
  if (location === null)
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
        <Skeleton className="h-64 w-full max-w-lg" />
      </main>
    )

  return (
    <AppShell
      current={view}
      onNavigate={navigate}
      title={workspaceCopy[view][0]}
      description={workspaceCopy[view][1]}
      locationName={location.name}
      timezone={location.timezone}
      principalName={model.session.principal.displayName}
      logoutBusy={model.authBusy}
      onLogout={() => void model.logout()}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden sm:inline-flex">
            Live
          </Badge>
          {model.locations.length > 1 && (
            <ProductionLocationSelect
              locations={model.locations}
              value={location.id}
              disabled={model.locationsLoading || model.workspaceLoading}
              triggerId="production-location-switcher"
              onValueChange={model.selectLocation}
            />
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {!model.online && (
          <Alert role="alert">
            <IconWifiOff />
            <AlertTitle>You are offline</AlertTitle>
            <AlertDescription>
              Current data remains visible, but server actions will not complete
              until the connection returns.
            </AlertDescription>
          </Alert>
        )}
        {model.workspaceError !== null && (
          <Alert variant="destructive" role="alert">
            <IconAlertTriangle />
            <AlertTitle>Workspace needs attention</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>{model.workspaceError}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void model.refreshWorkspace()}
              >
                <IconRefresh data-icon="inline-start" /> Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {model.workspaceLoading && model.workspace === null ? (
          <WorkspaceLoading />
        ) : model.workspace === null || planningDefaults === null ? (
          <Empty className="min-h-80 border">
            <EmptyHeader>
              <EmptyTitle>No production workspace is available</EmptyTitle>
              <EmptyDescription>
                Refresh after the location has been configured on the server.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => void model.refreshWorkspace()}>
                <IconRefresh data-icon="inline-start" /> Refresh
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            {view === "schedule" && (
              <>
                {model.intakeOrders.length > 0 && (
                  <IntakeWorkspace
                    production={runtime.production}
                    idempotency={runtime.idempotency}
                    locationId={location.id}
                    orders={model.intakeOrders}
                    onRecorded={model.refreshWorkspace}
                  />
                )}
                <SchedulingWorkspace
                  key={`${location.id}:${model.workspace.asOf}`}
                  production={runtime.production}
                  idempotency={runtime.idempotency}
                  locationId={location.id}
                  orders={model.schedulingOrders}
                  defaults={planningDefaults}
                  currentConfig={model.workspace.currentSchedulerConfig}
                  currentShift={model.workspace.currentShift}
                  initialProposal={
                    model.workspace.latestScheduleProposal ?? undefined
                  }
                  onAccepted={(productionShiftId) => {
                    setAcceptedShiftId(productionShiftId)
                    void model.refreshWorkspace()
                    navigate("board")
                  }}
                />
              </>
            )}
            {view === "board" &&
              boardShiftId !== null &&
              model.workspace.board !== null && (
                <ProductionBoardWorkspace
                  key={`${location.id}:${boardShiftId}`}
                  production={runtime.production}
                  idempotency={runtime.idempotency}
                  locationId={location.id}
                  productionShiftId={boardShiftId}
                  timezone={location.timezone}
                  machines={model.workspace.machines}
                  initialBoard={model.workspace.board}
                />
              )}
            {view === "board" && model.workspace.board === null && (
              <Empty className="min-h-80 border">
                <EmptyHeader>
                  <EmptyTitle>No active production run</EmptyTitle>
                  <EmptyDescription>
                    Accept a schedule before opening the production floor.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => navigate("schedule")}>
                    Open scheduling
                  </Button>
                </EmptyContent>
              </Empty>
            )}
            {view === "settings" && (
              <SettingsView
                theme={theme === "dark" ? "dark" : "light"}
                onThemeChange={setTheme}
                schedulerConfig={model.workspace.currentSchedulerConfig}
                shift={model.workspace.currentShift}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
