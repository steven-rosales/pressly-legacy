import { useCallback, useEffect, useMemo } from "react"
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom"
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
import { HistoryWorkspaceContainer } from "@/features/history/history-workspace.view"
import { ProductionLocationSelect } from "@/features/location-selection/location-selection.view"
import { OrderControlWorkspaceContainer } from "@/features/order-control/order-control-workspace.view"
import { ProductionBoardWorkspace } from "@/features/production-board/production-board.view"
import { ScheduleHistoryView } from "@/features/scheduling/schedule-history.view"
import { SchedulingWorkspace } from "@/features/scheduling/scheduling.view"
import { SettingsView } from "@/features/settings/settings.view"
import { AppShell } from "./app-shell"
import type { ProcessorRuntime } from "./app.composition"
import {
  classifyScheduleContext,
  derivePlanningDefaults,
  useProcessorAppModel,
} from "./app.model"
import {
  readWorkspaceRoute,
  workspaceRouteForView,
  workspaceRoutePath,
  workspaceCopy,
  type WorkspaceRoute,
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
      <Empty className="max-w-lg border bg-background">
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
  onSelectLocation,
}: {
  model: ReturnType<typeof useProcessorAppModel>
  onSelectLocation: (locationId: string) => void
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-md bg-background">
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
              onValueChange={onSelectLocation}
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
      <Card className="w-full max-w-lg bg-background">
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

function ProcessorWorkspace({
  runtime,
  route,
}: {
  runtime: ProcessorRuntime
  route: WorkspaceRoute
}) {
  const routerNavigate = useNavigate()
  const model = useProcessorAppModel(runtime, route)
  const { theme, setTheme } = useTheme()

  const goToRoute = useCallback(
    (next: WorkspaceRoute, replace = false) => {
      routerNavigate(workspaceRoutePath(next), { replace })
    },
    [routerNavigate]
  )

  const selectLocation = useCallback(
    (locationId: string) => {
      if (locationId === model.selectedLocationId) return
      goToRoute(workspaceRouteForView(route.view), true)
      model.selectLocation(locationId)
    },
    [goToRoute, model, route.view]
  )

  const navigateToView = (
    next: WorkspaceView,
    identifiers: Partial<Pick<WorkspaceRoute, "shiftId" | "runId">> = {}
  ) => goToRoute(workspaceRouteForView(next, identifiers))

  const resolvedRunId =
    route.runId ??
    model.workspace?.board?.productionRun.id ??
    (model.workspace?.activeRuns.length === 1
      ? model.workspace.activeRuns[0]!.id
      : null)
  const scheduleContext = useMemo(
    () =>
      model.workspace === null
        ? null
        : classifyScheduleContext({
            workspace: model.workspace,
            requestedShiftId: route.shiftId,
            now: runtime.now(),
          }),
    [model.workspace, route.shiftId, runtime]
  )
  const planningDefaults = useMemo(
    () =>
      model.workspace === null || scheduleContext === null
        ? null
        : derivePlanningDefaults({
            now: runtime.now(),
            workspace: model.workspace,
            shift:
              scheduleContext.kind === "planning"
                ? scheduleContext.shift
                : null,
          }),
    [model.workspace, runtime, scheduleContext]
  )

  useEffect(() => {
    if (model.workspace === null) return
    const resolvedRoute =
      route.view === "schedule"
        ? workspaceRouteForView("schedule", {
            shiftId:
              route.shiftId ??
              (scheduleContext?.kind === "planning"
                ? scheduleContext.shift?.id
                : scheduleContext?.shift.id) ??
              null,
          })
        : route.view === "board"
          ? workspaceRouteForView("board", {
              runId:
                route.runId ??
                model.workspace.board?.productionRun.id ??
                (model.workspace.activeRuns.length === 1
                  ? model.workspace.activeRuns[0]!.id
                  : null),
            })
          : workspaceRouteForView(route.view)
    if (workspaceRoutePath(resolvedRoute) === workspaceRoutePath(route)) return
    const timeout = window.setTimeout(() => goToRoute(resolvedRoute, true), 0)
    return () => window.clearTimeout(timeout)
  }, [goToRoute, model.workspace, route, scheduleContext])

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

  if (model.selectedLocationId === null)
    return <ChooseLocation model={model} onSelectLocation={selectLocation} />

  const location = model.selectedLocation
  if (location === null)
    return (
      <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
        <Skeleton className="h-64 w-full max-w-lg" />
      </main>
    )

  return (
    <AppShell
      current={route.view}
      onNavigate={navigateToView}
      title={workspaceCopy[route.view][0]}
      description={workspaceCopy[route.view][1]}
      locationName={location.name}
      timezone={location.timezone}
      principalName={model.session.principal.displayName}
      logoutBusy={model.authBusy}
      onLogout={() => void model.logout()}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="hidden sm:inline-flex">
            {!model.online
              ? "Offline"
              : model.liveConnectionState === "open"
                ? "Live"
                : model.liveConnectionState === "reconnecting"
                  ? "Reconnecting"
                  : "Connecting"}
          </Badge>
          {model.locations.length > 1 && (
            <ProductionLocationSelect
              locations={model.locations}
              value={location.id}
              disabled={model.locationsLoading || model.workspaceLoading}
              triggerId="production-location-switcher"
              onValueChange={selectLocation}
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
            {(route.view === "schedule" || route.view === "board") &&
              model.intakeOrders.length > 0 && (
                <IntakeWorkspace
                  production={runtime.production}
                  idempotency={runtime.idempotency}
                  locationId={location.id}
                  orders={model.intakeOrders}
                  onRecorded={model.refreshWorkspace}
                />
              )}
            {route.view === "home" && (
              <OrderControlWorkspaceContainer
                production={runtime.production}
                idempotency={runtime.idempotency}
                locationId={location.id}
                timezone={location.timezone}
                board={model.workspace.board}
                revision={model.workspace.asOf}
                onMutated={model.refreshWorkspace}
              />
            )}
            {route.view === "schedule" &&
              scheduleContext?.kind === "history" && (
                <ScheduleHistoryView
                  shift={scheduleContext.shift}
                  productionRun={scheduleContext.productionRun}
                  reason={scheduleContext.reason}
                  timezone={location.timezone}
                  onPlanNewShift={() => navigateToView("schedule")}
                  onOpenProduction={
                    scheduleContext.productionRun === null
                      ? null
                      : () =>
                          navigateToView("board", {
                            runId: scheduleContext.productionRun!.id,
                          })
                  }
                />
              )}
            {route.view === "schedule" &&
              scheduleContext?.kind === "planning" && (
                <SchedulingWorkspace
                  key={`${location.id}:${scheduleContext.shift?.id ?? "new"}:${scheduleContext.proposal?.scheduleRunId ?? "none"}:${scheduleContext.proposal?.status ?? "none"}`}
                  production={runtime.production}
                  idempotency={runtime.idempotency}
                  locationId={location.id}
                  orders={model.schedulingOrders}
                  defaults={planningDefaults}
                  currentConfig={model.workspace.currentSchedulerConfig}
                  currentShift={scheduleContext.shift}
                  initialProposal={scheduleContext.proposal ?? undefined}
                  canManage={model.session.principal.roles.some(
                    (role) => role === "owner" || role === "admin"
                  )}
                  onOpenConfiguration={() => navigateToView("settings")}
                  onScheduleChanged={async (productionShiftId) => {
                    goToRoute(
                      workspaceRouteForView("schedule", {
                        shiftId: productionShiftId,
                      }),
                      true
                    )
                    await model.refreshWorkspace(productionShiftId)
                  }}
                  onStarted={async (result, productionShiftId) => {
                    await model.refreshWorkspace(productionShiftId)
                    goToRoute(
                      workspaceRouteForView("board", {
                        runId: result.productionRunId,
                      })
                    )
                  }}
                />
              )}
            {route.view === "board" && resolvedRunId !== null && (
              <ProductionBoardWorkspace
                key={`${location.id}:${resolvedRunId}`}
                production={runtime.production}
                idempotency={runtime.idempotency}
                locationId={location.id}
                productionRunId={resolvedRunId}
                timezone={location.timezone}
                machines={model.workspace.machines}
                initialBoard={
                  model.workspace.board?.productionRun.id === resolvedRunId
                    ? model.workspace.board
                    : undefined
                }
                refreshBoard={model.refreshBoard}
                online={model.online}
                updatesState={model.liveConnectionState}
                canManage={model.session.principal.roles.some(
                  (role) => role === "owner" || role === "admin"
                )}
              />
            )}
            {route.view === "board" && resolvedRunId === null && (
              <Empty className="min-h-80 border">
                <EmptyHeader>
                  <EmptyTitle>No active production run</EmptyTitle>
                  <EmptyDescription>
                    {model.workspace.pendingEligibleOrders.some(
                      (order) => order.placement.status === "ambiguous_run"
                    )
                      ? "Pending orders need an explicit run selection because multiple production runs are active."
                      : "Start an accepted schedule before opening the production floor."}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  {model.workspace.candidateShifts.map((candidate) => (
                    <Button
                      key={candidate.productionShiftId}
                      variant="outline"
                      onClick={() =>
                        navigateToView(
                          candidate.productionRunId === null
                            ? "schedule"
                            : "board",
                          {
                            shiftId: candidate.productionShiftId,
                            runId: candidate.productionRunId,
                          }
                        )
                      }
                    >
                      Open {candidate.reason.replaceAll("_", " ")}
                    </Button>
                  ))}
                  <Button onClick={() => navigateToView("schedule")}>
                    Open scheduling
                  </Button>
                </EmptyContent>
              </Empty>
            )}
            {route.view === "history" && (
              <HistoryWorkspaceContainer
                production={runtime.production}
                locationId={location.id}
                timezone={location.timezone}
                revision={model.workspace.asOf}
              />
            )}
            {route.view === "settings" && (
              <SettingsView
                theme={theme === "dark" ? "dark" : "light"}
                onThemeChange={setTheme}
                schedulerConfig={model.workspace.currentSchedulerConfig}
                shift={model.workspace.currentShift}
                production={runtime.production}
                idempotency={runtime.idempotency}
                locationId={location.id}
                canManage={model.session.principal.roles.some(
                  (role) => role === "owner" || role === "admin"
                )}
                onConfigurationPublished={async () => {
                  await model.refreshWorkspace(route.shiftId ?? undefined)
                }}
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

function ProcessorRoute({ runtime }: { runtime: ProcessorRuntime }) {
  const location = useLocation()
  const navigate = useNavigate()
  const route = readWorkspaceRoute(location.pathname)

  return route === null ? (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-4">
      <Empty className="max-w-lg border bg-background">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconAlertTriangle />
          </EmptyMedia>
          <EmptyTitle role="heading" aria-level={1}>
            Page not found
          </EmptyTitle>
          <EmptyDescription>
            This address is not part of the production workspace.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => navigate("/")}>Open Processor home</Button>
        </EmptyContent>
      </Empty>
    </main>
  ) : (
    <ProcessorWorkspace runtime={runtime} route={route} />
  )
}

export default function App({ runtime }: { runtime: ProcessorRuntime }) {
  return (
    <BrowserRouter>
      <ProcessorRoute runtime={runtime} />
    </BrowserRouter>
  )
}
