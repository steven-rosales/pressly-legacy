import { isCommandContextValid, result } from '@pressly/kernel';
import { hashUserCommand } from '../user-command-idempotency.policy.ts';
import { userError } from '../user.error.ts';
import { userProfileFields, userProfileFrom } from '../user-profile.policy.ts';
import type { UpdateUser, UserClockPort } from '../users.port.ts';
import type { UpdateUserRepository } from './update-user.port.ts';

export const makeUpdateUser =
  (deps: { repo: UpdateUserRepository; clock: UserClockPort }): UpdateUser =>
  async (command) => {
    if (
      command.idempotencyKey.trim() === '' ||
      !isCommandContextValid(command.context) ||
      command.userId.trim() === '' ||
      command.expectedVersion < 1 ||
      Object.keys(command.changes).length === 0
    )
      return result.err(
        userError('USER_UPDATE_INVALID', 'The user update is incomplete.', 400),
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

        const authorityFields = userProfileFields.filter(
          (field) => field in command.changes,
        );
        const nextVersion = current.version + 1;
        await operations.updateUser({
          userId: command.userId,
          changes: command.changes,
          authorityFields,
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
        await operations.signalDuplicateContacts({
          userId: command.userId,
          profile: { ...userProfileFrom(current), ...command.changes },
          now,
        });
        return { kind: 'ok' as const, value };
      });
      if (outcome.kind === 'ok') return result.ok(outcome.value);
      if (outcome.kind === 'not_found')
        return result.err(
          userError('USER_NOT_FOUND', 'The user was not found.', 404),
        );
      if (outcome.kind === 'version_conflict')
        return result.err(
          userError(
            'USER_VERSION_CONFLICT',
            'The user changed after this update was prepared. Refresh and try again.',
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
          'USER_UPDATE_FAILED',
          'The user could not be updated.',
          503,
          error,
        ),
      );
    }
  };
