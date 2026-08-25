import type { WorkforceRole } from '../../../model/language/workforce/workforce.model.ts';

export type EffectiveAccessGrantFact = Readonly<{
  businessId: string;
  businessName: string;
  role: WorkforceRole;
  scopeKind: 'business' | 'location';
  scopeId: string;
}>;

export type EffectiveAccessGrantFacts = Readonly<{
  grants: readonly EffectiveAccessGrantFact[];
}>;
