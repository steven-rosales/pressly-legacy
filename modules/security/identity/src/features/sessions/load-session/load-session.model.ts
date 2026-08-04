import type { Principal } from '@pressly/auth/authentication';
import type { PrincipalAttributes } from '@pressly/auth/authorization';

export type LoadedSession = Readonly<{
  principal: Principal;
  principalAttributes: PrincipalAttributes;
}>;
