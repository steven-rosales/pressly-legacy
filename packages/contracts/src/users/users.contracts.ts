import { z } from 'zod';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';

export const userProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).nullable(),
    lastName: z.string().trim().min(1).nullable(),
    businessName: z.string().trim().min(1).nullable(),
    phone: z.string().trim().min(1).nullable(),
    email: z.string().email().nullable(),
  })
  .strict();

export const canonicalUserParamsSchema = z
  .object({
    userId: z.string().uuid(),
  })
  .strict();

export const createUserRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    profile: userProfileSchema,
  })
  .strict();

export const updateUserRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    expectedVersion: z.number().int().positive(),
    changes: userProfileSchema
      .partial()
      .extend({ active: z.boolean().optional() }),
  })
  .strict();

export const userMutationResultSchema = z
  .object({
    userId: z.string().uuid(),
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export const controlCustomerListQuerySchema = z
  .object({
    query: z.string().trim().max(120).optional(),
    active: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    cursor: z.string().trim().min(1).max(1_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const controlCustomerSchema = userProfileSchema
  .extend({
    id: z.uuid(),
    version: z.number().int().positive(),
    active: z.boolean(),
    displayName: z.string().trim().min(1).max(240),
    possibleDuplicateCount: z.number().int().nonnegative(),
    createdAt: utcIsoStringSchema,
    updatedAt: utcIsoStringSchema,
  })
  .strict();

export const controlCustomerListSchema = z
  .object({
    items: z.array(controlCustomerSchema),
    nextCursor: z.string().trim().min(1).nullable(),
  })
  .strict();

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type UserMutationResult = z.infer<typeof userMutationResultSchema>;
export type ControlCustomer = z.infer<typeof controlCustomerSchema>;
export type ControlCustomerList = z.infer<typeof controlCustomerListSchema>;
export type ControlCustomerListQuery = z.infer<
  typeof controlCustomerListQuerySchema
>;
