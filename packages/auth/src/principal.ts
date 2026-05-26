import type { IdentityKind } from './identity.ts';
import type { Role } from './permission.ts';

export type Principal = Readonly<{
  identityId: string;
  kind: IdentityKind;
  displayName: string;
  roles: readonly Role[];
  email?: string;
  sessionId?: string;
  sessionIssuedAt?: Date;
  sessionExpiresAt?: Date;
}>;

export const principalLabel = (principal: Principal): string =>
  principal.email ?? principal.displayName;
