import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SchedulingWorkspace } from "@/features/scheduling/scheduling.view"
import { RequestFailure } from "@/ports/request.error"
import {
  makeTestProductionPort,
  testConfig,
  testIdempotency,
  testOrders,
  testSchedule,
  testShift,
  testShiftSelection,
} from "../../fixtures/production.fixture"

const defaults = {
  pulseMinutes: testConfig.pulseMinutes,
  foldLbsPerFolderMinute: testConfig.foldLbsPerFolderMinute,
  effectiveFolderCount: testShift.effectiveFolderCount,
  startsAt: testShift.startsAt,
  endsAt: testShift.endsAt,
  timezone: testShift.timezone,
} as const

const lifecycleCallbacks = {
  canManage: true,
  shiftSelection: testShiftSelection,
  onScheduleChanged: vi.fn(async () => undefined),
  onStarted: vi.fn(async () => undefined),
}

describe("scheduling workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("keeps previous demand visible while suppressing stale plan metrics", () => {
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort()}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={[]}
        defaults={defaults}
        currentConfig={testConfig}
        currentShift={testShift}
        initialProposal={testSchedule}
        {...lifecycleCallbacks}
      />
    )

    const summary = screen.getByRole("region", { name: "Schedule summary" })
    const demandMetric = screen
      .getByText("Previous plan demand")
      .closest<HTMLElement>("[data-slot=metric]")
    expect(demandMetric).not.toBeNull()
    for (const label of [
      "Previous plan demand",
      "Pulse capacity",
      "Makespan",
      "Forecast finish",
    ]) {
      expect(within(summary).getByText(label)).toBeInTheDocument()
    }
    expect(summary.querySelectorAll("[data-slot=metric]")).toHaveLength(4)
    expect(summary.querySelector("[data-slot=card]")).toBeNull()
    expect(within(demandMetric!).getByText("200 lb")).toBeInTheDocument()
    expect(
      within(demandMetric!).getByText("2 whole orders · 5 bags")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Recompute to refresh timeline")
    ).toBeInTheDocument()
    expect(
      screen.getByText("Recompute to refresh forecast")
    ).toBeInTheDocument()
  })

  it("shows ready demand before a plan is computed", () => {
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort()}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={defaults}
        currentConfig={testConfig}
        currentShift={testShift}
        {...lifecycleCallbacks}
      />
    )

    expect(screen.getByText("Selected demand")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Compute schedule" })
    ).toBeEnabled()
    expect(screen.getByTestId("schedule-action-surface")).not.toHaveClass(
      "sticky"
    )
    expect(screen.getByTestId("schedule-action-surface")).toHaveClass(
      "md:sticky",
      "md:top-20"
    )
  })

  it("places remaining-day context after schedule controls and before the timeline", () => {
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort()}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={defaults}
        currentConfig={testConfig}
        currentShift={testShift}
        remainingDayContext={
          <section aria-label="Remaining-day context">Forecast context</section>
        }
        {...lifecycleCallbacks}
      />
    )

    const action = screen.getByTestId("schedule-action-surface")
    const metrics = screen.getByRole("region", { name: "Schedule summary" })
    const context = screen.getByRole("region", {
      name: "Remaining-day context",
    })
    const timeline = screen.getByText("Production timeline")

    expect(
      action.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      metrics.compareDocumentPosition(context) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      context.compareDocumentPosition(timeline) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("creates a new shift before computing when no planning shift exists", async () => {
    const user = userEvent.setup()
    const newShift = {
      ...testShift,
      id: "00000000-0000-4000-8000-000000000098",
    }
    const createShift = vi.fn(async () => newShift)
    const updateShift = vi.fn()
    const replaceShiftSelection = vi.fn(async () => ({
      selection: {
        productionShiftId: newShift.id,
        version: 1,
        selectedOrderIds: testOrders.map((order) => order.id),
      },
      supersededScheduleRunId: null,
      replayed: false,
    }))
    const createSchedule = vi.fn(async () => ({
      ...testSchedule,
      productionShiftId: newShift.id,
    }))
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort({
          createShift,
          updateShift,
          replaceShiftSelection,
          createSchedule,
        })}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={defaults}
        currentConfig={testConfig}
        currentShift={null}
        {...lifecycleCallbacks}
        shiftSelection={null}
      />
    )

    expect(screen.getByRole("button", { name: "Set shift" })).toBeEnabled()
    await user.click(screen.getByRole("tab", { name: /Orders/ }))
    await user.click(screen.getByRole("button", { name: "Select all ready" }))
    await user.click(screen.getByRole("button", { name: "Compute schedule" }))

    expect(createShift).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: testShift.locationId,
        startsAt: testShift.startsAt,
        endsAt: testShift.endsAt,
        effectiveFolderCount: testShift.effectiveFolderCount,
      })
    )
    expect(updateShift).not.toHaveBeenCalled()
    expect(replaceShiftSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        productionShiftId: newShift.id,
        selectedOrderIds: testOrders.map((order) => order.id),
        expectedVersion: 0,
      })
    )
    expect(createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ productionShiftId: newShift.id })
    )
    expect(lifecycleCallbacks.onScheduleChanged).toHaveBeenCalledWith(
      newShift.id
    )
  })

  it("labels an existing plan with its immutable pulse version", () => {
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort()}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={{ ...defaults, pulseMinutes: 60 }}
        currentConfig={{ ...testConfig, pulseMinutes: 60, version: 4 }}
        currentShift={testShift}
        initialProposal={testSchedule}
        {...lifecycleCallbacks}
      />
    )

    expect(screen.getByText(/four equal 50-minute stages/i)).toBeInTheDocument()
    expect(screen.getByText("50-minute production pulse")).toBeInTheDocument()
  })

  it("keeps an accepted plan valid when a new unselected order appears", () => {
    const acceptedProposal = {
      ...structuredClone(testSchedule),
      status: "accepted" as const,
      acceptedAt: "2026-08-01T13:45:00.000Z",
      acceptedBy: "00000000-0000-4000-8000-000000000090",
    }
    const newOrder = {
      ...testOrders[0]!,
      id: "00000000-0000-4000-8000-000000000099",
      externalOrderId: "C-1099",
      identity: {
        displayNumber: "C-1099",
        customerDisplayName: "New Customer",
      },
      derivedWeightLbs: 20,
      bagCount: 1,
    }
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort()}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={[...testOrders, newOrder]}
        defaults={defaults}
        currentConfig={testConfig}
        currentShift={testShift}
        initialProposal={acceptedProposal}
        {...lifecycleCallbacks}
      />
    )

    expect(
      screen.getByRole("button", { name: "Start production run" })
    ).toBeEnabled()
    expect(
      screen.queryByRole("button", { name: "Recompute schedule" })
    ).not.toBeInTheDocument()
  })

  it("requires recompute when visible demand changed before reload", () => {
    const changedOrders = testOrders.map((order, index) =>
      index === 0
        ? { ...order, derivedWeightLbs: order.derivedWeightLbs + 1 }
        : order
    )
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort()}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={changedOrders}
        defaults={defaults}
        currentConfig={testConfig}
        currentShift={testShift}
        initialProposal={testSchedule}
        {...lifecycleCallbacks}
      />
    )

    expect(
      screen.getByRole("button", { name: "Recompute schedule" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Accept plan" })
    ).not.toBeInTheDocument()
  })

  it("requires acknowledgement for server-provided blocking warnings", async () => {
    const user = userEvent.setup()
    const accepted = vi.fn(async () => ({
      scheduleRunId: testSchedule.scheduleRunId,
      productionShiftId: testShift.id,
      acceptedAt: "2026-08-01T13:45:00.000Z",
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
        currentConfig={testConfig}
        initialProposal={proposal}
        {...lifecycleCallbacks}
      />
    )

    const button = screen.getByRole("button", { name: "Accept plan" })
    expect(button).toBeDisabled()
    expect(
      screen.getByRole("region", { name: "Blocking schedule warnings" })
    ).toHaveClass(
      "max-h-[min(9rem,30vh)]",
      "overflow-y-auto",
      "overscroll-contain"
    )
    await user.click(screen.getByRole("checkbox", { name: /acknowledge/i }))
    await user.click(button)

    expect(accepted).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledgedWarningCodes: ["SHIFT_OVERFLOW"] })
    )
    expect(lifecycleCallbacks.onScheduleChanged).toHaveBeenCalledWith(
      testShift.id
    )
  })

  it("renders persisted warning acknowledgement as accepted state", () => {
    const acceptedProposal = {
      ...structuredClone(testSchedule),
      status: "accepted" as const,
      acceptedAt: "2026-08-01T13:45:00.000Z",
      acceptedBy: "00000000-0000-4000-8000-000000000090",
      warnings: [
        {
          code: "SHIFT_OVERFLOW" as const,
          message: "The proposal exceeds the shift by 40 minutes.",
          blocking: true,
        },
      ],
      acknowledgedWarningCodes: ["SHIFT_OVERFLOW" as const],
    }
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort()}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={defaults}
        currentConfig={testConfig}
        currentShift={testShift}
        initialProposal={acceptedProposal}
        {...lifecycleCallbacks}
      />
    )

    expect(
      screen.getByText("Warnings acknowledged with the accepted plan.")
    ).toBeInTheDocument()
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Start production run" })
    ).toBeEnabled()
  })

  it("uses the published immutable config without fabricating stage-fit assertions", async () => {
    const user = userEvent.setup()
    const publishConfig = vi.fn()
    const createShift = vi.fn()
    const createSchedule = vi.fn(async () => testSchedule)
    const { container } = render(
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
        {...lifecycleCallbacks}
      />
    )

    expect(screen.queryByText(/stage-fit assertion/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Pulse duration")).not.toBeInTheDocument()
    expect(container.querySelector('input[type="datetime-local"]')).toBeNull()

    await user.click(screen.getByRole("button", { name: "Compute schedule" }))
    expect(publishConfig).not.toHaveBeenCalled()
    expect(createShift).not.toHaveBeenCalled()
    expect(createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        schedulerConfigId: testConfig.id,
        productionShiftId: testShift.id,
      })
    )
  })

  it("routes missing production configuration to the dedicated setup view", async () => {
    const user = userEvent.setup()
    const onOpenConfiguration = vi.fn()
    const publishConfig = vi.fn()
    const createSchedule = vi.fn()
    const production = makeTestProductionPort({
      publishConfig,
      createSchedule,
    })
    render(
      <SchedulingWorkspace
        production={production}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={defaults}
        currentConfig={null}
        canManage
        onOpenConfiguration={onOpenConfiguration}
        onScheduleChanged={lifecycleCallbacks.onScheduleChanged}
        onStarted={lifecycleCallbacks.onStarted}
      />
    )

    expect(screen.getByText("Setup required")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Open configuration" }))
    expect(onOpenConfiguration).toHaveBeenCalledOnce()
    expect(publishConfig).not.toHaveBeenCalled()
    expect(createSchedule).not.toHaveBeenCalled()
  })

  it("updates the existing shift and recomputes when shift settings are saved", async () => {
    const user = userEvent.setup()
    const createShift = vi.fn()
    const updateShift = vi.fn(async () => ({
      productionShift: {
        ...testShift,
        effectiveFolderCount: 3,
        version: testShift.version + 1,
      },
      supersededScheduleRunId: testSchedule.scheduleRunId,
      replayed: false,
    }))
    const createSchedule = vi.fn(async () => testSchedule)
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort({
          createShift,
          updateShift,
          createSchedule,
        })}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={defaults}
        currentConfig={testConfig}
        currentShift={testShift}
        initialProposal={testSchedule}
        {...lifecycleCallbacks}
      />
    )

    await user.click(screen.getByRole("button", { name: "Edit shift" }))
    expect(
      screen.getByRole("dialog", { name: "Shift settings" })
    ).toBeInTheDocument()
    const folders = screen.getByLabelText("Folding team")
    await user.clear(folders)
    await user.type(folders, "3")
    expect(createShift).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Save & recompute" }))

    expect(createShift).not.toHaveBeenCalled()
    expect(updateShift).toHaveBeenCalledWith(
      expect.objectContaining({
        productionShiftId: testShift.id,
        effectiveFolderCount: 3,
        expectedVersion: testShift.version,
      })
    )
    expect(createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ productionShiftId: testShift.id })
    )
    expect(
      await screen.findByRole("button", { name: "Accept plan" })
    ).toBeEnabled()
    expect(
      screen.queryByRole("dialog", { name: "Shift settings" })
    ).not.toBeInTheDocument()
  })

  it("keeps shift settings open when the authoritative update fails", async () => {
    const user = userEvent.setup()
    const createSchedule = vi.fn()
    const updateShift = vi.fn(async () => {
      throw new RequestFailure({
        kind: "conflict",
        code: "PRODUCTION_SHIFT_VERSION_CONFLICT",
        message: "The shift changed. Refresh and try again.",
        status: 409,
      })
    })
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort({ updateShift, createSchedule })}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={defaults}
        currentConfig={testConfig}
        currentShift={testShift}
        initialProposal={testSchedule}
        {...lifecycleCallbacks}
      />
    )

    await user.click(screen.getByRole("button", { name: "Edit shift" }))
    const folders = screen.getByLabelText("Folding team")
    await user.clear(folders)
    await user.type(folders, "3")
    screen.getByRole("button", { name: "Save & recompute" }).click()

    await waitFor(() => expect(updateShift).toHaveBeenCalledOnce())
    expect(createSchedule).not.toHaveBeenCalled()
    expect(
      screen.getByRole("dialog", { name: "Shift settings" })
    ).toBeInTheDocument()
    expect(
      (
        await screen.findAllByText(
          "Shift settings changed after this page loaded. The latest shift has been loaded; review it before continuing."
        )
      ).length
    ).toBeGreaterThan(0)
  })

  it("dismisses uncommitted sheet edits and restores trigger focus", async () => {
    const user = userEvent.setup()
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
        {...lifecycleCallbacks}
      />
    )

    const trigger = screen.getByRole("button", { name: "Edit shift" })
    await user.click(trigger)
    const folders = screen.getByLabelText("Folding team")
    await user.clear(folders)
    await user.type(folders, "3")
    await user.keyboard("{Escape}")

    expect(
      screen.queryByRole("dialog", { name: "Shift settings" })
    ).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(
      screen.getByRole("button", { name: "Accept plan" })
    ).toBeInTheDocument()

    await user.click(trigger)
    expect(screen.getByLabelText("Folding team")).toHaveValue(2)
  })

  it("marks a computed plan dirty after an explicit priority change", async () => {
    const user = userEvent.setup()
    const setPriority = vi.fn(async () => ({
      entityId: testOrders[1]!.id,
      version: 2,
      replayed: false,
    }))
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort({ setPriority })}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={defaults}
        currentConfig={testConfig}
        currentShift={testShift}
        initialProposal={testSchedule}
        {...lifecycleCallbacks}
      />
    )

    await user.click(screen.getByRole("tab", { name: /^Orders/ }))
    expect(screen.getByText("Northwind Hotel")).toBeVisible()
    expect(screen.getByText("Camila Reed")).toBeVisible()
    await user.click(
      screen.getByRole("switch", { name: "Prioritize order C-1002" })
    )
    expect(setPriority).toHaveBeenCalledOnce()
    expect(
      await screen.findByRole("button", { name: "Recompute schedule" })
    ).toBeInTheDocument()
  })

  it("reconciles priority for a newly refreshed eligible order", async () => {
    const user = userEvent.setup()
    const production = makeTestProductionPort()
    const baseProps = {
      production,
      idempotency: testIdempotency,
      locationId: testShift.locationId,
      defaults,
      currentConfig: testConfig,
      currentShift: testShift,
      initialProposal: testSchedule,
      ...lifecycleCallbacks,
    }
    const { rerender } = render(
      <SchedulingWorkspace {...baseProps} orders={testOrders} />
    )
    const priorityArrival = {
      ...testOrders[0]!,
      id: "00000000-0000-4000-8000-000000000098",
      externalOrderId: "C-1098",
      identity: {
        displayNumber: "C-1098",
        customerDisplayName: "Priority Customer",
      },
      priority: true,
      version: 1,
    }

    rerender(
      <SchedulingWorkspace
        {...baseProps}
        orders={[...testOrders, priorityArrival]}
      />
    )
    await user.click(screen.getByRole("tab", { name: /^Orders/ }))

    expect(
      await screen.findByRole("switch", {
        name: "Prioritize order C-1098",
      })
    ).toBeChecked()
  })

  it("starts only a server-accepted plan and awaits the refresh handoff", async () => {
    const user = userEvent.setup()
    const acceptedProposal = {
      ...structuredClone(testSchedule),
      status: "accepted" as const,
      acceptedAt: "2026-08-01T13:45:00.000Z",
      acceptedBy: "00000000-0000-4000-8000-000000000090",
    }
    const startSchedule = vi.fn(async () => ({
      scheduleRunId: acceptedProposal.scheduleRunId,
      productionRunId: "00000000-0000-4000-8000-000000000021",
      productionBatchIds: ["00000000-0000-4000-8000-000000000030"],
      queueVersion: 1,
      startedAt: "2026-08-01T14:00:00.000Z",
      replayed: false,
    }))
    let releaseRefresh!: () => void
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseRefresh = resolve
        })
    )
    render(
      <SchedulingWorkspace
        production={makeTestProductionPort({ startSchedule })}
        idempotency={testIdempotency}
        locationId={testShift.locationId}
        orders={testOrders}
        defaults={defaults}
        currentConfig={testConfig}
        currentShift={testShift}
        shiftSelection={testShiftSelection}
        initialProposal={acceptedProposal}
        canManage
        onScheduleChanged={vi.fn(async () => undefined)}
        onStarted={refresh}
      />
    )

    await user.click(
      screen.getByRole("button", { name: "Start production run" })
    )
    expect(startSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleRunId: acceptedProposal.scheduleRunId,
        expectedOutputPlanHash: acceptedProposal.outputPlanHash,
      })
    )
    expect(screen.getByRole("button", { name: "Starting…" })).toBeDisabled()
    releaseRefresh()
    expect(
      await screen.findByRole("button", { name: "Start production run" })
    ).toBeEnabled()
  })
})
