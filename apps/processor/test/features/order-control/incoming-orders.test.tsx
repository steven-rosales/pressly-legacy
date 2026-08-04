import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { IncomingOrdersWorkspace } from "@/features/order-control/incoming-orders.view"
import { requestFailure } from "@/ports/request.error"
import {
  makeTestOrderManagementPort,
  testIncomingOrderProposal,
  testSourceClosedOrderProposal,
} from "../../fixtures/order-management.fixture"
import {
  testIdempotency,
  testLocation,
} from "../../fixtures/production.fixture"

const renderIncoming = (
  overrides: Parameters<typeof makeTestOrderManagementPort>[0] = {}
) => {
  const onMutated = vi.fn(async () => undefined)
  const orderManagement = makeTestOrderManagementPort({
    listIncomingOrders: async () => ({
      items: [testIncomingOrderProposal],
      nextCursor: null,
    }),
    ...overrides,
  })
  render(
    <IncomingOrdersWorkspace
      orderManagement={orderManagement}
      idempotency={testIdempotency}
      locationId={testLocation.id}
      timezone={testLocation.timezone}
      revision="2026-08-01T17:30:00.000Z"
      onMutated={onMutated}
    />
  )
  return { orderManagement, onMutated }
}

describe("incoming orders workspace", () => {
  it("shows operator identity and provenance without exposing vendor lifecycle", async () => {
    renderIncoming()

    expect((await screen.findAllByText("Order 2481"))[0]).toBeVisible()
    expect(screen.getAllByText(/Santiago Jackson/)[0]).toBeVisible()
    expect(screen.getAllByText("Reported by Cents")[0]).toBeVisible()
    expect(screen.queryByText("PICKED_UP")).toBeNull()
    expect(
      screen.getAllByRole("button", {
        name: "Add order 2481 to Pressly",
      })[0]
    ).toBeEnabled()
    expect(
      screen.getAllByRole("button", { name: "Reject order 2481" })[0]
    ).toBeEnabled()
  })

  it("confirms acceptance and refreshes both incoming and canonical work", async () => {
    const user = userEvent.setup()
    const acceptIncomingOrder = vi.fn(async ({ proposalId }) => ({
      proposalId,
      state: "accepted" as const,
      version: 2 as const,
      orderId: "00000000-0000-4000-8000-000000000702",
      fulfillmentId: "00000000-0000-4000-8000-000000000703",
      replayed: false,
    }))
    const listIncomingOrders = vi
      .fn()
      .mockResolvedValueOnce({
        items: [testIncomingOrderProposal],
        nextCursor: null,
      })
      .mockResolvedValue({ items: [], nextCursor: null })
    const { onMutated } = renderIncoming({
      listIncomingOrders,
      acceptIncomingOrder,
    })

    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "Add order 2481 to Pressly",
        })
      )[0]!
    )
    const dialog = await screen.findByRole("alertdialog")
    expect(
      within(dialog).getByText(/will not enter Needs intake or Production/i)
    ).toBeVisible()
    await user.click(
      within(dialog).getByRole("button", { name: "Add to Pressly" })
    )

    await waitFor(() => expect(acceptIncomingOrder).toHaveBeenCalledTimes(1))
    expect(acceptIncomingOrder).toHaveBeenCalledWith({
      locationId: testLocation.id,
      proposalId: testIncomingOrderProposal.id,
      request: {
        expectedVersion: 1,
        idempotencyKey: expect.stringContaining(
          "accept-incoming-order-proposal"
        ),
        reasonCode: "incoming_order_accepted",
        reasonNote: null,
      },
    })
    await waitFor(() => expect(onMutated).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByText(/added to Pressly as unreleased work/i)
    ).toBeVisible()
  })

  it("separates source-closed candidates and restores one for review", async () => {
    const user = userEvent.setup()
    const listIncomingOrders = vi.fn(async ({ view }) => ({
      items: view === "source_closed" ? [testSourceClosedOrderProposal] : [],
      nextCursor: null,
    }))
    const restoreIncomingOrder = vi.fn(async ({ proposalId }) => ({
      proposalId,
      state: "restored_pending" as const,
      version: 3,
      replayed: false,
    }))
    renderIncoming({ listIncomingOrders, restoreIncomingOrder })

    expect(
      await screen.findByRole("heading", {
        name: "No submitted orders need review",
      })
    ).toBeVisible()
    await user.click(screen.getByRole("tab", { name: "Closed by Cents" }))

    expect((await screen.findAllByText("Closed by Cents"))[0]).toBeVisible()
    expect(
      screen.getAllByText(
        /reported this order completed before it was added/i
      )[0]
    ).toBeVisible()
    const restore = screen.getAllByRole("button", {
      name: "Restore order 2481 for review",
    })[0]!
    await user.click(restore)
    const dialog = await screen.findByRole("alertdialog")
    expect(
      within(dialog).getByText(
        /Later source closure updates will not close it/i
      )
    ).toBeVisible()
    await user.click(
      within(dialog).getByRole("button", { name: "Restore for review" })
    )

    await waitFor(() => expect(restoreIncomingOrder).toHaveBeenCalledTimes(1))
    expect(restoreIncomingOrder).toHaveBeenCalledWith({
      locationId: testLocation.id,
      proposalId: testSourceClosedOrderProposal.id,
      request: {
        expectedVersion: 2,
        idempotencyKey: expect.stringContaining(
          "restore-incoming-order-proposal"
        ),
        reasonCode: "source_closure_overridden",
        reasonNote: null,
      },
    })
    expect(await screen.findByText(/restored to Needs review/i)).toBeVisible()
  })

  it("keeps large incoming queues on bounded server pages", async () => {
    const user = userEvent.setup()
    const secondProposal = {
      ...testIncomingOrderProposal,
      id: "00000000-0000-4000-8000-000000000799",
      externalOrderId: "external-order-2",
      displayNumber: "2482",
    }
    const listIncomingOrders = vi.fn(async ({ cursor }) =>
      cursor === null
        ? {
            items: [testIncomingOrderProposal],
            nextCursor: "cursor-2",
          }
        : {
            items: [secondProposal],
            nextCursor: null,
          }
    )
    renderIncoming({ listIncomingOrders })

    expect((await screen.findAllByText("Order 2481"))[0]).toBeVisible()
    expect(listIncomingOrders).toHaveBeenLastCalledWith(
      expect.objectContaining({
        locationId: testLocation.id,
        view: "needs_review",
        limit: 25,
        cursor: null,
      })
    )

    await user.click(screen.getByRole("button", { name: "Next" }))
    expect((await screen.findAllByText("Order 2482"))[0]).toBeVisible()
    expect(listIncomingOrders).toHaveBeenLastCalledWith(
      expect.objectContaining({
        locationId: testLocation.id,
        view: "needs_review",
        limit: 25,
        cursor: "cursor-2",
      })
    )

    await user.click(screen.getByRole("button", { name: "Previous" }))
    expect((await screen.findAllByText("Order 2481"))[0]).toBeVisible()
    expect(listIncomingOrders).toHaveBeenCalledTimes(3)
  })

  it("requires an audited rejection reason before sending the command", async () => {
    const user = userEvent.setup()
    const rejectIncomingOrder = vi.fn(async ({ proposalId }) => ({
      proposalId,
      state: "rejected" as const,
      version: 2 as const,
      orderId: null,
      fulfillmentId: null,
      replayed: false,
    }))
    renderIncoming({ rejectIncomingOrder })

    await user.click(
      (await screen.findAllByRole("button", { name: "Reject order 2481" }))[0]!
    )
    const dialog = await screen.findByRole("alertdialog")
    await user.click(
      within(dialog).getByRole("button", { name: "Reject order" })
    )
    expect(
      within(dialog).getByText(/Choose a reason before rejecting/i)
    ).toBeVisible()
    expect(rejectIncomingOrder).not.toHaveBeenCalled()

    await user.selectOptions(
      within(dialog).getByLabelText("Why are you rejecting this order?"),
      "already_handled"
    )
    expect(
      within(dialog).queryByText(/Choose a reason before rejecting/i)
    ).toBeNull()
    await user.click(
      within(dialog).getByRole("button", { name: "Reject order" })
    )

    await waitFor(() => expect(rejectIncomingOrder).toHaveBeenCalledTimes(1))
    expect(rejectIncomingOrder).toHaveBeenCalledWith({
      locationId: testLocation.id,
      proposalId: testIncomingOrderProposal.id,
      request: {
        expectedVersion: 1,
        idempotencyKey: expect.stringContaining(
          "reject-incoming-order-proposal"
        ),
        reasonCode: "already_handled",
        reasonNote: null,
      },
    })
  })

  it("closes a stale decision, refreshes, and explains the conflict", async () => {
    const user = userEvent.setup()
    const listIncomingOrders = vi
      .fn()
      .mockResolvedValueOnce({
        items: [testIncomingOrderProposal],
        nextCursor: null,
      })
      .mockResolvedValue({ items: [], nextCursor: null })
    renderIncoming({
      listIncomingOrders,
      acceptIncomingOrder: async () => {
        throw requestFailure({
          requestKind: "conflict",
          code: "INCOMING_ORDER_PROPOSAL_VERSION_CONFLICT",
          message: "changed",
          responseStatus: 409,
        })
      },
    })

    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "Add order 2481 to Pressly",
        })
      )[0]!
    )
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Add to Pressly",
      })
    )

    expect(
      await screen.findByText(/changed while you were reviewing it/i)
    ).toBeVisible()
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(listIncomingOrders).toHaveBeenCalledTimes(2)
  })

  it("renders honest empty and retryable error states", async () => {
    const user = userEvent.setup()
    const listIncomingOrders = vi
      .fn()
      .mockRejectedValueOnce(
        requestFailure({
          requestKind: "unavailable",
          code: "NETWORK_UNAVAILABLE",
          message: "offline",
        })
      )
      .mockResolvedValue({ items: [], nextCursor: null })
    renderIncoming({ listIncomingOrders })

    expect(
      await screen.findByText(/cannot reach the order service/i)
    ).toBeVisible()
    await user.click(screen.getAllByRole("button", { name: "Retry" })[0]!)
    expect(
      await screen.findByRole("heading", {
        name: "No submitted orders need review",
      })
    ).toBeVisible()
    expect(listIncomingOrders).toHaveBeenCalledTimes(2)
  })

  it("returns to the previous page after deciding its last incoming order", async () => {
    const user = userEvent.setup()
    let accepted = false
    const secondProposal = {
      ...testIncomingOrderProposal,
      id: "00000000-0000-4000-8000-000000000799",
      externalOrderId: "external-order-2",
      displayNumber: "2482",
    }
    const listIncomingOrders = vi.fn(async ({ cursor }) =>
      cursor === null
        ? {
            items: [testIncomingOrderProposal],
            nextCursor: "cursor-2",
          }
        : {
            items: accepted ? [] : [secondProposal],
            nextCursor: null,
          }
    )
    const acceptIncomingOrder = vi.fn(async ({ proposalId }) => {
      accepted = true
      return {
        proposalId,
        state: "accepted" as const,
        version: 2 as const,
        orderId: "00000000-0000-4000-8000-000000000702",
        fulfillmentId: "00000000-0000-4000-8000-000000000703",
        replayed: false,
      }
    })
    renderIncoming({ listIncomingOrders, acceptIncomingOrder })

    await user.click(await screen.findByRole("button", { name: "Next" }))
    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "Add order 2482 to Pressly",
        })
      )[0]!
    )
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Add to Pressly",
      })
    )

    expect((await screen.findAllByText("Order 2481"))[0]).toBeVisible()
    expect(screen.queryByText("No submitted orders need review")).toBeNull()
    expect(listIncomingOrders).toHaveBeenCalledTimes(4)
  })

  it("uses server-owned capabilities when an exact order already exists", async () => {
    renderIncoming({
      listIncomingOrders: async () => ({
        items: [
          {
            ...testIncomingOrderProposal,
            availableActions: ["reject"],
            acceptBlockedReason: "exact_order_exists",
          },
        ],
        nextCursor: null,
      }),
    })

    expect((await screen.findAllByText(/Already in Pressly/i))[0]).toBeVisible()
    expect(
      screen.getAllByRole("button", {
        name: "Add order 2481 to Pressly",
      })[0]
    ).toBeDisabled()
    expect(
      screen.getAllByRole("button", { name: "Reject order 2481" })[0]
    ).toBeEnabled()
  })

  it.each([
    ["INCOMING_ORDER_PROPOSAL_TRANSITION_INVALID", /was already changed/i],
    ["INCOMING_ORDER_PROPOSAL_IDENTITY_CONFLICT", /already exists in Pressly/i],
  ])("explains the %s conflict", async (code, expectedMessage) => {
    const user = userEvent.setup()
    renderIncoming({
      acceptIncomingOrder: async () => {
        throw requestFailure({
          requestKind: "conflict",
          code,
          message: "conflict",
          responseStatus: 409,
        })
      },
    })

    await user.click(
      (
        await screen.findAllByRole("button", {
          name: "Add order 2481 to Pressly",
        })
      )[0]!
    )
    await user.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Add to Pressly",
      })
    )

    expect(await screen.findByText(expectedMessage)).toBeVisible()
  })

  it("keeps command failures separate from rejection validation", async () => {
    const user = userEvent.setup()
    renderIncoming({
      rejectIncomingOrder: async () => {
        throw requestFailure({
          requestKind: "forbidden",
          code: "FORBIDDEN",
          message: "forbidden",
          responseStatus: 403,
        })
      },
    })

    await user.click(
      (await screen.findAllByRole("button", { name: "Reject order 2481" }))[0]!
    )
    const dialog = await screen.findByRole("alertdialog")
    const reason = within(dialog).getByLabelText(
      "Why are you rejecting this order?"
    )
    await user.selectOptions(reason, "manager_rejected")
    await user.click(
      within(dialog).getByRole("button", { name: "Reject order" })
    )

    expect(
      await within(dialog).findByText(
        /cannot accept, reject, or restore reported orders/i
      )
    ).toBeVisible()
    expect(reason).toHaveAttribute("aria-invalid", "false")
  })

  it("labels loading state and supports keyboard decision controls", async () => {
    const pending = new Promise<never>(() => undefined)
    const { unmount } = render(
      <IncomingOrdersWorkspace
        orderManagement={makeTestOrderManagementPort({
          listIncomingOrders: async () => pending,
        })}
        idempotency={testIdempotency}
        locationId={testLocation.id}
        timezone={testLocation.timezone}
        revision="2026-08-01T17:30:00.000Z"
        onMutated={async () => undefined}
      />
    )
    expect(
      screen.getByRole("region", { name: "Reported orders" })
    ).toHaveAttribute("aria-busy", "true")
    unmount()

    const user = userEvent.setup()
    renderIncoming()
    const accept = (
      await screen.findAllByRole("button", {
        name: "Add order 2481 to Pressly",
      })
    )[0]!
    accept.focus()
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("alertdialog")).toBeVisible()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
    expect(accept).toHaveFocus()
  })
})
