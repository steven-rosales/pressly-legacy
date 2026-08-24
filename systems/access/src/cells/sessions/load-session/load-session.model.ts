import type { Principal } from '../../../model/authentication/public.ts';
import type { PrincipalAttributes } from '../../../model/authorization/public.ts';

export type LoadedSession = Readonly<{
  principal: Principal;
  principalAttributes: PrincipalAttributes;
}>;
