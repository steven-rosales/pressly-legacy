import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type {
  ProcessorAuthenticatedSession,
  ProductionLocation,
  ProductionOrderListItem,
  ProductionOrderSummary,
  ProductionRunSummary,
  ProductionShift,
  ProductionWorkspace,
  ScheduleProposal,
} from "@pressly/contracts"
import { RequestFailure } from "@/ports/request.error"
import { presentAuthenticationError } from "@/features/authentication/authentication.error.presenter"
import { englishAppMessages, spanishAppMessages } from "@/i18n"
import type { ProcessorRuntime } from "./app.composition"
import { presentAppError, type AppErrorMessages } from "./app.error.presenter"
import type { WorkspaceRoute } from "./app.navigation"
import { scheduleSessionExpiry } from "./session-expiry"
import { observeProductionConnectionState } from "./processor-observability"
import {
  makeProductionSyncCoordinator,
  type ProductionSyncTarget,
} from "./production-sync.coordinator"

export type ProcessorAuthStatus =
  | "restoring"
  | "signed_out"
  | "mfa_required"
  | "authenticated"
  | "forbidden"

const allowedRoles = new Set(["owner", "admin", "operator"])

export const resolveLocationSelection = (input: {
  locations: readonly ProductionLocation[]
  currentLocationId: string | null
  preferredLocationId: string | null
}): string | null => {
  const available = new Set(input.locations.map((location) => location.id))
  if (
    input.currentLocationId !== null &&
    available.has(input.currentLocationId)
  )
    return input.currentLocationId
  if (
    input.preferredLocationId !== null &&
    available.has(input.preferredLocationId)
  )
    return input.preferredLocationId
  return input.locations.length === 1 ? input.locations[0]!.id : null
}

const errorMessagesForLanguage = (
  language: string | undefined
): AppErrorMessages =>
  language?.startsWith("es") === true
    ? spanishAppMessages.errors
    : englishAppMessages.errors

const roundUp = (date: Date, intervalMinutes: number): Date => {
  const interval = intervalMinutes * 60_000
  return new Date(Math.ceil(date.getTime() / interval) * interval)
}

export const derivePlanningDefaults = (input: {
  now: Date
  workspace: ProductionWorkspace
  shift?: ProductionShift | null
}) => {
  const shift =
    input.shift === undefined ? input.workspace.currentShift : input.shift
  const startsAt = shift?.startsAt ?? roundUp(input.now, 15).toISOString()
  const endsAt =
    shift?.endsAt ??
    new Date(Date.parse(startsAt) + 6 * 60 * 60_000).toISOString()
  return {
    pulseMinutes: input.workspace.currentSchedulerConfig?.pulseMinutes ?? 0,
    foldLbsPerFolderMinute:
      input.workspace.currentSchedulerConfig?.foldLbsPerFolderMinute ?? 0,
    effectiveFolderCount: shift?.effectiveFolderCount ?? 1,
    startsAt,
    endsAt,
    timezone: input.workspace.location.timezone,
  }
}

export type ScheduleContext =
  | Readonly<{
      kind: "planning"
      shift: ProductionShift | null
      proposal: ScheduleProposal | null
    }>
  | Readonly<{
      kind: "history"
      shift: ProductionShift
      proposal: ScheduleProposal | null
      reason: "run_owned" | "closed" | "expired"
      productionRun: ProductionRunSummary | null
    }>

export const classifyScheduleContext = (input: {
  workspace: ProductionWorkspace
  requestedShiftId: string | null
  now: Date
}): ScheduleContext => {
  const shift = input.workspace.currentShift
  if (shift === null) return { kind: "planning", shift: null, proposal: null }

  const boardRun =
    input.workspace.board?.productionShift.id === shift.id
      ? input.workspace.board.productionRun
      : null
  const reason =
    boardRun !== null
      ? "run_owned"
      : shift.status === "closed"
        ? "closed"
        : Date.parse(shift.endsAt) <= input.now.getTime()
          ? "expired"
          : null

  if (reason === null)
    return {
      kind: "planning",
      shift,
      proposal: input.workspace.currentScheduleProposal,
    }

  if (
    input.requestedShiftId === null &&
    input.workspace.board?.productionRun.status !== "started"
  )
    return { kind: "planning", shift: null, proposal: null }

  return {
    kind: "history",
    shift,
    proposal: input.workspace.currentScheduleProposal,
    reason,
    productionRun: boardRun,
  }
}

const toSchedulingOrder = (
  order: ProductionOrderListItem
): ProductionOrderSummary | null =>
  order.status === "eligible" && order.bagCount !== null
    ? {
        id: order.id,
        externalOrderId: order.externalOrderId,
        dueAt: order.dueAt,
        dueBucket: order.dueBucket,
        priority: order.priority,
        derivedWeightLbs: order.derivedWeightLbs,
        bagCount: order.bagCount,
        version: order.version,
      }
    : null

const defaultWorkspaceRoute: WorkspaceRoute = {
  view: "schedule",
  shiftId: null,
  runId: null,
}

const syncKey = (locationId: string, route: WorkspaceRoute): string =>
  [locationId, route.view, route.shiftId ?? "", route.runId ?? ""].join(":")

const snapshotMatchesRoute = (
  workspace: ProductionWorkspace | null,
  locationId: string,
  route: WorkspaceRoute
): boolean =>
  workspace?.location.id === locationId &&
  (route.view !== "schedule" ||
    (route.shiftId === null
      ? workspace.currentShift === null
      : workspace.currentShift?.id === route.shiftId)) &&
  (route.view !== "board" ||
    route.runId === null ||
    workspace.board?.productionRun.id === route.runId)

export function useProcessorAppModel(
  runtime: ProcessorRuntime,
  requestedRoute: WorkspaceRoute = defaultWorkspaceRoute
) {
  const { t, i18n } = useTranslation()
  const errorMessages = errorMessagesForLanguage(i18n.resolvedLanguage)
  const [authStatus, setAuthStatus] = useState<ProcessorAuthStatus>("restoring")
  const [session, setSession] = useState<ProcessorAuthenticatedSession | null>(
    null
  )
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [locations, setLocations] = useState<readonly ProductionLocation[]>([])
  const [locationsLoading, setLocationsLoading] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null
  )
  const [workspace, setWorkspace] = useState<ProductionWorkspace | null>(null)
  const [orders, setOrders] = useState<readonly ProductionOrderListItem[]>([])
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [visible, setVisible] = useState(
    () => document.visibilityState === "visible"
  )
  const [liveConnection, setLiveConnection] = useState<{
    locationId: string | null
    state: "connecting" | "open" | "reconnecting"
  }>({ locationId: null, state: "connecting" })
  const acknowledgedLiveRevisionRef = useRef<number | null>(null)
  const selectedLocationIdRef = useRef<string | null>(null)
  const requestedRouteRef = useRef<WorkspaceRoute>(requestedRoute)
  const [sync] = useState(() =>
    makeProductionSyncCoordinator<ProductionWorkspace>({
      onStart: () => {
        setWorkspaceLoading(true)
        setWorkspaceError(null)
      },
      onSuccess: (nextWorkspace) => {
        setWorkspace(nextWorkspace)
        setOrders(nextWorkspace.orders)
        setWorkspaceLoading(false)
      },
      onError: (cause) => {
        setWorkspaceError(
          presentAppError(
            cause,
            "load_workspace",
            errorMessagesForLanguage(document.documentElement.lang)
          )
        )
        setWorkspaceLoading(false)
      },
    })
  )

  useEffect(() => {
    requestedRouteRef.current = requestedRoute
  }, [requestedRoute])

  useEffect(
    () => () => {
      sync.setAvailable(false)
      sync.setTarget(null)
    },
    [sync]
  )

  const resetSession = useCallback(
    (message?: string) => {
      sync.setAvailable(false)
      sync.setTarget(null)
      selectedLocationIdRef.current = null
      setSession(null)
      setAuthStatus("signed_out")
      setAuthBusy(false)
      setAuthError(message ?? null)
      setLocations([])
      setSelectedLocationId(null)
      setWorkspace(null)
      setOrders([])
      setWorkspaceLoading(false)
    },
    [sync]
  )

  const acceptSession = useCallback((next: ProcessorAuthenticatedSession) => {
    const hasProcessorRole = next.principal.roles.some((role) =>
      allowedRoles.has(role)
    )
    setSession(next)
    setAuthError(null)
    setAuthStatus(hasProcessorRole ? "authenticated" : "forbidden")
    setLocationsLoading(hasProcessorRole)
  }, [])

  useEffect(
    () =>
      runtime.subscribeToUnauthorized(() =>
        resetSession(t("authentication.sessionExpired"))
      ),
    [resetSession, runtime, t]
  )

  useEffect(() => {
    const onlineListener = () => {
      setLiveConnection({ locationId: null, state: "connecting" })
      setOnline(true)
    }
    const offlineListener = () => {
      setOnline(false)
      setWorkspaceLoading(false)
    }
    const visibilityListener = () => {
      const nextVisible = document.visibilityState === "visible"
      if (nextVisible)
        setLiveConnection({ locationId: null, state: "connecting" })
      setVisible(nextVisible)
      if (!nextVisible) setWorkspaceLoading(false)
    }
    window.addEventListener("online", onlineListener)
    window.addEventListener("offline", offlineListener)
    document.addEventListener("visibilitychange", visibilityListener)
    return () => {
      window.removeEventListener("online", onlineListener)
      window.removeEventListener("offline", offlineListener)
      document.removeEventListener("visibilitychange", visibilityListener)
    }
  }, [])

  useEffect(() => {
    let active = true
    void runtime.authentication
      .restore()
      .then((restored) => {
        if (active) acceptSession(restored)
      })
      .catch((cause: unknown) => {
        if (!active) return
        resetSession(
          cause instanceof RequestFailure && cause.kind === "unauthorized"
            ? undefined
            : presentAuthenticationError(cause, "restore", t)
        )
      })
    return () => {
      active = false
    }
  }, [acceptSession, resetSession, runtime, t])

  useEffect(() => {
    if (session === null) return
    return scheduleSessionExpiry(session.expiresAt, () =>
      resetSession(t("authentication.sessionExpired"))
    )
  }, [resetSession, session, t])

  const refreshLocations = useCallback(async () => {
    setLocationsLoading(true)
    setWorkspaceError(null)
    try {
      const response = await runtime.production.listLocations()
      const allowed = response.items.filter((location) => location.isActive)
      setLocations(allowed)
      if (allowed.length === 0) {
        sync.setTarget(null)
        selectedLocationIdRef.current = null
        setSelectedLocationId(null)
        setWorkspace(null)
        setOrders([])
        setWorkspaceLoading(false)
        return
      }

      const preferredLocationId = runtime.locationPreference.read()
      const selectedLocationId = resolveLocationSelection({
        locations: allowed,
        currentLocationId: selectedLocationIdRef.current,
        preferredLocationId,
      })
      if (selectedLocationId === null) {
        if (preferredLocationId !== null) runtime.locationPreference.clear()
        if (selectedLocationIdRef.current !== null) {
          sync.setTarget(null)
          selectedLocationIdRef.current = null
          setWorkspace(null)
          setOrders([])
          setWorkspaceLoading(false)
        }
        setSelectedLocationId(null)
        return
      }

      if (preferredLocationId !== selectedLocationId)
        runtime.locationPreference.save(selectedLocationId)
      if (selectedLocationIdRef.current !== selectedLocationId) {
        sync.setTarget(null)
        selectedLocationIdRef.current = selectedLocationId
        setWorkspace(null)
        setOrders([])
        setWorkspaceLoading(false)
      }
      setSelectedLocationId(selectedLocationId)
    } catch (cause) {
      setWorkspaceError(presentAppError(cause, "load_locations", errorMessages))
    } finally {
      setLocationsLoading(false)
    }
  }, [errorMessages, runtime, sync])

  useEffect(() => {
    if (authStatus !== "authenticated") return
    const timeout = window.setTimeout(() => void refreshLocations(), 0)
    return () => window.clearTimeout(timeout)
  }, [authStatus, refreshLocations])

  const makeSyncTarget = useCallback(
    (
      locationId: string,
      route: WorkspaceRoute
    ): ProductionSyncTarget<ProductionWorkspace> => ({
      key: syncKey(locationId, route),
      load: async (signal) => {
        const nextWorkspace = await runtime.production.loadWorkspace(
          locationId,
          route.shiftId ?? undefined,
          signal
        )
        if (
          route.view !== "board" ||
          route.runId === null ||
          nextWorkspace.board?.productionRun.id === route.runId
        )
          return nextWorkspace
        const board = await runtime.production.loadBoard(
          locationId,
          route.runId,
          signal
        )
        return { ...nextWorkspace, board }
      },
    }),
    [runtime]
  )

  useEffect(() => {
    if (authStatus !== "authenticated" || selectedLocationId === null) {
      sync.setTarget(null)
      return
    }
    const target = makeSyncTarget(selectedLocationId, requestedRoute)
    sync.setTarget(target, {
      reuseCurrent: snapshotMatchesRoute(
        workspace,
        selectedLocationId,
        requestedRoute
      ),
    })
  }, [
    authStatus,
    makeSyncTarget,
    requestedRoute,
    selectedLocationId,
    sync,
    workspace,
  ])

  useEffect(() => {
    const available =
      authStatus === "authenticated" &&
      selectedLocationId !== null &&
      online &&
      visible
    sync.setAvailable(available)
  }, [authStatus, online, selectedLocationId, sync, visible])

  useEffect(() => {
    acknowledgedLiveRevisionRef.current = null
    if (
      authStatus !== "authenticated" ||
      selectedLocationId === null ||
      !online ||
      !visible
    )
      return

    return runtime.productionChanges.subscribe({
      locationId: selectedLocationId,
      onStateChange: (state) => {
        setLiveConnection({ locationId: selectedLocationId, state })
        observeProductionConnectionState(state)
      },
      onInvalidate: ({ revision }) => {
        if (
          revision !== null &&
          acknowledgedLiveRevisionRef.current !== null &&
          revision <= acknowledgedLiveRevisionRef.current
        )
          return

        void sync.refresh({ afterMutation: true }).then((snapshot) => {
          if (snapshot === null || revision === null) return
          acknowledgedLiveRevisionRef.current = Math.max(
            acknowledgedLiveRevisionRef.current ?? revision,
            revision
          )
        })
      },
    })
  }, [
    authStatus,
    online,
    runtime.productionChanges,
    selectedLocationId,
    sync,
    visible,
  ])

  const refreshWorkspaceSnapshot = useCallback(
    async (shiftId?: string): Promise<ProductionWorkspace | null> => {
      const locationId = selectedLocationIdRef.current
      if (locationId === null) return null
      const route =
        shiftId === undefined
          ? requestedRouteRef.current
          : { ...requestedRouteRef.current, shiftId }
      requestedRouteRef.current = route
      sync.setTarget(makeSyncTarget(locationId, route), {
        reuseCurrent: snapshotMatchesRoute(workspace, locationId, route),
      })
      sync.setAvailable(authStatus === "authenticated" && online && visible)
      return sync.refresh({ afterMutation: true })
    },
    [authStatus, makeSyncTarget, online, sync, visible, workspace]
  )

  const refreshWorkspace = useCallback(
    async (shiftId?: string): Promise<void> => {
      await refreshWorkspaceSnapshot(shiftId)
    },
    [refreshWorkspaceSnapshot]
  )

  const refreshBoard = useCallback(async (): Promise<
    ProductionWorkspace["board"]
  > => {
    const nextWorkspace = await refreshWorkspaceSnapshot()
    const runId = requestedRouteRef.current.runId
    return nextWorkspace?.board?.productionRun.id === runId || runId === null
      ? (nextWorkspace?.board ?? null)
      : null
  }, [refreshWorkspaceSnapshot])

  const login = async (credentials: { email: string; password: string }) => {
    setAuthBusy(true)
    setAuthError(null)
    try {
      const outcome = await runtime.authentication.login(credentials)
      if (outcome.status === "mfa_required") setAuthStatus("mfa_required")
      else acceptSession(outcome)
    } catch (cause) {
      setAuthError(presentAuthenticationError(cause, "login", t))
    } finally {
      setAuthBusy(false)
    }
  }

  const completeMfa = async (input: {
    method: "totp" | "recovery"
    code: string
  }) => {
    setAuthBusy(true)
    setAuthError(null)
    try {
      acceptSession(await runtime.authentication.completeMfa(input))
    } catch (cause) {
      setAuthError(presentAuthenticationError(cause, "verify", t))
    } finally {
      setAuthBusy(false)
    }
  }

  const restartLogin = () => {
    setAuthStatus("signed_out")
    setAuthError(null)
  }

  const logout = async () => {
    setAuthBusy(true)
    setAuthError(null)
    try {
      await runtime.authentication.logout()
      resetSession()
    } catch (cause) {
      setAuthError(presentAuthenticationError(cause, "logout", t))
    } finally {
      setAuthBusy(false)
    }
  }

  const selectLocation = (locationId: string) => {
    if (!locations.some((location) => location.id === locationId)) return
    if (selectedLocationIdRef.current === locationId) return
    sync.setTarget(null)
    selectedLocationIdRef.current = locationId
    runtime.locationPreference.save(locationId)
    setSelectedLocationId(locationId)
    setWorkspace(null)
    setOrders([])
    setWorkspaceLoading(false)
    setWorkspaceError(null)
  }

  const schedulingOrders = useMemo(
    () => orders.flatMap((order) => toSchedulingOrder(order) ?? []),
    [orders]
  )
  const intakeOrders = useMemo(
    () => orders.filter((order) => order.status === "intake_pending"),
    [orders]
  )
  const selectedLocation =
    locations.find((location) => location.id === selectedLocationId) ?? null
  const liveConnectionState:
    | "inactive"
    | "connecting"
    | "open"
    | "reconnecting" =
    authStatus !== "authenticated" ||
    selectedLocationId === null ||
    !online ||
    !visible
      ? "inactive"
      : liveConnection.locationId === selectedLocationId
        ? liveConnection.state
        : "connecting"

  return {
    authStatus,
    session,
    authBusy,
    authError,
    locations,
    locationsLoading,
    selectedLocationId,
    selectedLocation,
    workspace,
    orders,
    schedulingOrders,
    intakeOrders,
    workspaceLoading,
    workspaceError,
    online,
    liveConnectionState,
    login,
    completeMfa,
    restartLogin,
    logout,
    selectLocation,
    refreshLocations,
    refreshWorkspace,
    refreshBoard,
  }
}

export type ProcessorAppModel = ReturnType<typeof useProcessorAppModel>
