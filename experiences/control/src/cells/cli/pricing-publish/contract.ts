import {
  defineAdminCliContract,
  pricingChangeInputSchema,
  pricingPlanSchema,
  pricingPublishResultSchema,
} from "../../../cli/model.ts"
import { z } from "zod"

export const publishInputSchema = pricingChangeInputSchema.extend({
  stage: z.enum(["plan", "publish"]),
  confirmed: z.boolean(),
})

export const publishOutputSchema = z.discriminatedUnion("tag", [
  z.object({ tag: z.literal("plan"), value: pricingPlanSchema }).strict(),
  z
    .object({ tag: z.literal("published"), value: pricingPublishResultSchema })
    .strict(),
])

export const publishContract = defineAdminCliContract({
  label: "control.cli-pricing-publish.v1",
  input: publishInputSchema,
  output: publishOutputSchema,
})
