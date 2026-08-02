import { isCommandContextValid, result } from '@pressly/kernel';
import {
  conflictError,
  databaseError,
  mapUnknownError,
  notFoundError,
  validationError,
  type AppError,
} from '@pressly/errors';
import { hashUserCommand } from '../command-execution/user-command-idempotency.policy.ts';
import type { UserClockPort } from '../command-execution/user-command.port.ts';
import {
  userProfileFields,
  userProfileFrom,
} from '../user-profile/user-profile.policy.ts';
import type { UpdateUser, UpdateUserRepository } from './update-user.port.ts';

const invalidUserUpdate = (): AppError =>
  validationError({
    code: 'user_update_invalid',
    message: 'The user update is incomplete.',
    safeMessage: 'The user update is incomplete.',
  });

const userNotFound = (): AppError =>
  notFoundError({
    code: 'user_not_found',
    message: 'The user was not found.',
    safeMessage: 'The user was not found.',
  });

const userVersionConflict = (): AppError =>
  conflictError({
    code: 'user_version_conflict',
    message:
      'The user changed after this update was prepared. Refresh and try again.',
    safeMessage:
      'The user changed after this update was prepared. Refresh and try again.',
  });

const userIdempotencyConflict = (): AppError =>
  conflictError({
    code: 'user_idempotency_conflict',
    message: 'The idempotency key belongs to a different user command.',
    safeMessage: 'The idempotency key belongs to a different user command.',
  });

const userUpdateFailed = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'user_update_failed',
      message: 'The user could not be updated.',
      safeMessage: 'The user could not be updated.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeUpdateUser =
  (deps: { repo: UpdateUserRepository; clock: UserClockPort }): UpdateUser =>
  async (command) => {
    if (
      command.businessId.trim() === '' ||
      command.idempotencyKey.trim() === '' ||
      !isCommandContextValid(command.context) ||
      command.userId.trim() === '' ||
      command.expectedVersion < 1 ||
      Object.keys(command.changes).length === 0
    )
      return result.err(invalidUserUpdate());

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
          profile: { ...userProfileFrom(current), ...command.changes },
          now,
        });

        return { kind: 'ok' as const, value };
      });

      if (outcome.kind === 'ok') return result.ok(outcome.value);
      if (outcome.kind === 'not_found') return result.err(userNotFound());
      if (outcome.kind === 'version_conflict')
        return result.err(userVersionConflict());

      return result.err(userIdempotencyConflict());
    } catch (error) {
      return result.err(userUpdateFailed(error));
    }
  };
