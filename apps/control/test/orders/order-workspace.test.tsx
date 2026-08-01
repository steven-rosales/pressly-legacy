import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import i18next from "i18next"
import { describe, expect, it, vi } from "vitest"
import type { ControlAuthenticatedSession } from "@/authentication/control-session"
import type { ControlCustomerApi } from "@/features/customers/customer-api"
import type { ControlCustomer } from "@/features/customers/customer-model"
import type { ControlOrderApi } from "@/features/orders/order-api"
import type {
  ControlOrder,
  ControlOrderDetail,
} from "@/features/orders/order-model"
import { OrderWorkspace } from "@/features/orders/order-workspace"

const customer: ControlCustomer = {
  id: "5e03eb58-bfa3-435b-9c68-1f0ffc9bcb2a",
  version: 3,
  active: true,
  firstName: "Santiago",
  lastName: "Jackson",
  businessName: null,
  phone: "+12015550101",
  email: "santiago@example.com",
  displayName: "Santiago Jackson",
  possibleDuplicateCount: 0,
  createdAt: "2026-07-30T12:00:00.000Z",
  updatedAt: "2026-07-30T13:00:00.000Z",
}

const order: ControlOrder = {
  id: "15f669cf-f916-44b9-b033-0e5f9bfb2b3f",
  version: 4,
  displayNumber: "21122",
  state: "open",
  dueAt: "2026-07-31T21:00:00.000Z",
  currency: "USD",
  totalAmountCents: 4200,
  balanceDueCents: 1200,
  customer: {
    resolution: "resolved",
    userId: customer.id,
    displayName: customer.displayName,
    phone: customer.phone,
    email: customer.email,
  },
  fulfillment: {
    id: "c20e9bd9-1580-4518-988e-2d2ae6c9711d",
    version: 2,
    typeCode: "wash_fold",
    locationId: "laundry-production",
    releaseState: "unreleased",
    estimatedWeightLbs: 17,
    estimatedWeightSource: "control_manager_entry",
    bagCount: null,
  },
  createdAt: "2026-07-30T12:00:00.000Z",
  updatedAt: "2026-07-30T13:00:00.000Z",
}

const orderDetail: ControlOrderDetail = { ...order, items: [] }

const session = (
  capabilities: ControlAuthenticatedSession["access"]["capabilities"],
): ControlAuthenticatedSession => ({
  status: "authenticated",
  principal: {
    identityId: "8a283721-7ff9-4d18-a497-e3a0dca576b7",
    displayName: "Olivia Press",
  },
  access: {
    business: {
      id: "404d5ca3-72cb-4ed8-8fbf-95b6a371a9a6",
      name: "Pressly One",
    },
    locations: [
      {
        id: "laundry-production",
        name: "Laundry Production",
        timezone: "America/New_York",
      },
    ],
    selectedLocationId: "laundry-production",
    capabilities,
    applications: [],
  },
  expiresAt: "2026-08-01T12:00:00.000Z",
  csrfToken: "c".repeat(43),
})

const makeOrdersApi = (
  overrides: Partial<ControlOrderApi> = {},
): ControlOrderApi => ({
  list: vi.fn().mockResolvedValue({
    items: [],
    nextCursor: null,
  }),
  get: vi.fn(),
  create: vi.fn(),
  correct: vi.fn(),
  ...overrides,
})

const makeCustomersApi = (
  overrides: Partial<ControlCustomerApi> = {},
): ControlCustomerApi => ({
  list: vi.fn().mockResolvedValue({
    items: [customer],
    nextCursor: null,
  }),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  ...overrides,
})

describe("Order workspace", () => {
  it("renders order operations and dates in Spanish when selected", async () => {
    await i18next.changeLanguage("es")

    const { container } = render(
      <OrderWorkspace
        api={makeOrdersApi({
          list: vi.fn().mockResolvedValue({
            items: [order],
            nextCursor: null,
          }),
        })}
        customersApi={makeCustomersApi()}
        session={session(["orders:read", "orders:write", "customers:read"])}
      />,
    )

    expect(await screen.findByText("Pedidos de clientes")).toBeVisible()
    const desktopList = container.querySelector<HTMLElement>(
      '[data-slot="control-order-desktop-list"]',
    )
    expect(desktopList).not.toBeNull()
    expect(within(desktopList!).getByText("Pedido 21122")).toBeVisible()
    expect(within(desktopList!).getByText(/31 jul/i)).toBeVisible()
    expect(screen.getByRole("button", { name: "Nuevo pedido" })).toBeVisible()
  })

  it("shows the customer identity in every row and exposes no lifecycle commands", async () => {
    const { container } = render(
      <OrderWorkspace
        api={makeOrdersApi({
          list: vi.fn().mockResolvedValue({
            items: [order],
            nextCursor: null,
          }),
        })}
        customersApi={makeCustomersApi()}
        session={session(["orders:read", "customers:read"])}
      />,
    )

    await screen.findByText("Customer orders")
    const desktopList = container.querySelector<HTMLElement>(
      '[data-slot="control-order-desktop-list"]',
    )
    const mobileList = container.querySelector<HTMLElement>(
      '[data-slot="control-order-mobile-list"]',
    )
    expect(desktopList).not.toBeNull()
    expect(mobileList).not.toBeNull()
    expect(within(desktopList!).getByText("Order 21122")).toBeVisible()
    expect(
      within(desktopList!).getByText("Santiago Jackson · +12015550101"),
    ).toBeVisible()
    expect(within(mobileList!).getByText("Order 21122")).toBeVisible()
    expect(
      within(mobileList!).getByText("Santiago Jackson · +12015550101"),
    ).toBeVisible()
    expect(
      within(desktopList!).getByRole("button", {
        name: "Review Order 21122 for Santiago Jackson",
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: /complete|cancel|release/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "New order" }),
    ).not.toBeInTheDocument()
  })

  it("uses the shared shadcn Calendar trigger instead of a native date input", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <OrderWorkspace
        api={makeOrdersApi({
          list: vi.fn().mockResolvedValue({
            items: [order],
            nextCursor: null,
          }),
          get: vi.fn().mockResolvedValue(orderDetail),
        })}
        customersApi={makeCustomersApi()}
        session={session(["orders:read", "orders:write", "customers:read"])}
      />,
    )

    await screen.findByText("Customer orders")
    await user.click(screen.getByRole("button", { name: "New order" }))

    expect(await screen.findByLabelText("Due date and time")).toBeVisible()
    expect(
      document.querySelector('[data-slot="sheet-content"]'),
    ).toHaveAttribute("data-size", "workspace")
    expect(container.querySelector('input[type="date"]')).toBeNull()
    expect(
      document.querySelector('[data-slot="popover-trigger"]'),
    ).not.toBeNull()
  })

  it("keeps commercial corrections separate from production admission", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <OrderWorkspace
        api={makeOrdersApi({
          list: vi.fn().mockResolvedValue({
            items: [order],
            nextCursor: null,
          }),
          get: vi.fn().mockResolvedValue(orderDetail),
        })}
        customersApi={makeCustomersApi()}
        session={session(["orders:read", "orders:write", "customers:read"])}
      />,
    )

    await screen.findByText("Customer orders")
    const desktopList = container.querySelector<HTMLElement>(
      '[data-slot="control-order-desktop-list"]',
    )
    expect(desktopList).not.toBeNull()
    await user.click(
      within(desktopList!).getByRole("button", {
        name: "Review Order 21122 for Santiago Jackson",
      }),
    )
    expect(
      await screen.findByText(
        "Review the order and save factual commercial corrections.",
      ),
    ).toBeVisible()
    expect(
      screen.getByText(
        "Moving an existing order is a separate operational decision.",
      ),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "Complete order" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Cancel order" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Release to Production" }),
    ).not.toBeInTheDocument()
  })

  it("keeps the current exact customer selectable outside the bounded active page", async () => {
    const otherCustomer = {
      ...customer,
      id: "049ff550-3f00-4381-b5bd-aa46a240d4c6",
      displayName: "Another Customer",
      firstName: "Another",
      lastName: "Customer",
      phone: "+12015550199",
    }
    const listCustomers = vi
      .fn<ControlCustomerApi["list"]>()
      .mockResolvedValue({
        items: [otherCustomer],
        nextCursor: "more-active-customers",
      })
    const user = userEvent.setup()
    const { container } = render(
      <OrderWorkspace
        api={makeOrdersApi({
          list: vi.fn().mockResolvedValue({
            items: [order],
            nextCursor: null,
          }),
          get: vi.fn().mockResolvedValue(orderDetail),
        })}
        customersApi={makeCustomersApi({ list: listCustomers })}
        session={session(["orders:read", "orders:write", "customers:read"])}
      />,
    )

    await screen.findByText("Customer orders")
    const desktopList = container.querySelector<HTMLElement>(
      '[data-slot="control-order-desktop-list"]',
    )
    expect(desktopList).not.toBeNull()
    await user.click(
      within(desktopList!).getByRole("button", {
        name: "Review Order 21122 for Santiago Jackson",
      }),
    )
    expect(await screen.findByLabelText("Customer")).toHaveTextContent(
      "Santiago Jackson",
    )
    expect(
      screen.getByText(
        "Select the correct customer. Search shows up to 100 active matches, and the order's current customer stays available.",
      ),
    ).toBeVisible()

    await user.type(screen.getByLabelText("Find customer"), "Santiago")
    await user.click(screen.getByRole("button", { name: "Find" }))
    expect(listCustomers).toHaveBeenLastCalledWith({
      query: "Santiago",
      active: true,
      cursor: null,
      limit: 100,
    })
    expect(screen.getByLabelText("Customer")).toHaveTextContent(
      "Santiago Jackson",
    )
  })
})
