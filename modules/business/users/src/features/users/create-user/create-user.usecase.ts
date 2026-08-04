import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { isCommandContextValid, result, type Result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { hashUserCommand } from '../../../foundations/language/command-identity/user-command-identity.policy.ts';
import type { UserCommandResult } from '../../../foundations/language/command-identity/user-command-result.model.ts';
import { userProfileFields } from '../../../foundations/language/users/user-profile.policy.ts';
import {
  createUserFailure,
  type CreateUserFailure,
} from './create-user.failure.ts';
import type { CreateUserCommand } from './create-user.model.ts';
import type { CreateUserRepository } from './create-user.port.ts';

export type CreateUser = (
  command: CreateUserCommand,
) => Promise<Result<UserCommandResult, CreateUserFailure>>;

const throwUserCreatePersistenceFailure = (cause: unknown): never => {
  throw mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'user_create_failed',
      message: 'The user could not be created.',
      safeMessage: 'The user could not be created.',
      status: 503,
      cause: unknownCause,
    }),
  );
};

export const makeCreateUser = (deps: {
  repo: CreateUserRepository;
  clock: Clock;
}): CreateUser =>
  async function createUser(command) {
    if (
      command.businessId.trim() === '' ||
      command.idempotencyKey.trim() === '' ||
      !isCommandContextValid(command.context)
    )
      return result.err(createUserFailure.invalidCommand());

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

      return outcome.kind === 'ok'
        ? result.ok(outcome.value)
        : result.err(createUserFailure.idempotencyConflict());
    } catch (error) {
      return throwUserCreatePersistenceFailure(error);
    }
  };
