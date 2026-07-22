import { isCommandContextValid, result } from '@pressly/kernel';
import { userError } from '../user.error.ts';
import type { ObserveUserSource } from '../users.port.ts';
import type { ObserveUserSourceRepository } from './observe-user-source.port.ts';
import { decideUserSourceUpdate } from './observe-user-source.policy.ts';

export const makeObserveUserSource =
  (repo: ObserveUserSourceRepository): ObserveUserSource =>
  async (command) => {
    if (
      command.source.trim() === '' ||
      command.externalUserId.trim() === '' ||
      !isCommandContextValid(command.context) ||
      !/^[a-f0-9]{64}$/.test(command.revision.hash) ||
      command.revision.adapterVersion.trim() === ''
    )
      return result.err(
        userError(
          'USER_SOURCE_OBSERVATION_INVALID',
          'The user source observation is incomplete.',
          400,
        ),
      );

    try {
      const outcome = await repo.transaction(async (operations) => {
        await operations.lockSource(command);
        const current = await operations.loadSource(command);
        if (current === null) {
          const created = await operations.createSourceUser(command);
          return {
            kind: 'ok' as const,
            value: {
              userId: created.id,
              version: created.version,
              outcome: 'created' as const,
            },
          };
        }

        const decision = decideUserSourceUpdate({
          current,
          observation: command,
        });
        if (decision.tag === 'err') return { kind: 'source_conflict' as const };
        if (decision.value.kind === 'replay' || decision.value.kind === 'stale')
          return {
            kind: 'ok' as const,
            value: {
              userId: current.user.id,
              version: current.user.version,
              outcome:
                decision.value.kind === 'replay'
                  ? ('replayed' as const)
                  : ('stale' as const),
            },
          };

        await operations.applySourceUser({
          current,
          observation: command,
          changes: decision.value.changes,
          nextProfile: decision.value.nextProfile,
          nextVersion: decision.value.nextVersion,
          missingAuthorities: decision.value.missingAuthorities,
        });
        return {
          kind: 'ok' as const,
          value: {
            userId: current.user.id,
            version: decision.value.nextVersion,
            outcome: 'applied' as const,
          },
        };
      });
      if (outcome.kind === 'ok') return result.ok(outcome.value);
      if (outcome.kind === 'source_conflict')
        return result.err(
          userError(
            'USER_SOURCE_REVISION_CONFLICT',
            'The source sent different user data for the same revision.',
          ),
        );
      return result.err(
        userError(
          'USER_SOURCE_OBSERVATION_FAILED',
          'The user source observation could not be applied.',
          409,
        ),
      );
    } catch (error) {
      return result.err(
        userError(
          'USER_SOURCE_OBSERVATION_FAILED',
          'The user source observation could not be stored.',
          503,
          error,
        ),
      );
    }
  };
