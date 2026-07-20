import type { ProductionDemandOutlook } from "@pressly/contracts"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { DemandOutlookView } from "@/features/demand-outlook/demand-outlook.view"

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`

const outlook: ProductionDemandOutlook = {
  productionShiftId: id(1),
  horizonCutoffAt: "2026-08-02T04:00:00.000Z",
  totalOrderCount: 3,
  totalEstimatedWeightLbs: 165,
  estimateMissingOrderCount: 0,
  expectedOrderCount: 1,
  expectedEstimatedWeightLbs: 50,
  readyOrderCount: 1,
  readyEstimatedWeightLbs: 75,
  inProductionOrderCount: 1,
  inProductionEstimatedWeightLbs: 40,
  reconciliationCount: 1,
  items: [
    {
      orderDemandId: id(10),
      productionOrderId: id(20),
      externalOrderId: "7472010",
      phase: "expected",
      sourceStatusCode: "SUBMITTED",
      dueAt: "2026-08-01T20:00:00.000Z",
      estimatedWeightLbs: 50,
      readiness: "awaiting_intake",
      productionStatus: "intake_pending",
      bagCount: null,
      reconciliation: "none",
    },
    {
      orderDemandId: id(11),
      productionOrderId: id(21),
      externalOrderId: "7472011",
      phase: "post_production",
      sourceStatusCode: "READY_FOR_RETURN",
      dueAt: "2026-08-01T21:00:00.000Z",
      estimatedWeightLbs: 40,
      readiness: "in_production",
      productionStatus: "scheduled",
      bagCount: 2,
      reconciliation: "source_ahead",
    },
  ],
  forecast: {
    algorithmVersion: "fixed-pulse-demand-outlook-v1",
    startsAt: "2026-08-01T03:00:00.000Z",
    completesAt: "2026-08-01T06:44:00.000Z",
    pulseMinutes: 56,
    pulseCapacityLbs: 224,
    batchCount: 1,
    makespanMinutes: 224,
    batches: [
      {
        sequence: 0,
        demandIds: [id(10)],
        estimatedWeightLbs: 50,
        expectedOrderCount: 1,
        readyOrderCount: 0,
      },
    ],
    unplacedDemandIds: [],
  },
}

describe("demand outlook", () => {
  it("keeps the Home summary compact and explicitly advisory", () => {
    render(
      <DemandOutlookView
        outlook={outlook}
        timezone="America/New_York"
        variant="compact"
      />
    )

    expect(screen.getByText("Demand outlook")).toBeInTheDocument()
    expect(screen.getByText("Advisory only")).toBeInTheDocument()
    expect(screen.getByText("Known demand")).toBeInTheDocument()
    expect(screen.getByText("165 lb")).toBeInTheDocument()
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
  })

  it("shows forecast batches and precise Cents-versus-LPMS reconciliation", async () => {
    const user = userEvent.setup()
    render(
      <DemandOutlookView
        outlook={outlook}
        timezone="America/New_York"
        variant="detailed"
      />
    )

    expect(screen.getByText("Forecast batch #1")).toBeInTheDocument()
    expect(
      screen.getByText("Cents and LPMS need comparison")
    ).toBeInTheDocument()
    await user.click(screen.getByRole("tab", { name: "Demand & review 2" }))
    expect(screen.getByText("Order 7472010")).toBeInTheDocument()
    expect(
      screen.getByText(
        /Cents is further ahead than LPMS\. Confirm the order's physical state/
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(id(11))).not.toBeInTheDocument()
  })
})
