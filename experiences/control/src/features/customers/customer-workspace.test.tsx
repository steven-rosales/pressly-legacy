import { render, screen, waitFor, within } from "@testing-library/react"
import { proveExperienceFeature } from "@pressly/testkit/experience-feature-proof"
import { controlCustomersFeature } from "./feature"
import userEvent from "@testing-library/user-event"
import i18next from "i18next"
import { describe, expect, it, vi } from "vitest"
import type { ControlAuthenticatedSession } from "../../browser/contracts/authentication.ts"
import type { ControlCustomer } from "../../browser/contracts/customers.ts"
import type { ControlCustomerApi } from "./customer-api"
import { controlApiErrorFixture } from "../../../test/support/control-api-error.fixture.ts"
import { CustomerWorkspace } from "./customer-workspace"

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
  possibleDuplicateCount: 1,
  createdAt: "2026-07-30T12:00:00.000Z",
  updatedAt: "2026-07-30T13:00:00.000Z",
}

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

const makeApi = (
  overrides: Partial<ControlCustomerApi> = {},
): ControlCustomerApi => ({
  list: vi.fn().mockResolvedValue({
    items: [],
    nextCursor: null,
  }),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  ...overrides,
})

describe("Customer workspace", () => {
  it("renders customer operations in Spanish when selected", async () => {
    await i18next.changeLanguage("es")

    render(
      <CustomerWorkspace
        api={makeApi()}
        session={session(["customers:read", "customers:write"])}
      />,
    )

    expect(await screen.findByText("Registros de clientes")).toBeVisible()
    expect(
      screen.getAllByRole("button", { name: "Nuevo cliente" }),
    ).toHaveLength(2)
    expect(
      screen.getByText("Ningún cliente coincide con esta vista"),
    ).toBeVisible()
  })

  it("keeps customer identity recognizable and hides mutations in read-only access", async () => {
    const api = makeApi({
      list: vi.fn().mockResolvedValue({
        items: [customer],
        nextCursor: null,
      }),
    })
    const { container } = render(
      <CustomerWorkspace api={api} session={session(["customers:read"])} />,
    )

    await screen.findByText("Customer records")
    const desktopList = container.querySelector<HTMLElement>(
      '[data-slot="control-customer-desktop-list"]',
    )
    const mobileList = container.querySelector<HTMLElement>(
      '[data-slot="control-customer-mobile-list"]',
    )
    expect(desktopList).not.toBeNull()
    expect(mobileList).not.toBeNull()
    expect(within(desktopList!).getByText("Santiago Jackson")).toBeVisible()
    expect(
      within(desktopList!).getByText("+12015550101 · santiago@example.com"),
    ).toBeVisible()
    expect(within(mobileList!).getByText("Santiago Jackson")).toBeVisible()
    expect(
      within(mobileList!).getByText("+12015550101 · santiago@example.com"),
    ).toBeVisible()
    expect(within(desktopList!).getByText("1 possible match")).toBeVisible()
    expect(
      within(desktopList!).getByRole("button", {
        name: "Review Santiago Jackson",
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", { name: "New customer" }),
    ).not.toBeInTheDocument()
  })

  it("uses opaque next cursors without exposing or deriving their contents", async () => {
    const list = vi
      .fn<ControlCustomerApi["list"]>()
      .mockResolvedValueOnce({
        items: [customer],
        nextCursor: "opaque/next",
      })
      .mockResolvedValueOnce({
        items: [{ ...customer, id: "977729b8-cda3-44af-a984-692fabbd0687" }],
        nextCursor: null,
      })
    const user = userEvent.setup()
    const { container } = render(
      <CustomerWorkspace
        api={makeApi({ list })}
        session={session(["customers:read"])}
      />,
    )

    await screen.findByText("Customer records")
    const desktopList = container.querySelector<HTMLElement>(
      '[data-slot="control-customer-desktop-list"]',
    )
    expect(desktopList).not.toBeNull()
    expect(within(desktopList!).getByText("Santiago Jackson")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Next" }))

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({
        query: "",
        active: true,
        cursor: "opaque/next",
      }),
    )
    expect(screen.getByText("Page 2")).toBeVisible()
  })

  proveExperienceFeature({
    featureId: "control.customers",
    feature: controlCustomersFeature,
    scenarios: [
      {
        name: "keeps a stale correction open with a safe refresh instruction",
        proves: ["presentation-state", "component-interaction"],
        run: async () => {
          const update = vi
            .fn<ControlCustomerApi["update"]>()
            .mockRejectedValue(
              controlApiErrorFixture("conflict", { status: 409 }),
            )
          const user = userEvent.setup()
          const { container } = render(
            <CustomerWorkspace
              api={makeApi({
                list: vi.fn().mockResolvedValue({
                  items: [customer],
                  nextCursor: null,
                }),
                get: vi.fn().mockResolvedValue(customer),
                update,
              })}
              session={session(["customers:read", "customers:write"])}
            />,
          )

          await screen.findByText("Customer records")
          const desktopList = container.querySelector<HTMLElement>(
            '[data-slot="control-customer-desktop-list"]',
          )
          expect(desktopList).not.toBeNull()
          await user.click(
            within(desktopList!).getByRole("button", {
              name: "Review Santiago Jackson",
            }),
          )
          expect(
            document.querySelector('[data-slot="sheet-content"]'),
          ).toHaveAttribute("data-size", "workspace")
          const phone = await screen.findByLabelText("Phone")
          await user.clear(phone)
          await user.type(phone, "+12015550102")
          await user.click(
            screen.getByRole("button", { name: "Save correction" }),
          )

          expect(
            await screen.findByText(
              "This customer changed while you were working. Refresh and review the latest record before trying again.",
            ),
          ).toBeVisible()
          expect(update).toHaveBeenCalledWith({
            customerId: customer.id,
            expectedVersion: customer.version,
            changes: expect.objectContaining({ phone: "+12015550102" }),
          })
        },
      },
    ],
  })
})
