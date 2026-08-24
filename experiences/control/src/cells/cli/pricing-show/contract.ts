import {
  defineAdminCliContract,
  pricingCatalogSchema,
} from "../../../cli/model.ts"
import { z } from "zod"

export const showInputSchema = z
  .object({ serviceSlug: z.enum(["wash-fold", "dry-cleaning"]) })
  .strict()

export const showContract = defineAdminCliContract({
  label: "control.cli-pricing-show.v1",
  input: showInputSchema,
  output: pricingCatalogSchema,
})
