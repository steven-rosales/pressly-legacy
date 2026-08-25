import type { PrincipalAttributes } from '../../../model/authorization/public.ts';

export type ResolveProductionVisibilityInput = Readonly<{
  principalAttributes: PrincipalAttributes;
}>;

export type ProductionLocationVisibility = readonly string[];
