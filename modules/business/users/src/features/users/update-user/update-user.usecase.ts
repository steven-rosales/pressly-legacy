import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { isCommandContextValid, result, type Result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { hashUserCommand } from '../../../foundations/language/command-identity/user-command-identity.policy.ts';
import type { UserCommandResult } from '../../../foundations/language/command-identity/user-command-result.model.ts';
import { userProfileFields } from '../../../foundations/language/users/user-profile.policy.ts';
import { projectUserProfile } from '../../../foundations/language/users/user-profile.projection.ts';
import {
  updateUserFailure,
  type UpdateUserFailure,
} from './update-user.failure.ts';
import type { UpdateUserCommand } from './update-user.model.ts';
import type { UpdateUserRepository } from './update-user.port.ts';

export type UpdateUser = (
  command: UpdateUserCommand,
) => Promise<Result<UserCommandResult, UpdateUserFailure>>;

const throwUserUpdatePersistenceFailure = (cause: unknown): never => {
  throw mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'user_update_failed',
      message: 'The user could not be updated.',
      safeMessage: 'The user could not be updated.',
      status: 503,
      cause: unknownCause,
    }),
  );
};

export const makeUpdateUser = (deps: {
  repo: UpdateUserRepository;
  clock: Clock;
}): UpdateUser =>
  async function updateUser(command) {
    if (
      command.businessId.trim() === '' ||
      command.idempotencyKey.trim() === '' ||
      !isCommandContextValid(command.context) ||
      command.userId.trim() === '' ||
      command.expectedVersion < 1 ||
      Object.keys(command.changes).length === 0
    )
      return result.err(updateUserFailure.invalidCommand());

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

        await operations.lockUser(command.businessId, command.userId);
        const current = await operations.loadUser(
          command.businessId,
          command.userId,
        );

        if (current === null) return { kind: 'not_found' as const };
        if (current.version !== command.expectedVersion)
          return { kind: 'version_conflict' as const };

        const authorityFields = userProfileFields.filter(
          (field) => field in command.changes,
        );
        const nextVersion = current.version + 1;

        await operations.updateUser({
          businessId: command.businessId,
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
          businessId: command.businessId,
          idempotencyKey: command.idempotencyKey,
          commandHash,
          context: command.context,
          value,
          now,
        });
        await operations.signalDuplicateContacts({
          businessId: command.businessId,
          userId: command.userId,
          profile: { ...projectUserProfile(current), ...command.changes },
          now,
        });

        return { kind: 'ok' as const, value };
      });

      switch (outcome.kind) {
        case 'ok':
          return result.ok(outcome.value);
        case 'not_found':
          return result.err(updateUserFailure.notFound());
        case 'version_conflict':
          return result.err(updateUserFailure.versionConflict());
        case 'idempotency_conflict':
          return result.err(updateUserFailure.idempotencyConflict());
      }
    } catch (error) {
      return throwUserUpdatePersistenceFailure(error);
    }
  };
