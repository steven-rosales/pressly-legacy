import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { IntakeWorkspace } from "@/features/intake/intake.view"
import {
  makeTestProductionPort,
  testIdempotency,
  testOrderItems,
  testWorkspace,
} from "../../fixtures/production.fixture"

describe("order intake", () => {
  it("submits physical bag count with the current order version and refreshes", async () => {
    const user = userEvent.setup()
    const pending = testOrderItems.find(
      (order) => order.status === "intake_pending"
    )!
    const recordIntake = vi.fn(async () => ({
      locationId: testWorkspace.location.id,
      orderId: pending.id,
      bagCount: 4,
      bagCountProvenance: "operator_intake" as const,
      intakeVersion: 1,
      version: pending.version + 1,
      replayed: false,
    }))
    const onRecorded = vi.fn(async () => undefined)
    render(
      <IntakeWorkspace
        production={makeTestProductionPort({ recordIntake })}
        idempotency={testIdempotency}
        locationId={testWorkspace.location.id}
        orders={[pending]}
        onRecorded={onRecorded}
      />
    )

    await user.type(screen.getByLabelText("Bags"), "4")
    await user.click(screen.getByRole("button", { name: "Record intake" }))

    expect(recordIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        productionOrderId: pending.id,
        bagCount: 4,
        expectedVersion: pending.version,
      })
    )
    expect(onRecorded).toHaveBeenCalled()
  })
})
