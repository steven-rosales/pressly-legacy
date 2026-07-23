import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ProcessorOrderControlItem } from "@pressly/contracts"
import { IntakeWorkspace } from "@/features/intake/intake.view"
import {
  makeTestProductionPort,
  testIdempotency,
  testOrderItems,
  testWorkspace,
} from "../../fixtures/production.fixture"

const asIntakeItem = (
  order: ProcessorOrderControlItem["order"],
  admission: ProcessorOrderControlItem["admission"]
): ProcessorOrderControlItem => ({
  order,
  admission,
  attention: null,
  currentPlacement: null,
  nextRequiredStage: null,
  routeAttempts: [],
  canMoveQueued: false,
  canRouteException: false,
  canonical: {
    canonicalOrderId: "00000000-0000-4000-8000-000000000701",
    canonicalFulfillmentId: "00000000-0000-4000-8000-000000000702",
    displayNumber: order.externalOrderId,
    customer: {
      resolution: "resolved",
      userId: "00000000-0000-4000-8000-000000000703",
      firstName: "Ada",
      lastName: "Rivera",
      businessName: null,
      phone: "+12015550101",
    },
    commercialState: "open",
    admissionState: admission.sourceState,
    source: { name: "cents", status: "SUBMITTED" },
    comparison: "aligned",
  },
})

const renderIntake = (
  item: ProcessorOrderControlItem,
  overrides: Parameters<typeof makeTestProductionPort>[0] = {}
) => {
  const onMutated = vi.fn(async () => undefined)
  const listOrderControl = vi.fn(async () => ({
    items: [item],
    counts: { attention: 0, active: 0, all: 1 },
    nextCursor: null,
    asOf: testWorkspace.asOf,
  }))
  render(
    <IntakeWorkspace
      production={makeTestProductionPort({
        listOrderControl,
        ...overrides,
      })}
      idempotency={testIdempotency}
      locationId={testWorkspace.location.id}
      revision={testWorkspace.asOf}
      onMutated={onMutated}
    />
  )
  return { listOrderControl, onMutated }
}

describe("order intake", () => {
  it("submits physical bag count with the current order version and refreshes", async () => {
    const user = userEvent.setup()
    const pending = testOrderItems.find(
      (order) => order.status === "intake_pending"
    )!
    const item = asIntakeItem(pending, {
      sourceState: "released",
      override: null,
      effectiveState: "released",
      allowedActions: [],
    })
    const recordIntake = vi.fn(async () => ({
      locationId: testWorkspace.location.id,
      orderId: pending.id,
      bagCount: 4,
      bagCountProvenance: "operator_intake" as const,
      intakeVersion: 1,
      version: pending.version + 1,
      replayed: false,
    }))
    const { onMutated } = renderIntake(item, { recordIntake })

    await user.click(await screen.findByRole("tab", { name: /Needs intake/ }))
    await user.type(screen.getByLabelText("Bags"), "4")
    await user.click(screen.getByRole("button", { name: "Record intake" }))

    await waitFor(() =>
      expect(recordIntake).toHaveBeenCalledWith(
        expect.objectContaining({
          productionOrderId: pending.id,
          bagCount: 4,
          expectedVersion: pending.version,
        })
      )
    )
    expect(onMutated).toHaveBeenCalled()
  })

  it("captures priority before intake can trigger production readiness", async () => {
    const user = userEvent.setup()
    const pending = testOrderItems.find(
      (order) => order.status === "intake_pending"
    )!
    const item = asIntakeItem(pending, {
      sourceState: "released",
      override: null,
      effectiveState: "released",
      allowedActions: [],
    })
    const setPriority = vi.fn(async () => ({
      entityId: pending.id,
      version: pending.version + 1,
      replayed: false,
    }))
    const recordIntake = vi.fn(async () => ({
      locationId: testWorkspace.location.id,
      orderId: pending.id,
      bagCount: 2,
      bagCountProvenance: "operator_intake" as const,
      intakeVersion: 1,
      version: pending.version + 2,
      replayed: false,
    }))
    renderIntake(item, { setPriority, recordIntake })

    await user.click(await screen.findByRole("tab", { name: /Needs intake/ }))
    await user.click(screen.getByRole("switch", { name: "Priority" }))
    await user.type(screen.getByLabelText("Bags"), "2")
    await user.click(screen.getByRole("button", { name: "Record intake" }))

    await waitFor(() => expect(setPriority).toHaveBeenCalled())
    expect(recordIntake).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: pending.version + 1 })
    )
    expect(setPriority.mock.invocationCallOrder[0]).toBeLessThan(
      recordIntake.mock.invocationCallOrder[0]!
    )
  })

  it("confirms a Pressly-only release without mutating the Cents status", async () => {
    const user = userEvent.setup()
    const forecastOrder = {
      ...testOrderItems[1]!,
      status: "release_pending" as const,
      bagCount: null,
      bagCountProvenance: null,
      intakeVersion: null,
    }
    const item = asIntakeItem(forecastOrder, {
      sourceState: "unreleased",
      override: null,
      effectiveState: "unreleased",
      allowedActions: ["release"],
    })
    const changeAdmission = vi.fn(async () => ({
      locationId: testWorkspace.location.id,
      orderId: forecastOrder.id,
      admissionOverride: "released" as const,
      status: "intake_pending" as const,
      version: forecastOrder.version + 1,
      replayed: false,
    }))
    renderIntake(item, { changeAdmission })

    await user.click(
      await screen.findByRole("button", { name: "Release to Production" })
    )
    expect(
      screen.getByText(/does not change the order status in Cents/i)
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Release order" }))

    await waitFor(() =>
      expect(changeAdmission).toHaveBeenCalledWith(
        expect.objectContaining({
          target: "released",
          expectedVersion: forecastOrder.version,
        })
      )
    )
  })
})
