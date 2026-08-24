import { z } from 'zod';

export const productionLocationParamsSchema = z
  .object({ locationId: z.string().min(1) })
  .strict();
export const publishSchedulerConfigCommandSchema = z
  .object({
    locationId: z.string().min(1),
    pulseMinutes: z.number().int().positive(),
    foldLbsPerFolderMinute: z.number().positive(),
    stageFitAssertion: z
      .object({
        sortingFits: z.literal(true),
        washingFits: z.literal(true),
        dryingFits: z.literal(true),
      })
      .strict(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const publishSchedulerConfigRequestSchema =
  publishSchedulerConfigCommandSchema.omit({ locationId: true });

export type PublishSchedulerConfigCommand = z.infer<
  typeof publishSchedulerConfigCommandSchema
>;
