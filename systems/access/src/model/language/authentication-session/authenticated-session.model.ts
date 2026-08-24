import type { Role } from '../../authorization/public.ts';
import type { CustomerAudience } from '../../authentication/public.ts';

export type AuthenticatedPrincipal = Readonly<{
  identityId: string;
  displayName: string;
  email?: string;
  roles: readonly Role[];
}> &
  CustomerAudience;

export type AuthenticatedSession = Readonly<{
  accessToken: string;
  expiresAt: Date;
  principal: AuthenticatedPrincipal;
}>;
