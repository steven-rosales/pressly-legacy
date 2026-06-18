import { z } from 'zod';

export const authRoleSchema = z.enum([
  'owner',
  'admin',
  'operator',
  'customer',
  'driver',
  'service',
  'developer',
  'ci',
]);

export const authIdentityKindSchema = z.enum(['human', 'service']);

export const authPermissionSchema = z.enum([
  'auth:session:read',
  'auth:session:revoke',
  'auth:user:manage',
  'pricing:read',
  'pricing:plan',
  'pricing:publish',
  'pricing:rollback',
]);

export const loginRequestSchema = z
  .object({
    email: z.email(),
    password: z.string().min(8),
  })
  .strict();

export const authPrincipalSchema = z
  .object({
    identityId: z.uuid(),
    displayName: z.string().min(1),
    email: z.email().optional(),
    roles: z.array(authRoleSchema).min(1),
  })
  .strict();

export const loginResultSchema = z
  .object({
    accessToken: z.string().min(32),
    expiresAt: z.iso.datetime(),
    principal: authPrincipalSchema,
  })
  .strict();

export const sessionResultSchema = z
  .object({
    principal: authPrincipalSchema,
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const logoutResultSchema = z
  .object({ revoked: z.literal(true) })
  .strict();
