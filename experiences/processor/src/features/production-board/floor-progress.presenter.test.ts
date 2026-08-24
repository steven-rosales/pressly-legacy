import { describe, expect, it } from "vitest"
import {
  describeFinishedConsequences,
  describeFloorProgressChange,
  forwardMilestones,
  milestoneForBatch,
  targetForMilestone,
  targetRequiresMachines,
} from "./floor-progress.presenter"
import { testBoard } from "../../../test/fixtures/production.fixture"

describe("floor progress presenter", () => {
  it("derives the canonical batch milestone without duplicating batch state", () => {
    const batch = structuredClone(testBoard.batches[0]!)
    expect(milestoneForBatch(batch)).toBe("waiting_to_sort")

    batch.stages[0]!.status = "completed"
    batch.stages[1]!.status = "started"
    expect(milestoneForBatch(batch)).toBe("washing_started")

    batch.stages[1]!.status = "completed"
    batch.stages[2]!.status = "completed"
    batch.stages[3]!.status = "completed"
    expect(milestoneForBatch(batch)).toBe("finished")
  })

  it("only offers forward states and maps the selected state to a stage target", () => {
    const batch = structuredClone(testBoard.batches[0]!)
    batch.stages[0]!.status = "completed"

    expect(forwardMilestones(batch)).toEqual([
      "washing_started",
      "washing_completed",
      "drying_started",
      "drying_completed",
      "folding_packaging_started",
      "finished",
    ])
    expect(targetForMilestone("folding_packaging_started")).toBe(
      "folding_packaging_started"
    )
  })

  it("describes the exact forward effects in floor language", () => {
    expect(
      describeFloorProgressChange(
        testBoard.batches[0]!,
        targetForMilestone("folding_packaging_started")!
      )
    ).toBe(
      "This will mark Sorting completed, Washing completed, Drying completed, then Folding & packaging started."
    )
  })

  it("names terminal order, bag, run, and shift consequences", () => {
    expect(
      describeFinishedConsequences(testBoard.batches[0]!, testBoard.batches)
    ).toBe(
      "This finishes 2 orders and 5 bags. Because this is the last unfinished batch, the production run and shift will close."
    )
  })

  it("requires current machines only for active washer and dryer targets", () => {
    expect(targetRequiresMachines(targetForMilestone("washing_started")!)).toBe(
      true
    )
    expect(
      targetRequiresMachines(targetForMilestone("washing_completed")!)
    ).toBe(false)
    expect(
      targetRequiresMachines(targetForMilestone("folding_packaging_started")!)
    ).toBe(false)
  })
})
