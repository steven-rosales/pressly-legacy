import type { CellOutcome } from '@pressly/cells';
import { canonicalSha256 } from '@pressly/codec/node';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  projectCustomerProfile,
  type CustomerCommandResult,
} from '../../../model/customer.ts';
import { decideUpdateCustomer, validateUpdateCustomer } from './decide.ts';
import type {
  UpdateCustomerClock,
  UpdateCustomerCommand,
  UpdateCustomerExpectedFailure,
  UpdateCustomerRepository,
} from './types.ts';

export const updateCustomerCommandHash = (
  command: UpdateCustomerCommand,
): string => canonicalSha256(command);

export type UpdateCustomerDependencies = Readonly<{
  repo: UpdateCustomerRepository;
  clock: UpdateCustomerClock;
}>;

export type ExecuteUpdateCustomer = (
  command: UpdateCustomerCommand,
) => Promise<CellOutcome<CustomerCommandResult, UpdateCustomerExpectedFailure>>;

export const makeExecuteUpdateCustomer = (
  dependencies: UpdateCustomerDependencies,
): ExecuteUpdateCustomer =>
  async function executeUpdateCustomer(command) {
    const expectedFailure = validateUpdateCustomer(command);
    if (expectedFailure !== null)
      return { kind: 'failure', failure: expectedFailure };

    try {
      const commandHash = updateCustomerCommandHash(command);
      const now = dependencies.clock.now();
      const outcome = await dependencies.repo.transaction(
        async (repository) => {
          await repository.lockCommand(command.idempotencyKey);
          const receipt = await repository.loadCommandReceipt(
            command.idempotencyKey,
          );
          if (receipt !== null)
            return receipt.commandHash === commandHash
              ? {
                  kind: 'ok' as const,
                  value: { ...receipt.result, replayed: true },
                }
              : {
                  kind: 'failure' as const,
                  failure: {
                    kind: 'conflict' as const,
                    code: 'user_idempotency_conflict' as const,
                  },
                };

          await repository.lockCustomer(command.businessId, command.userId);
          const current = await repository.loadCustomer(
            command.businessId,
            command.userId,
          );
          const decision = decideUpdateCustomer(current, command);
          if (decision.kind === 'reject')
            return { kind: 'failure' as const, failure: decision.failure };
          if (current === null)
            return {
              kind: 'failure' as const,
              failure: {
                kind: 'not_found' as const,
                code: 'user_not_found' as const,
              },
            };

          await repository.updateCustomer({
            businessId: command.businessId,
            userId: command.userId,
            changes: command.changes,
            authorityFields: decision.authorityFields,
            nextVersion: decision.nextVersion,
            now,
          });

          const value = {
            userId: command.userId,
            version: decision.nextVersion,
            replayed: false,
          };
          await repository.saveCommandReceipt({
            businessId: command.businessId,
            idempotencyKey: command.idempotencyKey,
            commandHash,
            context: command.context,
            value,
            now,
          });
          await repository.signalDuplicateContacts({
            businessId: command.businessId,
            userId: command.userId,
            profile: { ...projectCustomerProfile(current), ...command.changes },
            now,
          });

          return { kind: 'ok' as const, value };
        },
      );

      return outcome.kind === 'ok'
        ? { kind: 'success', value: outcome.value }
        : { kind: 'failure', failure: outcome.failure };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'user_update_failed',
          message: 'The user could not be updated.',
          safeMessage: 'The user could not be updated.',
          status: 503,
          cause,
        }),
      );
    }
  };
