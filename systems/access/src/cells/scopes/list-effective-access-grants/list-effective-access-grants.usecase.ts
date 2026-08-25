import type { Clock } from '@pressly/time';
import type { EffectiveAccessGrantFacts } from './list-effective-access-grants.model.ts';
import type { ListEffectiveAccessGrantsStore } from './list-effective-access-grants.port.ts';

export type ListEffectiveAccessGrants = (
  identityId: string,
) => Promise<EffectiveAccessGrantFacts>;

export const makeListEffectiveAccessGrants = (dependencies: {
  store: ListEffectiveAccessGrantsStore;
  clock: Clock;
}): ListEffectiveAccessGrants =>
  async function listEffectiveAccessGrants(identityId) {
    const grants = await dependencies.store.listEffectiveGrants({
      identityId,
      now: dependencies.clock.now(),
    });
    return { grants: grants.map((grant) => ({ ...grant })) };
  };
