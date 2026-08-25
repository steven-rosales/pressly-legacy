import { decode } from "@pressly/cells"
import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  defineProcessorQueryContract,
  type ProductionQueryFailure,
} from "./production-query.ts"

describe("Processor Production-query expected-failure contract", () => {
  it("adds a finite application reason while preserving the arbitrary upstream wire diagnostic", () => {
    const contract = defineProcessorQueryContract({
      operation: "processor.contract-proof.v1",
      decodeInput: () => decode.valid({}),
      encodeInput: () => ({}),
      outputSchema: z.object({ ok: z.boolean() }).strict(),
    })
    const serialized = {
      tag: "ProductionFailure" as const,
      kind: "future_upstream_kind",
      code: "future_upstream_code",
      message: "A future Production diagnostic was preserved.",
      safeMessage: "The request could not be completed.",
      classification: "future_classification",
      details: { future: true },
    }
    const failure: ProductionQueryFailure = {
      ...serialized,
      reason: "upstream_production_query_failed",
    }

    expect(contract.failure.decode(serialized)).toEqual({
      kind: "valid",
      value: failure,
    })
    expect(contract.failure.encode(failure)).toEqual(serialized)
  })
})
