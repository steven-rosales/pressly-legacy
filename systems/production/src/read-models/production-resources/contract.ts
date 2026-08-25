import { z } from 'zod';

import {
  productionIdSchema,
  productionStageKindSchema,
} from '../production-order/contract.ts';
export const productionLocationSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    timezone: z.string().min(1),
    isActive: z.boolean(),
  })
  .strict();

export const productionStationSchema = z
  .object({
    id: productionIdSchema,
    locationId: z.string().min(1),
    kind: productionStageKindSchema,
    label: z.string().min(1),
    sortOrder: z.number().int().nonnegative(),
    isActive: z.boolean(),
  })
  .strict();

export const productionMachineSchema = z
  .object({
    id: productionIdSchema,
    stationKind: z.enum(['washing', 'drying']),
    label: z.string().min(1),
    effectiveCapacityLbs: z.number().positive(),
    active: z.boolean(),
  })
  .strict();

export type ProductionLocation = z.infer<typeof productionLocationSchema>;
export type ProductionStation = z.infer<typeof productionStationSchema>;
export type ProductionMachine = z.infer<typeof productionMachineSchema>;
