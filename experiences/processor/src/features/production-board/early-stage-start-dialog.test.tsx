import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { EarlyStageStartDialog } from "./early-stage-start-dialog.view"
import {
  testBoard,
  testWorkspace,
} from "../../../test/fixtures/production.fixture"

describe("early stage start dialog", () => {
  it("puts the planned-time deviation in plain floor language", async () => {
    const user = userEvent.setup()
    const stage = structuredClone(testBoard.batches[0]!.stages[3]!)
    stage.plannedStartAt = "2026-08-01T14:19:00.000Z"
    const onConfirm = vi.fn()

    render(
      <EarlyStageStartDialog
        stage={stage}
        timing={{
          plannedStartAt: stage.plannedStartAt,
          plannedEndAt: stage.plannedEndAt,
          observedAt: "2026-08-01T14:00:00.000Z",
          remainingMilliseconds: 19 * 60_000,
        }}
        referenceAt={testBoard.asOf}
        timezone={testWorkspace.location.timezone}
        busy={false}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
      />
    )

    expect(
      screen.getByRole("alertdialog", {
        name: "Start Folding & packaging now?",
      })
    ).toHaveTextContent("19 min from now")
    expect(
      screen.getByText(/original plan will not change/)
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Start now" }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
