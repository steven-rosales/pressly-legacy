import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  ProcessorAuthenticatedSession,
  ProductionLocation,
  ProductionOrderListItem,
  ProductionOrderSummary,
  ProductionWorkspace,
} from "@pressly/contracts"
import { RequestFailure } from "@/ports/request.error"
import type { ProcessorRuntime } from "./app.composition"

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

const messageFor = (cause: unknown): string =>
  cause instanceof RequestFailure
    ? cause.message
    : "The processor could not load current production data."

const roundUp = (date: Date, intervalMinutes: number): Date => {
  const interval = intervalMinutes * 60_000
  return new Date(Math.ceil(date.getTime() / interval) * interval)
}

export const derivePlanningDefaults = (input: {
  now: Date
  workspace: ProductionWorkspace
}) => {
  const startsAt =
    input.workspace.currentShift?.startsAt ??
    roundUp(input.now, 15).toISOString()
  const endsAt =
    input.workspace.currentShift?.endsAt ??
    new Date(Date.parse(startsAt) + 6 * 60 * 60_000).toISOString()
  const horizonBase = Math.max(
    Date.parse(endsAt),
    input.now.getTime() + 48 * 60 * 60_000
  )

  return {
    pulseMinutes: input.workspace.currentSchedulerConfig?.pulseMinutes ?? 0,
    foldLbsPerFolderMinute:
      input.workspace.currentSchedulerConfig?.foldLbsPerFolderMinute ?? 0,
    effectiveFolderCount:
      input.workspace.currentShift?.effectiveFolderCount ?? 1,
    startsAt,
    endsAt,
    timezone: input.workspace.location.timezone,
    horizonEnd: new Date(horizonBase).toISOString(),
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

const loadAllOrders = async (
  runtime: ProcessorRuntime,
  locationId: string
): Promise<readonly ProductionOrderListItem[]> => {
  const orders: ProductionOrderListItem[] = []
  let cursor: string | undefined

  for (let page = 0; page < 100; page += 1) {
    const response = await runtime.production.listOrders({
      locationId,
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    })
    orders.push(...response.items)
    if (response.nextCursor === null) return orders
    cursor = response.nextCursor
  }

  throw new Error("Production order pagination did not converge.")
}

export function useProcessorAppModel(runtime: ProcessorRuntime) {
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
  const selectedLocationIdRef = useRef<string | null>(null)
  const workspaceRequestGenerationRef = useRef(0)

  const resetSession = useCallback((message?: string) => {
    workspaceRequestGenerationRef.current += 1
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
  }, [])

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
        resetSession("Your session expired. Sign in again to continue.")
      ),
    [resetSession, runtime]
  )

  useEffect(() => {
    const onlineListener = () => setOnline(true)
    const offlineListener = () => setOnline(false)
    window.addEventListener("online", onlineListener)
    window.addEventListener("offline", offlineListener)
    return () => {
      window.removeEventListener("online", onlineListener)
      window.removeEventListener("offline", offlineListener)
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
            : messageFor(cause)
        )
      })
    return () => {
      active = false
    }
  }, [acceptSession, resetSession, runtime])

  useEffect(() => {
    if (session === null) return
    const delay = Math.max(0, Date.parse(session.expiresAt) - Date.now())
    const timeout = window.setTimeout(
      () => resetSession("Your session expired. Sign in again to continue."),
      Math.min(delay, 2_147_483_647)
    )
    return () => window.clearTimeout(timeout)
  }, [resetSession, session])

  const refreshLocations = useCallback(async () => {
    setLocationsLoading(true)
    setWorkspaceError(null)
    try {
      const response = await runtime.production.listLocations()
      const allowed = response.items.filter((location) => location.isActive)
      setLocations(allowed)
      if (allowed.length === 0) {
        workspaceRequestGenerationRef.current += 1
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
          workspaceRequestGenerationRef.current += 1
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
        workspaceRequestGenerationRef.current += 1
        selectedLocationIdRef.current = selectedLocationId
        setWorkspace(null)
        setOrders([])
        setWorkspaceLoading(false)
      }
      setSelectedLocationId(selectedLocationId)
    } catch (cause) {
      setWorkspaceError(messageFor(cause))
    } finally {
      setLocationsLoading(false)
    }
  }, [runtime])

  useEffect(() => {
    if (authStatus !== "authenticated") return
    const timeout = window.setTimeout(() => void refreshLocations(), 0)
    return () => window.clearTimeout(timeout)
  }, [authStatus, refreshLocations])

  const refreshWorkspace = useCallback(async () => {
    const locationId = selectedLocationIdRef.current
    if (locationId === null) return
    const requestGeneration = ++workspaceRequestGenerationRef.current
    setWorkspaceLoading(true)
    setWorkspaceError(null)
    try {
      const [nextWorkspace, nextOrders] = await Promise.all([
        runtime.production.loadWorkspace(locationId),
        loadAllOrders(runtime, locationId),
      ])
      if (workspaceRequestGenerationRef.current !== requestGeneration) return
      setWorkspace(nextWorkspace)
      setOrders(nextOrders)
    } catch (cause) {
      if (workspaceRequestGenerationRef.current !== requestGeneration) return
      setWorkspaceError(messageFor(cause))
    } finally {
      if (workspaceRequestGenerationRef.current === requestGeneration)
        setWorkspaceLoading(false)
    }
  }, [runtime])

  useEffect(() => {
    if (authStatus !== "authenticated" || selectedLocationId === null) return
    const timeout = window.setTimeout(() => void refreshWorkspace(), 0)
    return () => {
      window.clearTimeout(timeout)
      workspaceRequestGenerationRef.current += 1
    }
  }, [authStatus, refreshWorkspace, selectedLocationId])

  const login = async (credentials: { email: string; password: string }) => {
    setAuthBusy(true)
    setAuthError(null)
    try {
      const outcome = await runtime.authentication.login(credentials)
      if (outcome.status === "mfa_required") setAuthStatus("mfa_required")
      else acceptSession(outcome)
    } catch (cause) {
      setAuthError(messageFor(cause))
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
      setAuthError(messageFor(cause))
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
      setAuthError(messageFor(cause))
    } finally {
      setAuthBusy(false)
    }
  }

  const selectLocation = (locationId: string) => {
    if (!locations.some((location) => location.id === locationId)) return
    if (selectedLocationIdRef.current === locationId) return
    workspaceRequestGenerationRef.current += 1
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
    login,
    completeMfa,
    restartLogin,
    logout,
    selectLocation,
    refreshLocations,
    refreshWorkspace,
  }
}

export type ProcessorAppModel = ReturnType<typeof useProcessorAppModel>
