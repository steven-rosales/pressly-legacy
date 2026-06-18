import type { z } from 'zod';
import type {
  authIdentityKindSchema,
  authPermissionSchema,
  authRoleSchema,
  loginRequestSchema,
} from './auth.contracts.ts';

export type AuthIdentityKind = z.infer<typeof authIdentityKindSchema>;
export type AuthPermission = z.infer<typeof authPermissionSchema>;
export type AuthRole = z.infer<typeof authRoleSchema>;

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export type LoginCommand = Readonly<
  LoginRequest & {
    ipAddress?: string;
    userAgent?: string;
  }
>;

export type LoadSessionCommand = Readonly<{ bearerToken: string }>;

export type RevokeSessionCommand = Readonly<{ bearerToken: string }>;

export type BootstrapOwnerCommand = Readonly<{
  email: string;
  password: string;
  confirmation: string;
}>;

export type CreateSessionInput = Readonly<{
  identityId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
}>;

export type LoginAttemptInput = Readonly<{
  emailNormalized: string;
  identityId?: string;
  success: boolean;
  failureCode?: string;
  ipAddress?: string;
  userAgent?: string;
}>;

export type AuthAuditEventInput = Readonly<{
  actorIdentityId?: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}>;

export type CreateBootstrapOwnerInput = Readonly<{
  email: string;
  emailNormalized: string;
  passwordHash: string;
}>;

export type AuthorizeMiddlewareInput = Readonly<{
  action: AuthPermission;
  roles: readonly AuthRole[];
  freshSessionMaxAgeMinutes?: number;
}>;
