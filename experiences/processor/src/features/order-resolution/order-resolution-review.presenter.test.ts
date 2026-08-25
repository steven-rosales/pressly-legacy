import { describe, expect, it } from "vitest"
import {
  toOrderResolutionCommitRequest,
  toOrderResolutionPreviewRequest,
  validateOrderResolutionReviewScope,
} from "./order-resolution-review.presenter"
import { reviewScope } from "./order-resolution-review.fixture"

describe("order resolution review presenter", () => {
  it("builds preview and commit requests without inventing candidate rules", () => {
    expect(toOrderResolutionPreviewRequest(reviewScope)).toEqual({
      filter: "all_due_before_cutoff",
      cutoff: "2026-06-30T03:59:59.999Z",
      reason: "processor_not_in_use",
      cursor: null,
      maxOrders: 250,
    })
    expect(
      toOrderResolutionCommitRequest(reviewScope, "b".repeat(64), null)
    ).toEqual({
      filter: "all_due_before_cutoff",
      cutoff: "2026-06-30T03:59:59.999Z",
      reason: "processor_not_in_use",
      cursor: null,
      maxOrders: 250,
      note: "Processor was offline during this period.",
      previewHash: "b".repeat(64),
    })
  })

  it("requires a reason, cutoff, and an explanatory note for Other", () => {
    expect(
      validateOrderResolutionReviewScope({
        ...reviewScope,
        reason: "",
      }).valid
    ).toBe(false)
    expect(
      validateOrderResolutionReviewScope({
        ...reviewScope,
        cutoff: "",
        cutoffDate: undefined,
      }).valid
    ).toBe(false)
    expect(
      validateOrderResolutionReviewScope({
        ...reviewScope,
        reason: "other",
        note: "  ",
      })
    ).toEqual({ valid: false, otherNoteMissing: true })
  })

  it("normalizes a blank optional note to null", () => {
    expect(
      toOrderResolutionCommitRequest(
        { ...reviewScope, note: "  " },
        "b".repeat(64),
        null
      )
    ).toMatchObject({ note: null })
  })
})
