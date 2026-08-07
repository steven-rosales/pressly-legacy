import type { PrincipalAttributes } from '@pressly/auth/authorization';

export type ResolveProductionVisibilityInput = Readonly<{
  principalAttributes: PrincipalAttributes;
}>;

export type ProductionLocationVisibility = readonly string[] | null;
