import { isCommandContextValid, result } from '@pressly/kernel';
import { hashUserCommand } from '../user-command-idempotency.policy.ts';
import { userError } from '../user.error.ts';
import { userProfileFields } from '../user-profile.policy.ts';
import type { CreateUser, UserClockPort } from '../users.port.ts';
import type { CreateUserRepository } from './create-user.port.ts';

export const makeCreateUser =
  (deps: { repo: CreateUserRepository; clock: UserClockPort }): CreateUser =>
  async (command) => {
    if (
      command.idempotencyKey.trim() === '' ||
      !isCommandContextValid(command.context)
    )
      return result.err(
        userError(
          'USER_IDEMPOTENCY_KEY_REQUIRED',
          'An idempotency key is required to create a user.',
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

        const created = await operations.createUser({
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
          idempotencyKey: command.idempotencyKey,
          commandHash,
          context: command.context,
          value,
          now,
        });
        await operations.signalDuplicateContacts({
          userId: created.id,
          profile: command.profile,
          now,
        });
        return { kind: 'ok' as const, value };
      });
      if (outcome.kind === 'ok') return result.ok(outcome.value);
      return result.err(
        userError(
          'USER_IDEMPOTENCY_CONFLICT',
          'The idempotency key belongs to a different user command.',
        ),
      );
    } catch (error) {
      return result.err(
        userError(
          'USER_CREATE_FAILED',
          'The user could not be created.',
          503,
          error,
        ),
      );
    }
  };
