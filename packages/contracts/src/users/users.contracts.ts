import { z } from 'zod';

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

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;
export type UserMutationResult = z.infer<typeof userMutationResultSchema>;
