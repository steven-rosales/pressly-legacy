import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ProcessorOrderControlItem } from "@pressly/contracts/processor"
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
  identity: {
    displayNumber: order.externalOrderId,
    customerDisplayName: "Ada Rivera",
  },
  admission,
  attention: null,
  currentPlacement: null,
  nextRequiredStage: null,
  routeAttempts: [],
  commands: {
    queuedMove: {
      status: "blocked",
      code: "PRODUCTION_ORDER_NOT_SCHEDULED",
      targets: [],
    },
    routeException: {
      status: "blocked",
      code: "PRODUCTION_ORDER_NOT_SCHEDULED",
    },
  },
  resolutionAction: {
    status: "allowed",
    expectedVersion: order.version,
    requiresExplicitReview: false,
    reviewReasons: [],
  },
  canonical: {
    canonicalOrderId: "00000000-0000-4000-8000-000000000701",
    canonicalFulfillmentId: "00000000-0000-4000-8000-000000000702",
    versions: {
      order: 2,
      fulfillment: 2,
    },
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
    source: {
      name: "cents",
    },
    audit: [],
  },
})

const renderIntakeItems = (
  items: readonly ProcessorOrderControlItem[],
  overrides: Parameters<typeof makeTestProductionPort>[0] = {}
) => {
  const onMutated = vi.fn(async () => undefined)
  const listOrderControl = vi.fn(async () => ({
    items: [...items],
    counts: { attention: 0, active: 0, all: items.length },
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
      timezone={testWorkspace.location.timezone}
      revision={testWorkspace.asOf}
      onMutated={onMutated}
    />
  )
  return { listOrderControl, onMutated }
}

const renderIntake = (
  item: ProcessorOrderControlItem,
  overrides: Parameters<typeof makeTestProductionPort>[0] = {}
) => renderIntakeItems([item], overrides)

const findDesktopQueue = () =>
  screen.findByRole("table", { name: "Intake orders" })

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
    const queue = await findDesktopQueue()
    await user.type(
      within(queue).getByRole("spinbutton", {
        name: new RegExp(`Bags.*${pending.externalOrderId}`, "i"),
      }),
      "4"
    )
    await user.click(
      within(queue).getByRole("button", {
        name: new RegExp(`Record intake.*${pending.externalOrderId}`, "i"),
      })
    )

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
    const queue = await findDesktopQueue()
    await user.click(
      within(queue).getByRole("switch", {
        name: new RegExp(`Priority.*${pending.externalOrderId}`, "i"),
      })
    )
    await user.type(
      within(queue).getByRole("spinbutton", {
        name: new RegExp(`Bags.*${pending.externalOrderId}`, "i"),
      }),
      "2"
    )
    await user.click(
      within(queue).getByRole("button", {
        name: new RegExp(`Record intake.*${pending.externalOrderId}`, "i"),
      })
    )

    await waitFor(() => expect(setPriority).toHaveBeenCalled())
    expect(recordIntake).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: pending.version + 1 })
    )
    expect(setPriority.mock.invocationCallOrder[0]).toBeLessThan(
      recordIntake.mock.invocationCallOrder[0]!
    )
  })

  it("confirms a Pressly release without presenting the external source as a controller", async () => {
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
      await screen.findByRole("tab", { name: /Awaiting release/ })
    )
    const releaseGuidance = screen.getByText(
      "Release controls floor readiness"
    ).parentElement
    expect(releaseGuidance).toHaveTextContent(
      "Due date shows urgency. Only released orders can enter Production."
    )
    const queue = await findDesktopQueue()
    expect(
      within(queue).getByText("Not yet released to Production")
    ).toBeVisible()
    await user.click(
      within(queue).getByRole("button", {
        name: new RegExp(`Release order ${forecastOrder.externalOrderId}`, "i"),
      })
    )
    const dialog = screen.getByRole("alertdialog", {
      name: new RegExp(forecastOrder.externalOrderId, "i"),
    })
    expect(dialog).toHaveAccessibleDescription(/Ada Rivera/i)
    expect(dialog).not.toHaveAccessibleDescription(/Cents/i)
    await user.click(
      within(dialog).getByRole("button", { name: "Release to Production" })
    )

    await waitFor(() =>
      expect(changeAdmission).toHaveBeenCalledWith(
        expect.objectContaining({
          target: "released",
          expectedVersion: forecastOrder.version,
        })
      )
    )
  })

  it("uses the shared page hierarchy, segmented tabs, and a named tab panel", async () => {
    const forecastOrder = {
      ...testOrderItems[0]!,
      status: "release_pending" as const,
      bagCount: null,
      bagCountProvenance: null,
      intakeVersion: null,
    }
    renderIntake(
      asIntakeItem(forecastOrder, {
        sourceState: "unreleased",
        override: null,
        effectiveState: "unreleased",
        allowedActions: [],
      })
    )

    expect(
      await screen.findByRole("heading", { name: "Order intake", level: 2 })
    ).toBeVisible()
    expect(screen.getByText(/Updated/i)).toBeVisible()
    const tabList = screen.getByRole("tablist", {
      name: "Intake workflow states",
    })
    expect(tabList).toHaveAttribute("data-variant", "default")
    await waitFor(() =>
      expect(
        within(tabList)
          .getAllByRole("tab")
          .map((tab) => tab.getAttribute("aria-label"))
      ).toEqual([
        "Needs intake, 0 orders",
        "Awaiting release, 1 orders",
        "Ready, 0 orders",
      ])
    )
    const needsIntakeTab = screen.getByRole("tab", {
      name: /Needs intake/,
    })
    expect(needsIntakeTab).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tabpanel", { name: /Needs intake/ })).toBeVisible()
  })

  it("keeps release stable while intake edits are recorded separately", async () => {
    const user = userEvent.setup()
    const forecastOrder = {
      ...testOrderItems[0]!,
      status: "release_pending" as const,
      bagCount: null,
      bagCountProvenance: null,
      intakeVersion: null,
    }
    renderIntake(
      asIntakeItem(forecastOrder, {
        sourceState: "unreleased",
        override: null,
        effectiveState: "unreleased",
        allowedActions: ["release"],
      })
    )

    await user.click(
      await screen.findByRole("tab", { name: /Awaiting release/ })
    )
    const queue = await findDesktopQueue()
    const releaseName = new RegExp(
      `Release order ${forecastOrder.externalOrderId}`,
      "i"
    )
    expect(
      within(queue).getByRole("button", { name: releaseName })
    ).toBeEnabled()
    await user.type(
      within(queue).getByRole("spinbutton", {
        name: new RegExp(`Bags.*${forecastOrder.externalOrderId}`, "i"),
      }),
      "3"
    )
    expect(
      within(queue).getByRole("button", { name: releaseName })
    ).toBeEnabled()
    expect(
      within(queue).getByRole("button", {
        name: new RegExp(
          `Record intake.*${forecastOrder.externalOrderId}`,
          "i"
        ),
      })
    ).toBeEnabled()
  })

  it("links bag-count guidance and validation to the input", async () => {
    const user = userEvent.setup()
    const pending = testOrderItems.find(
      (order) => order.status === "intake_pending"
    )!
    renderIntake(
      asIntakeItem(pending, {
        sourceState: "released",
        override: null,
        effectiveState: "released",
        allowedActions: [],
      })
    )

    await user.click(await screen.findByRole("tab", { name: /Needs intake/ }))
    const queue = await findDesktopQueue()
    const input = within(queue).getByRole("spinbutton", {
      name: new RegExp(`Bags.*${pending.externalOrderId}`, "i"),
    })
    const record = within(queue).getByRole("button", {
      name: new RegExp(`Record intake.*${pending.externalOrderId}`, "i"),
    })
    const helpId = input.getAttribute("aria-describedby")
    expect(helpId).not.toBeNull()
    expect(document.getElementById(helpId!)).toHaveTextContent(
      /Bag count required/i
    )
    expect(input).toHaveClass("h-11")
    expect(record).toBeDisabled()
    expect(record).toHaveAttribute("data-variant", "outline")
    expect(within(queue).queryByText(/^On$|^Off$/)).toBeNull()

    await user.type(input, "1.5")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(document.getElementById(helpId!)).toHaveTextContent(/whole number/i)
    expect(record).toBeDisabled()

    await user.clear(input)
    await user.type(input, "2")
    expect(input).toHaveAttribute("aria-invalid", "false")
    expect(record).toBeEnabled()
    expect(record).toHaveAttribute("data-variant", "default")
  })

  it("filters the queue by order or customer without changing tab totals", async () => {
    const user = userEvent.setup()
    const forecastOrders = testOrderItems.slice(0, 2).map((order, index) => ({
      ...order,
      id: `00000000-0000-4000-8000-0000000008${index + 1}`,
      externalOrderId: `FORECAST-${index + 1}`,
      status: "release_pending" as const,
      bagCount: null,
      bagCountProvenance: null,
      intakeVersion: null,
    }))
    renderIntakeItems(
      forecastOrders.map((order) =>
        asIntakeItem(order, {
          sourceState: "unreleased",
          override: null,
          effectiveState: "unreleased",
          allowedActions: [],
        })
      )
    )

    await user.click(
      await screen.findByRole("tab", { name: /Awaiting release/ })
    )
    const queue = await findDesktopQueue()
    expect(within(queue).getAllByRole("row")).toHaveLength(3)
    await user.type(
      screen.getByRole("searchbox", { name: "Search intake orders" }),
      "FORECAST-2"
    )
    expect(within(queue).getAllByRole("row")).toHaveLength(2)
    expect(within(queue).getByText(/FORECAST-2/)).toBeVisible()
    expect(
      screen.getByRole("tab", { name: /Awaiting release, 2/ })
    ).toBeVisible()
  })

  it("does not index external lifecycle terms in Intake search", async () => {
    const user = userEvent.setup()
    const forecastOrder = {
      ...testOrderItems[0]!,
      status: "release_pending" as const,
      bagCount: null,
      bagCountProvenance: null,
      intakeVersion: null,
    }
    renderIntake(
      asIntakeItem(forecastOrder, {
        sourceState: "unreleased",
        override: null,
        effectiveState: "unreleased",
        allowedActions: [],
      })
    )

    await user.click(
      await screen.findByRole("tab", { name: /Awaiting release/ })
    )
    const queue = await findDesktopQueue()
    expect(within(queue).getAllByRole("row")).toHaveLength(2)

    await user.type(
      screen.getByRole("searchbox", { name: "Search intake orders" }),
      "submitted"
    )

    expect(
      await screen.findByRole("heading", {
        name: "No orders match these filters",
      })
    ).toBeVisible()
    expect(screen.queryByRole("table", { name: "Intake orders" })).toBeNull()
  })

  it("uses a semantic table and provenance-only source identity", async () => {
    const user = userEvent.setup()
    const readyOrder = testOrderItems[0]!
    const item = asIntakeItem(readyOrder, {
      sourceState: "released",
      override: null,
      effectiveState: "released",
      allowedActions: [],
    })
    renderIntake({
      ...item,
      canonical: {
        ...item.canonical!,
        source: {
          name: "cents",
        },
      },
    })

    await user.click(await screen.findByRole("tab", { name: /Ready/ }))
    const queue = await findDesktopQueue()
    const orderHeader = within(queue).getByRole("columnheader", {
      name: /Order/,
    })
    expect(orderHeader).toBeVisible()
    expect(orderHeader).toHaveClass("w-[23%]")
    expect(
      within(queue).getByRole("columnheader", { name: /Origin/ })
    ).toBeVisible()
    expect(within(queue).getByText("Reported by Cents")).toBeVisible()
    expect(within(queue).getByText("Ready for Production")).toBeVisible()
    expect(within(queue).queryByText("Ready for pickup")).toBeNull()
    expect(within(queue).queryByText("READY_FOR_PICKUP")).toBeNull()
  })

  it("left-aligns every desktop next-action state on one column edge", async () => {
    const orders = testOrderItems.slice(0, 2).map((order, index) => ({
      ...order,
      id: `00000000-0000-4000-8000-0000000009${index + 1}`,
      externalOrderId: `ALIGN-${index + 1}`,
      status: "release_pending" as const,
      bagCount: null,
      bagCountProvenance: null,
      intakeVersion: null,
    }))
    const noActionOrder = {
      ...orders[0]!,
      id: "00000000-0000-4000-8000-000000000093",
      externalOrderId: "ALIGN-3",
    }
    renderIntakeItems([
      asIntakeItem(orders[0]!, {
        sourceState: "unreleased",
        override: null,
        effectiveState: "unreleased",
        allowedActions: ["release"],
      }),
      asIntakeItem(orders[1]!, {
        sourceState: "unreleased",
        override: "released",
        effectiveState: "released",
        allowedActions: ["return_to_source"],
      }),
      asIntakeItem(noActionOrder, {
        sourceState: "unreleased",
        override: null,
        effectiveState: "unreleased",
        allowedActions: [],
      }),
    ])

    await userEvent
      .setup()
      .click(await screen.findByRole("tab", { name: /Awaiting release/ }))
    const queue = await findDesktopQueue()
    const actionHeader = within(queue).getByRole("columnheader", {
      name: "Next action",
    })
    expect(queue.parentElement?.parentElement).toHaveClass("2xl:block")
    expect(actionHeader).toHaveClass("px-4")
    expect(actionHeader).toHaveClass("w-[18%]")
    expect(actionHeader).not.toHaveClass("text-right")

    const actionCells = within(queue)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell").at(-1)!)
    expect(actionCells).toHaveLength(3)
    for (const cell of actionCells) {
      expect(cell).toHaveClass("px-4")
      expect(cell).not.toHaveClass("text-right")
    }
    expect(
      within(actionCells[0]!).getByRole("button", {
        name: /Release order ALIGN-1/i,
      })
    ).toBeVisible()
    expect(
      within(actionCells[1]!).getByText("No action available")
    ).toBeVisible()
    expect(
      within(actionCells[2]!).getByText("No action available").closest("p")
    ).not.toHaveClass("justify-end")
  })

  it("shows source provenance without turning later reports into floor work", async () => {
    const user = userEvent.setup()
    const readyOrder = testOrderItems[0]!
    const aligned = asIntakeItem(readyOrder, {
      sourceState: "released",
      override: null,
      effectiveState: "released",
      allowedActions: [],
    })
    const observed: ProcessorOrderControlItem = {
      ...aligned,
      attention: null,
      canonical: {
        ...aligned.canonical!,
        commercialState: "completed",
        source: {
          name: "cents",
        },
      },
    }
    renderIntake(observed)

    await user.click(await screen.findByRole("tab", { name: /Ready/ }))
    const queue = await findDesktopQueue()
    expect(within(queue).getByText("Reported by Cents")).toBeVisible()
    expect(within(queue).queryByText("Completed")).toBeNull()
    expect(within(queue).getByText("Ready for Production")).toBeVisible()
  })

  it("renders admission actions only when the server allows them", async () => {
    const forecastOrders = testOrderItems.slice(0, 2).map((order, index) => ({
      ...order,
      id: `00000000-0000-4000-8000-0000000009${index + 1}`,
      externalOrderId: `ADMISSION-${index + 1}`,
      status: "release_pending" as const,
      bagCount: null,
      bagCountProvenance: null,
      intakeVersion: null,
    }))
    renderIntakeItems([
      asIntakeItem(forecastOrders[0]!, {
        sourceState: "unreleased",
        override: null,
        effectiveState: "unreleased",
        allowedActions: ["release"],
      }),
      asIntakeItem(forecastOrders[1]!, {
        sourceState: "unreleased",
        override: null,
        effectiveState: "unreleased",
        allowedActions: [],
      }),
    ])

    await userEvent
      .setup()
      .click(await screen.findByRole("tab", { name: /Awaiting release/ }))
    const queue = await findDesktopQueue()
    expect(
      within(queue).getAllByRole("button", {
        name: /Release order .* to Production/i,
      })
    ).toHaveLength(1)
    expect(within(queue).getByText("No action available")).toBeVisible()
  })
})
