import { isCommandContextValid, result } from '@pressly/kernel';
import { hashUserCommand } from '../user-command-idempotency.policy.ts';
import { userError } from '../user.error.ts';
import type { FollowUserSourceField, UserClockPort } from '../users.port.ts';
import type { FollowUserSourceFieldRepository } from './follow-user-source-field.port.ts';

export const makeFollowUserSourceField =
  (deps: {
    repo: FollowUserSourceFieldRepository;
    clock: UserClockPort;
  }): FollowUserSourceField =>
  async (command) => {
    if (
      command.idempotencyKey.trim() === '' ||
      !isCommandContextValid(command.context) ||
      command.userId.trim() === '' ||
      command.source.trim() === '' ||
      command.expectedVersion < 1
    )
      return result.err(
        userError(
          'USER_SOURCE_FIELD_INVALID',
          'The source-following request is incomplete.',
          400,
        ),
      );
    try {
      const commandHash = hashUserCommand(command);
      const now = deps.clock.now();
      const outcome = await deps.repo.transaction(async (operations) => {
        await operations.lockCommand(command.idempotencyKey);
        const receipt = await operations.loadCommandReceipt(
          command.idempotencyKey,
        );
        if (receipt !== null)
          return receipt.commandHash === commandHash
            ? {
                kind: 'ok' as const,
                value: { ...receipt.result, replayed: true },
              }
            : { kind: 'idempotency_conflict' as const };

        await operations.lockUser(command.userId);
        const current = await operations.loadUser(command.userId);
        if (current === null) return { kind: 'not_found' as const };
        if (current.version !== command.expectedVersion)
          return { kind: 'version_conflict' as const };
        if (
          !(await operations.sourceLinkExists({
            userId: command.userId,
            source: command.source,
          }))
        )
          return { kind: 'not_found' as const };

        const nextVersion = current.version + 1;
        await operations.followSourceField({
          userId: command.userId,
          field: command.field,
          source: command.source,
          nextVersion,
          now,
        });
        const value = {
          userId: command.userId,
          version: nextVersion,
          replayed: false,
        };
        await operations.saveCommandReceipt({
          idempotencyKey: command.idempotencyKey,
          commandHash,
          context: command.context,
          value,
          now,
        });
        return { kind: 'ok' as const, value };
      });
      if (outcome.kind === 'ok') return result.ok(outcome.value);
      if (outcome.kind === 'not_found')
        return result.err(
          userError(
            'USER_SOURCE_FIELD_NOT_FOUND',
            'The user or source field was not found.',
            404,
          ),
        );
      if (outcome.kind === 'version_conflict')
        return result.err(
          userError(
            'USER_VERSION_CONFLICT',
            'The user changed after this request was prepared. Refresh and try again.',
          ),
        );
      return result.err(
        userError(
          'USER_IDEMPOTENCY_CONFLICT',
          'The idempotency key belongs to a different user command.',
        ),
      );
    } catch (error) {
      return result.err(
        userError(
          'USER_SOURCE_FIELD_UPDATE_FAILED',
          'The source-following preference could not be changed.',
          503,
          error,
        ),
      );
    }
  };
