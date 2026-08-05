import { type Database } from '@pressly/db/client';
import { runDatabaseOperation } from '../../../../foundations/adapters/postgres/database-operation/database-operation.adapter.ts';
import { loadAuthorizedActor } from '../../../../foundations/adapters/postgres/workforce-actor-read/workforce-actor-read.repo.ts';
import { loadMemberDetail } from '../../../../foundations/adapters/postgres/workforce-member-read/workforce-member-read.repo.ts';
import {
  targetLocationForActor,
  targetRole,
} from '../../../../foundations/language/workforce-authority/workforce-membership-authorization.policy.ts';
import type { GetWorkforceMemberStore } from './get-workforce-member.port.ts';

export const makeGetWorkforceMemberStore = (
  db: Database,
): GetWorkforceMemberStore => ({
  detail: async (input) =>
    runDatabaseOperation(async () =>
      db.transaction(async (tx) => {
        const actor = await loadAuthorizedActor(tx, {
          actor: input.actor,
          businessId: input.businessId,
          now: input.now,
          requireMfa: false,
        });
        if (actor.status === 'rejected') return actor;
        const member = await loadMemberDetail(tx, input);
        if (member === null) return { status: 'rejected', reason: 'not_found' };
        if (
          actor.role === 'manager' &&
          (targetRole(member) !== 'operator' ||
            targetLocationForActor(member, actor.locationIds) === null)
        )
          return {
            status: 'rejected',
            reason: 'manager_target_forbidden',
          };
        return { status: 'found', member };
      }),
    ),
});
