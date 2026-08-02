import { isCommandContextValid, result } from '@pressly/kernel';
import {
  conflictError,
  databaseError,
  mapUnknownError,
  validationError,
  type AppError,
} from '@pressly/errors';
import { hashUserCommand } from '../command-execution/user-command-idempotency.policy.ts';
import type { UserClockPort } from '../command-execution/user-command.port.ts';
import { userProfileFields } from '../user-profile/user-profile.policy.ts';
import type { CreateUser, CreateUserRepository } from './create-user.port.ts';

const invalidCreateUserCommand = (): AppError =>
  validationError({
    code: 'user_idempotency_key_required',
    message: 'An idempotency key is required to create a user.',
    safeMessage: 'An idempotency key is required to create a user.',
  });

const userIdempotencyConflict = (): AppError =>
  conflictError({
    code: 'user_idempotency_conflict',
    message: 'The idempotency key belongs to a different user command.',
    safeMessage: 'The idempotency key belongs to a different user command.',
  });

const userCreateFailed = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'user_create_failed',
      message: 'The user could not be created.',
      safeMessage: 'The user could not be created.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeCreateUser =
  (deps: { repo: CreateUserRepository; clock: UserClockPort }): CreateUser =>
  async (command) => {
    if (
      command.businessId.trim() === '' ||
      command.idempotencyKey.trim() === '' ||
      !isCommandContextValid(command.context)
    )
      return result.err(invalidCreateUserCommand());
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

        const created = await operations.createUser({
          businessId: command.businessId,
          profile: command.profile,
          authorityFields: userProfileFields,
          now,
        });
        const value = {
          userId: created.id,
          version: created.version,
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
          userId: created.id,
          profile: command.profile,
          now,
        });
        return { kind: 'ok' as const, value };
      });
      if (outcome.kind === 'ok') return result.ok(outcome.value);
      return result.err(userIdempotencyConflict());
    } catch (error) {
      return result.err(userCreateFailed(error));
    }
  };
