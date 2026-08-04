import type { Role } from '@pressly/auth/authorization';

export type AuthenticatedPrincipal = Readonly<{
  identityId: string;
  displayName: string;
  email?: string;
  roles: readonly Role[];
}>;

export type AuthenticatedSession = Readonly<{
  accessToken: string;
  expiresAt: Date;
  principal: AuthenticatedPrincipal;
}>;
