import { screen, waitFor, within } from "@testing-library/react"
import { proveExperienceFeature } from "@pressly/testkit/experience-feature-proof"
import { processorOrderResolutionFeature } from "./feature"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ProcessorProductionOrderBacklogPreview } from "../../contracts/production-order-backlog.ts"
import type { ProductionOrderBacklogCursor } from "@pressly/production-system/contracts/read-models/production-order-backlog"
import { OrderResolutionReviewContainer } from "./order-resolution-review.container.view"
import { renderWithProcessorBrowserCapabilities as render } from "../../../test/support/browser-capabilities.fixture.tsx"
import type { IdempotencyPort } from "../../capabilities/idempotency.port"
import type { ProductionPort } from "../../capabilities/production.port"
import { requestFailure } from "../../capabilities/request.error"
import {
  makeTestProductionPort,
  testLocation,
} from "../../../test/fixtures/production.fixture"
import { reviewPreview, reviewResult } from "./order-resolution-review.fixture"

const fixedNow = new Date("2026-07-27T02:00:00.000Z")
const canonicalCutoff = "2026-06-27T03:59:59.999Z"
const previewCursor =
  "eyJ2IjoxLCJzb3VyY2UiOiJwcmV2aWV3In0" as ProductionOrderBacklogCursor
const commitCursor =
  "eyJ2IjoxLCJzb3VyY2UiOiJjb21taXQifQ" as ProductionOrderBacklogCursor

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const previewFor = (
  overrides: Partial<ProcessorProductionOrderBacklogPreview> = {}
): ProcessorProductionOrderBacklogPreview => ({
  ...reviewPreview,
  cutoff: canonicalCutoff,
  ...overrides,
})

const renderContainer = ({
  canManage = true,
  productionOverrides = {},
  idempotencyKey = vi.fn<IdempotencyPort["key"]>(
    async ({ operation }) => `${operation}-key`
  ),
  onMutated = vi.fn(async () => undefined),
}: Readonly<{
  canManage?: boolean
  productionOverrides?: Partial<ProductionPort>
  idempotencyKey?: IdempotencyPort["key"]
  onMutated?: () => Promise<void>
}> = {}) => {
  const onOpenHistory = vi.fn()
  const result = render(
    <OrderResolutionReviewContainer
      production={makeTestProductionPort(productionOverrides)}
      idempotency={{ key: idempotencyKey }}
      locationId={testLocation.id}
      timezone="America/New_York"
      canManage={canManage}
      now={() => fixedNow}
      onMutated={onMutated}
      onOpenHistory={onOpenHistory}
    />
  )

  return { ...result, idempotencyKey, onMutated, onOpenHistory }
}

const chooseReasonAndPreview = async (
  user: ReturnType<typeof userEvent.setup>
) => {
  await user.click(screen.getByRole("button", { name: "Review old orders" }))
  await user.click(
    screen.getByRole("combobox", {
      name: "Why are these orders being archived?",
    })
  )
  await user.click(
    screen.getByRole("option", { name: "Processor was not in use" })
  )
  await user.click(screen.getByRole("button", { name: "Review orders" }))
}

const confirmBulkArchive = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    await screen.findByRole("button", {
      name: "Archive 1 ready order",
    })
  )
  const confirmation = screen.getByRole("alertdialog", {
    name: "Archive 1 order from active work?",
  })
  await user.click(
    within(confirmation).getByRole("button", {
      name: "Archive from active work",
    })
  )
}

describe("connected order resolution review", () => {
  it("keeps the entry manager-only", () => {
    const hidden = renderContainer({ canManage: false })
    expect(
      screen.queryByRole("button", { name: "Review old orders" })
    ).toBeNull()
    expect(screen.queryByText("Archive from active work")).toBeNull()
    hidden.unmount()

    renderContainer()
    expect(
      screen.getByRole("button", { name: "Review old orders" })
    ).toBeVisible()
  })

  proveExperienceFeature({
    featureId: "processor.order-resolution",
    feature: processorOrderResolutionFeature,
    scenarios: [
      {
        name: "uses the location-day cutoff and commits the exact preview hash with one idempotency key",
        proves: ["presentation-state", "component-interaction"],
        run: async () => {
          const user = userEvent.setup()
          const previewOrderBacklog = vi.fn<
            ProductionPort["previewOrderBacklog"]
          >(async () => previewFor())
          const commitOrderBacklog = vi.fn<
            ProductionPort["commitOrderBacklog"]
          >(async () => reviewResult)
          const idempotencyKey = vi.fn<IdempotencyPort["key"]>(
            async () => "commit-backlog-idempotency-key"
          )
          const onMutated = vi.fn(async () => undefined)
          renderContainer({
            productionOverrides: {
              previewOrderBacklog,
              commitOrderBacklog,
            },
            idempotencyKey,
            onMutated,
          })

          await chooseReasonAndPreview(user)
          await waitFor(() =>
            expect(previewOrderBacklog).toHaveBeenCalledWith({
              locationId: testLocation.id,
              request: {
                filter: "all_due_before_cutoff",
                cutoff: canonicalCutoff,
                reason: "processor_not_in_use",
                cursor: null,
                maxOrders: 250,
              },
            })
          )

          await confirmBulkArchive(user)
          await waitFor(() =>
            expect(commitOrderBacklog).toHaveBeenCalledWith({
              locationId: testLocation.id,
              request: {
                filter: "all_due_before_cutoff",
                cutoff: canonicalCutoff,
                reason: "processor_not_in_use",
                cursor: null,
                maxOrders: 250,
                note: null,
                previewHash: reviewPreview.previewHash,
                idempotencyKey: "commit-backlog-idempotency-key",
              },
            })
          )
          expect(idempotencyKey).toHaveBeenCalledTimes(1)
          expect(idempotencyKey).toHaveBeenCalledWith({
            operation: "commit-production-order-backlog",
            payload: {
              locationId: testLocation.id,
              filter: "all_due_before_cutoff",
              cutoff: canonicalCutoff,
              reason: "processor_not_in_use",
              cursor: null,
              maxOrders: 250,
              note: null,
              previewHash: reviewPreview.previewHash,
            },
          })
          await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1))
          expect(
            screen.getByRole("button", { name: "Review another cutoff" })
          ).toBeVisible()
        },
      },
    ],
  })

  it("keeps a conflicting preview inert until the manager refreshes it", async () => {
    const user = userEvent.setup()
    const previewOrderBacklog = vi.fn<ProductionPort["previewOrderBacklog"]>(
      async () => previewFor()
    )
    const commitOrderBacklog = vi.fn<ProductionPort["commitOrderBacklog"]>(
      async () => {
        throw requestFailure({
          requestKind: "conflict",
          code: "production_order_backlog_preview_changed",
          message: "The exact candidate set changed.",
          responseStatus: 409,
        })
      }
    )
    const onMutated = vi.fn(async () => undefined)
    renderContainer({
      productionOverrides: {
        previewOrderBacklog,
        commitOrderBacklog,
      },
      onMutated,
    })

    await chooseReasonAndPreview(user)
    await confirmBulkArchive(user)

    expect(await screen.findByText("The order list changed")).toBeVisible()
    expect(
      screen.getByRole("button", { name: "Review Order C-1002" })
    ).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Refresh review" }))
    await waitFor(() => expect(previewOrderBacklog).toHaveBeenCalledTimes(2))
    expect(previewOrderBacklog).toHaveBeenLastCalledWith({
      locationId: testLocation.id,
      request: {
        filter: "all_due_before_cutoff",
        cutoff: canonicalCutoff,
        reason: "processor_not_in_use",
        cursor: null,
        maxOrders: 250,
      },
    })
    expect(onMutated).not.toHaveBeenCalled()
  })

  it("binds individual resolution to reviewed facts and refreshes the same page", async () => {
    const user = userEvent.setup()
    const previewOrderBacklog = vi.fn<ProductionPort["previewOrderBacklog"]>(
      async () => previewFor()
    )
    const changeOrderResolution = vi.fn<
      ProductionPort["changeOrderResolution"]
    >(async ({ productionOrderId }) => ({
      locationId: testLocation.id,
      orderId: productionOrderId,
      action: "resolve_without_production",
      resolutionState: "resolved_without_production",
      transitionedAt: "2026-07-27T02:05:00.000Z",
      version: 4,
      replayed: false,
    }))
    const idempotencyKey = vi.fn<IdempotencyPort["key"]>(
      async () => "individual-resolution-idempotency-key"
    )
    const onMutated = vi.fn(async () => undefined)
    renderContainer({
      productionOverrides: {
        previewOrderBacklog,
        changeOrderResolution,
      },
      idempotencyKey,
      onMutated,
    })

    await chooseReasonAndPreview(user)
    await user.click(
      await screen.findByRole("button", {
        name: "Review Order C-1002",
      })
    )
    const confirmation = screen.getByRole("alertdialog", {
      name: "Archive Order C-1002 from active work?",
    })
    await user.click(
      within(confirmation).getByLabelText(
        "I reviewed the order facts and confirmed that this order will not be produced in Pressly."
      )
    )
    await user.click(
      within(confirmation).getByRole("button", {
        name: "Archive from active work",
      })
    )

    await waitFor(() =>
      expect(changeOrderResolution).toHaveBeenCalledWith({
        locationId: testLocation.id,
        productionOrderId: reviewPreview.groups.reviewIndividually[0]!.orderId,
        request: {
          action: "resolve_without_production",
          reason: "processor_not_in_use",
          note: null,
          confirmReviewedFacts: true,
          expectedVersion: 3,
          idempotencyKey: "individual-resolution-idempotency-key",
        },
      })
    )
    expect(idempotencyKey).toHaveBeenCalledWith({
      operation: "resolve-production-order-without-production",
      payload: {
        locationId: testLocation.id,
        productionOrderId: reviewPreview.groups.reviewIndividually[0]!.orderId,
        expectedVersion: 3,
        command: {
          action: "resolve_without_production",
          reason: "processor_not_in_use",
          note: null,
          confirmReviewedFacts: true,
        },
      },
    })
    await waitFor(() => expect(previewOrderBacklog).toHaveBeenCalledTimes(2))
    expect(previewOrderBacklog).toHaveBeenLastCalledWith({
      locationId: testLocation.id,
      request: {
        filter: "all_due_before_cutoff",
        cutoff: canonicalCutoff,
        reason: "processor_not_in_use",
        cursor: null,
        maxOrders: 250,
      },
    })
    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1))
  })

  it("advances a zero-ready page with its preview cursor and unchanged scope", async () => {
    const user = userEvent.setup()
    const firstPage = previewFor({
      candidateCount: 3,
      hasMore: true,
      nextCursor: previewCursor,
      groups: {
        ...reviewPreview.groups,
        readyToArchive: [],
      },
    })
    const secondPage = previewFor({
      cursor: previewCursor,
      nextCursor: null,
      hasMore: false,
      previewHash: "b".repeat(64),
    })
    const previewOrderBacklog = vi
      .fn<ProductionPort["previewOrderBacklog"]>()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage)
    renderContainer({
      productionOverrides: { previewOrderBacklog },
    })

    await chooseReasonAndPreview(user)
    expect(
      await screen.findByRole("button", { name: "Review next page" })
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: /Archive \d+ ready/ })
    ).toBeNull()

    await user.click(screen.getByRole("button", { name: "Review next page" }))
    await waitFor(() => expect(previewOrderBacklog).toHaveBeenCalledTimes(2))
    expect(previewOrderBacklog).toHaveBeenLastCalledWith({
      locationId: testLocation.id,
      request: {
        filter: "all_due_before_cutoff",
        cutoff: canonicalCutoff,
        reason: "processor_not_in_use",
        cursor: previewCursor,
        maxOrders: 250,
      },
    })
  })

  it("continues with the authoritative cursor returned by the committed page", async () => {
    const user = userEvent.setup()
    const firstPage = previewFor({
      hasMore: true,
      nextCursor: previewCursor,
    })
    const secondPage = previewFor({
      cursor: commitCursor,
      nextCursor: null,
      hasMore: false,
      previewHash: "b".repeat(64),
    })
    const previewOrderBacklog = vi
      .fn<ProductionPort["previewOrderBacklog"]>()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage)
    const commitOrderBacklog = vi.fn<ProductionPort["commitOrderBacklog"]>(
      async () => ({
        ...reviewResult,
        nextCursor: commitCursor,
      })
    )
    renderContainer({
      productionOverrides: {
        previewOrderBacklog,
        commitOrderBacklog,
      },
    })

    await chooseReasonAndPreview(user)
    expect(
      await screen.findByText(
        "Only 250 orders are shown on this page. After you finish this page, choose Review next page to continue."
      )
    ).toBeVisible()
    await confirmBulkArchive(user)

    expect(await screen.findByText("This page is complete")).toBeVisible()
    const nextPage = screen.getByRole("button", {
      name: "Review next page",
    })
    await user.click(nextPage)
    await waitFor(() => expect(previewOrderBacklog).toHaveBeenCalledTimes(2))
    expect(previewOrderBacklog).toHaveBeenLastCalledWith({
      locationId: testLocation.id,
      request: {
        filter: "all_due_before_cutoff",
        cutoff: canonicalCutoff,
        reason: "processor_not_in_use",
        cursor: commitCursor,
        maxOrders: 250,
      },
    })
    expect(await screen.findByText("4 orders found")).toBeVisible()
  })
})
