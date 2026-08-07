import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import type { IdempotencyPort } from "@/ports/idempotency.port"
import type {
  IncomingOrderProposal,
  IncomingOrderView,
  OrderManagementPort,
  RejectIncomingOrderProposalRequest,
} from "@/ports/order-management.port"
import { isRequestFailure, type RequestFailure } from "@/ports/request.error"

export type IncomingOrderAction = "accept" | "reject" | "restore"

export type IncomingOrderDecision =
  | Readonly<{ kind: "accept"; proposal: IncomingOrderProposal }>
  | Readonly<{ kind: "reject"; proposal: IncomingOrderProposal }>
  | Readonly<{ kind: "restore"; proposal: IncomingOrderProposal }>

export type IncomingOrderNotice = Readonly<{
  kind: "accepted" | "rejected" | "restored" | "changed"
  message: string
}>

export type IncomingOrdersModelInput = Readonly<{
  orderManagement: OrderManagementPort
  idempotency: IdempotencyPort
  locationId: string
  revision: string
  onMutated: () => Promise<void>
}>

const incomingOrderPageSize = 25

type IncomingOrderPage = Readonly<{
  cursor: string | null
  previous: readonly (string | null)[]
}>

const messageForFailure = (
  cause: unknown,
  operation: "load" | IncomingOrderAction,
  t: TFunction
): string => {
  if (!isRequestFailure(cause))
    return t(
      operation === "load"
        ? "orderControl.manageOrders.errors.load"
        : "orderControl.manageOrders.errors.mutation"
    )
  if (cause.requestKind === "forbidden")
    return t("orderControl.manageOrders.errors.forbidden")
  if (cause.requestKind === "unauthorized")
    return t("orderControl.manageOrders.errors.unauthorized")
  if (cause.requestKind === "unavailable")
    return t("orderControl.manageOrders.errors.unavailable")
  if (cause.requestKind === "invalid_response")
    return t("orderControl.manageOrders.errors.invalidResponse")
  return t(
    operation === "load"
      ? "orderControl.manageOrders.errors.load"
      : "orderControl.manageOrders.errors.mutation"
  )
}

const isAbort = (cause: unknown): boolean =>
  cause instanceof DOMException && cause.name === "AbortError"

const messageForConflict = (cause: RequestFailure, t: TFunction): string => {
  const code = cause.code.toUpperCase()
  if (code === "INCOMING_ORDER_PROPOSAL_VERSION_CONFLICT")
    return t("orderControl.manageOrders.conflicts.stale")
  if (code === "INCOMING_ORDER_PROPOSAL_TRANSITION_INVALID")
    return t("orderControl.manageOrders.conflicts.decided")
  if (code === "INCOMING_ORDER_PROPOSAL_IDENTITY_CONFLICT")
    return t("orderControl.manageOrders.conflicts.existing")
  return t("orderControl.manageOrders.conflicts.generic")
}

export function useIncomingOrdersModel(input: IncomingOrdersModelInput) {
  const { t } = useTranslation()
  const { orderManagement, idempotency, locationId, revision, onMutated } =
    input
  const [items, setItems] = useState<readonly IncomingOrderProposal[]>([])
  const [view, setView] = useState<IncomingOrderView>("needs_review")
  const [page, setPage] = useState<IncomingOrderPage>({
    cursor: null,
    previous: [],
  })
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<IncomingOrderNotice | null>(null)
  const [decision, setDecision] = useState<IncomingOrderDecision | null>(null)
  const [rejectReason, setRejectReason] = useState<
    RejectIncomingOrderProposalRequest["reasonCode"] | ""
  >("")
  const [rejectReasonError, setRejectReasonError] = useState<string | null>(
    null
  )
  const [decisionError, setDecisionError] = useState<string | null>(null)
  const [busy, setBusy] = useState<Readonly<{
    proposalId: string
    action: IncomingOrderAction
  }> | null>(null)
  const loadSequence = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const hasLoadedRef = useRef(false)

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    if (hasLoadedRef.current) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const result = await orderManagement.listIncomingOrders({
        locationId,
        view,
        limit: incomingOrderPageSize,
        cursor: page.cursor,
        signal: controller.signal,
      })
      if (sequence === loadSequence.current) {
        if (result.items.length === 0 && page.previous.length > 0) {
          setItems([])
          setNextCursor(null)
          setPage((current) => ({
            cursor: current.previous.at(-1) ?? null,
            previous: current.previous.slice(0, -1),
          }))
        } else {
          setItems(result.items)
          setNextCursor(result.nextCursor)
        }
      }
    } catch (cause) {
      if (!isAbort(cause) && sequence === loadSequence.current)
        setError(messageForFailure(cause, "load", t))
    } finally {
      if (sequence === loadSequence.current) {
        hasLoadedRef.current = true
        setHasLoaded(true)
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [locationId, orderManagement, page.cursor, page.previous.length, t, view])

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => {
      window.clearTimeout(timeout)
      abortRef.current?.abort()
    }
  }, [load, revision])

  const openDecision = useCallback((next: IncomingOrderDecision) => {
    setDecision(next)
    setRejectReason("")
    setRejectReasonError(null)
    setDecisionError(null)
  }, [])

  const closeDecision = useCallback(() => {
    if (busy !== null) return
    setDecision(null)
    setRejectReason("")
    setRejectReasonError(null)
    setDecisionError(null)
  }, [busy])

  const changeRejectReason = useCallback(
    (reason: RejectIncomingOrderProposalRequest["reasonCode"] | "") => {
      setRejectReason(reason)
      setRejectReasonError(null)
    },
    []
  )

  const changeView = useCallback(
    (next: IncomingOrderView) => {
      if (next === view) return
      loadSequence.current += 1
      abortRef.current?.abort()
      hasLoadedRef.current = false
      setView(next)
      setItems([])
      setNextCursor(null)
      setPage({ cursor: null, previous: [] })
      setHasLoaded(false)
      setLoading(true)
      setNotice(null)
      setError(null)
    },
    [view]
  )

  const nextPage = useCallback(() => {
    if (nextCursor === null || loading || refreshing) return
    setPage((current) => ({
      cursor: nextCursor,
      previous: [...current.previous, current.cursor],
    }))
  }, [loading, nextCursor, refreshing])

  const previousPage = useCallback(() => {
    if (page.previous.length === 0 || loading || refreshing) return
    setPage((current) => ({
      cursor: current.previous.at(-1) ?? null,
      previous: current.previous.slice(0, -1),
    }))
  }, [loading, page.previous.length, refreshing])

  const confirmDecision = useCallback(async () => {
    if (decision === null || busy !== null) return
    const selectedRejectReason = rejectReason === "" ? null : rejectReason
    if (decision.kind === "reject" && selectedRejectReason === null) {
      setRejectReasonError(t("orderControl.manageOrders.rejectReasonRequired"))
      return
    }

    const proposal = decision.proposal
    const action = decision.kind
    setBusy({ proposalId: proposal.id, action })
    setRejectReasonError(null)
    setDecisionError(null)
    try {
      const common = {
        expectedVersion: proposal.version,
        reasonNote: null,
      }
      if (action === "accept") {
        const request = {
          ...common,
          reasonCode: "incoming_order_accepted" as const,
          idempotencyKey: await idempotency.key({
            operation: "accept-incoming-order-proposal",
            payload: {
              locationId,
              proposalId: proposal.id,
              expectedVersion: proposal.version,
              reasonCode: "incoming_order_accepted",
            },
          }),
        }
        await orderManagement.acceptIncomingOrder({
          locationId,
          proposalId: proposal.id,
          request,
        })
      } else if (action === "reject") {
        if (selectedRejectReason === null) return
        const request = {
          ...common,
          reasonCode: selectedRejectReason,
          idempotencyKey: await idempotency.key({
            operation: "reject-incoming-order-proposal",
            payload: {
              locationId,
              proposalId: proposal.id,
              expectedVersion: proposal.version,
              reasonCode: selectedRejectReason,
            },
          }),
        } satisfies RejectIncomingOrderProposalRequest
        await orderManagement.rejectIncomingOrder({
          locationId,
          proposalId: proposal.id,
          request,
        })
      } else {
        const request = {
          ...common,
          reasonCode: "source_closure_overridden" as const,
          idempotencyKey: await idempotency.key({
            operation: "restore-incoming-order-proposal",
            payload: {
              locationId,
              proposalId: proposal.id,
              expectedVersion: proposal.version,
              reasonCode: "source_closure_overridden",
            },
          }),
        }
        await orderManagement.restoreIncomingOrder({
          locationId,
          proposalId: proposal.id,
          request,
        })
      }

      setItems((current) => current.filter((item) => item.id !== proposal.id))
      setDecision(null)
      setRejectReason("")
      setNotice({
        kind:
          action === "accept"
            ? "accepted"
            : action === "reject"
              ? "rejected"
              : "restored",
        message: t(
          action === "accept"
            ? "orderControl.manageOrders.accepted"
            : action === "reject"
              ? "orderControl.manageOrders.rejected"
              : "orderControl.manageOrders.restored",
          {
            order:
              proposal.displayNumber ??
              proposal.externalOrderId ??
              t("orderControl.manageOrders.unknownOrder"),
          }
        ),
      })
      setBusy(null)
      await Promise.allSettled([load(), onMutated()])
    } catch (cause) {
      setBusy(null)
      if (isRequestFailure(cause) && cause.requestKind === "conflict") {
        setDecision(null)
        setRejectReason("")
        setRejectReasonError(null)
        setDecisionError(null)
        setNotice({
          kind: "changed",
          message: messageForConflict(cause, t),
        })
        await load()
        return
      }
      setDecisionError(messageForFailure(cause, action, t))
    }
  }, [
    busy,
    decision,
    idempotency,
    locationId,
    load,
    onMutated,
    orderManagement,
    rejectReason,
    t,
  ])

  return {
    items,
    view,
    changeView,
    pageNumber: page.previous.length + 1,
    canGoPrevious: page.previous.length > 0,
    canGoNext: nextCursor !== null,
    previousPage,
    nextPage,
    loading,
    refreshing,
    hasLoaded,
    error,
    notice,
    dismissNotice: () => setNotice(null),
    refresh: load,
    decision,
    rejectReason,
    changeRejectReason,
    rejectReasonError,
    decisionError,
    busy,
    openDecision,
    closeDecision,
    confirmDecision,
  }
}
