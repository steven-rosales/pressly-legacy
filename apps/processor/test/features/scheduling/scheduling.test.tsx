import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SchedulingWorkspace } from "@/features/scheduling/scheduling.view"
import {
  makeTestProductionPort,
  testConfig,
  testIdempotency,
  testOrders,
  testSchedule,
  testShift,
} from "../../fixtures/production.fixture"

const defaults = {
  pulseMinutes: testConfig.pulseMinutes,
  foldLbsPerFolderMinute: testConfig.foldLbsPerFolderMinute,
  effectiveFolderCount: testShift.effectiveFolderCount,
  startsAt: testShift.startsAt,
  endsAt: testShift.endsAt,
  timezone: testShift.timezone,
  horizonEnd: "2026-08-03T20:00:00.000Z",
} as const

describe("scheduling workspace", () => {
  it("renders server-provided demand, pulse capacity, and makespan", () => {
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort()}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={defaults}
        currentConfig={testConfig}
        currentShift={testShift}
        initialProposal={testSchedule}
        onAccepted={vi.fn()}
      />
    )

    expect(screen.getAllByText("200 lb", { selector: "p" })).toHaveLength(2)
    expect(screen.getByText("200 min")).toBeInTheDocument()
    expect(screen.getAllByText(/50-minute|50 minutes/).length).toBeGreaterThan(
      0
    )
    expect(screen.getByText("Within the configured shift")).toBeInTheDocument()
  })

  it("requires explicit acknowledgement for server-provided blocking warnings", async () => {
    const user = userEvent.setup()
    const accepted = vi.fn(async () => ({
      productionRunId: "00000000-0000-4000-8000-000000000021",
      productionBatchIds: ["00000000-0000-4000-8000-000000000030"],
      replayed: false,
    }))
    const proposal = structuredClone(testSchedule)
    proposal.makespanMinutes = 400
    proposal.warnings = [
      {
        code: "SHIFT_OVERFLOW",
        message: "The proposal exceeds the shift by 40 minutes.",
        blocking: true,
      },
    ]
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort({ acceptSchedule: accepted })}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={defaults}
        initialProposal={proposal}
        onAccepted={vi.fn()}
      />
    )

    const button = screen.getByRole("button", { name: "Accept exact proposal" })
    expect(button).toBeDisabled()
    await user.click(screen.getByRole("checkbox", { name: /acknowledge/i }))
    await user.click(button)

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Schedule accepted"
    )
    expect(accepted).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledgedWarningCodes: ["SHIFT_OVERFLOW"] })
    )
  })

  it("reuses the current immutable config and shift when inputs are unchanged", async () => {
    const user = userEvent.setup()
    const publishConfig = vi.fn()
    const createShift = vi.fn()
    const createSchedule = vi.fn(async () => testSchedule)
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort({
          publishConfig,
          createShift,
          createSchedule,
        })}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={defaults}
        currentConfig={testConfig}
        currentShift={testShift}
        onAccepted={vi.fn()}
      />
    )

    await user.click(screen.getByRole("button", { name: "Generate schedule" }))
    expect(publishConfig).not.toHaveBeenCalled()
    expect(createShift).not.toHaveBeenCalled()
    expect(createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        schedulerConfigId: testConfig.id,
        productionShiftId: testShift.id,
      })
    )
  })

  it("requires explicit physical stage-fit confirmation for a new pulse", async () => {
    const user = userEvent.setup()
    const publishConfig = vi.fn(async () => testConfig)
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort({ publishConfig })}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={defaults}
        currentShift={testShift}
        onAccepted={vi.fn()}
      />
    )

    const generate = screen.getByRole("button", { name: "Generate schedule" })
    const sorting = screen.getByRole("checkbox", { name: /confirm sorting/i })
    const washing = screen.getByRole("checkbox", { name: /confirm washing/i })
    const drying = screen.getByRole("checkbox", { name: /confirm drying/i })
    expect(generate).toBeDisabled()

    await user.click(sorting)
    await user.click(washing)
    await user.click(drying)
    expect(generate).toBeEnabled()

    const pulse = screen.getByLabelText("Pulse duration")
    await user.clear(pulse)
    await user.type(pulse, "56")
    expect(generate).toBeDisabled()
    expect(sorting).not.toBeChecked()
    expect(washing).not.toBeChecked()
    expect(drying).not.toBeChecked()

    await user.click(sorting)
    await user.click(washing)
    await user.click(drying)
    await user.click(generate)

    expect(publishConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        pulseMinutes: 56,
        stageFitAssertion: {
          sortingFits: true,
          washingFits: true,
          dryingFits: true,
        },
      })
    )
  })

  it("supports explicit priority directives without changing order cohesion", async () => {
    const user = userEvent.setup()
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort()}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={defaults}
        initialProposal={testSchedule}
        onAccepted={vi.fn()}
      />
    )
    await user.click(screen.getByRole("tab", { name: "Orders" }))
    const switchControl = screen.getByRole("switch", {
      name: "Prioritize order C-1002",
    })
    await user.click(switchControl)
    expect(switchControl).toBeChecked()
    expect(
      within(screen.getByText("Order C-1002").parentElement!).getByText(
        /80 lb · 2 bags/
      )
    ).toBeInTheDocument()
  })
})
