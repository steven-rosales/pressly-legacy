import { render, screen } from "@testing-library/react"
import i18next from "i18next"
import { describe, expect, it } from "vitest"
import { OperationalOrderIdentity } from "./operational-order-identity"

describe("operational order identity", () => {
  it("keeps the complete order and customer identity available when the row truncates", () => {
    const customer =
      "Northwind Hotel Laundry Operations and Conference Services"

    render(
      <OperationalOrderIdentity
        identity={{
          displayNumber: "LPMS-2026-000042",
          customerDisplayName: customer,
        }}
      />
    )

    expect(screen.getByText("Order LPMS-2026-000042")).toHaveAttribute(
      "title",
      "Order LPMS-2026-000042"
    )
    expect(screen.getByText(customer)).toHaveAttribute("title", customer)
    expect(
      screen.getByTitle(`Order LPMS-2026-000042, ${customer}`)
    ).toBeVisible()
  })

  it("localizes the unavailable-customer fallback without changing the canonical order number", async () => {
    await i18next.changeLanguage("es")

    render(
      <OperationalOrderIdentity
        identity={{
          displayNumber: "1007",
          customerDisplayName: null,
        }}
      />
    )

    expect(screen.getByText("Pedido 1007")).toBeVisible()
    expect(screen.getByText("Cliente no disponible")).toBeVisible()
  })
})
