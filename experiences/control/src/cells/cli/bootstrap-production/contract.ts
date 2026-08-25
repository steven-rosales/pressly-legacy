import type { CliJsonValue } from "../../../cli/model.ts"
import {
  cliJsonValueSchema,
  defineAdminCliContract,
} from "../../../cli/model.ts"
import { z } from "zod"

export const commandInputSchema = z
  .object({
    file: z.string().min(1),
    actorId: z.uuid(),
    idempotencyKey: z.string().min(8).max(200),
    dryRun: z.boolean(),
  })
  .strict()

export type ProductionBootstrapCliInput = z.output<typeof commandInputSchema>

export type BootstrapAuthorityResult = Readonly<{
  status: "converged" | "rejected"
  mode: "apply" | "dry_run"
  applied: boolean
  [key: string]: CliJsonValue
}>

export const authorityResultSchema: z.ZodType<BootstrapAuthorityResult> = z
  .object({
    status: z.enum(["converged", "rejected"]),
    mode: z.enum(["apply", "dry_run"]),
    applied: z.boolean(),
  })
  .catchall(cliJsonValueSchema)

export type ProductionBootstrapCliOutput = Readonly<{
  location: BootstrapAuthorityResult
  production: BootstrapAuthorityResult
  sourceLocationBindings: BootstrapAuthorityResult
}>

export const outputSchema: z.ZodType<ProductionBootstrapCliOutput> = z
  .object({
    location: authorityResultSchema,
    production: authorityResultSchema,
    sourceLocationBindings: authorityResultSchema,
  })
  .strict()

export const contract = defineAdminCliContract({
  label: "control.cli-bootstrap-production.v2",
  input: commandInputSchema,
  output: outputSchema,
})
