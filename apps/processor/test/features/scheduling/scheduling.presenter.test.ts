import { describe, expect, it } from "vitest"
import {
  formatZonedDateTimeInput,
  zonedDateTimeInputToIso,
} from "@/features/scheduling/scheduling.presenter"

describe("location-local scheduling inputs", () => {
  it("round-trips an operator wall time through the location timezone", () => {
    const local = formatZonedDateTimeInput(
      "2026-08-01T14:00:00.000Z",
      "America/Chicago"
    )
    expect(local).toBe("2026-08-01T09:00")
    expect(zonedDateTimeInputToIso(local, "America/Chicago")).toBe(
      "2026-08-01T14:00:00.000Z"
    )
  })

  it("rejects a wall time skipped by daylight-saving transition", () => {
    expect(() =>
      zonedDateTimeInputToIso("2026-03-08T02:30", "America/Chicago")
    ).toThrow("does not exist")
  })
})
