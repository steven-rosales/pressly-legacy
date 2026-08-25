import type { EffectiveAccessGrantFact } from './list-effective-access-grants.model.ts';

export type ListEffectiveAccessGrantsStore = Readonly<{
  listEffectiveGrants: (input: {
    identityId: string;
    now: Date;
  }) => Promise<readonly EffectiveAccessGrantFact[]>;
}>;
