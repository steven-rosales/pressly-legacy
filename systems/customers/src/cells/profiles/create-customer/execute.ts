import type { CellOutcome } from '@pressly/cells';
import { canonicalSha256 } from '@pressly/codec/node';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  customerProfileFields,
  type CustomerCommandResult,
} from '../../../model/customer.ts';
import { validateCreateCustomer } from './decide.ts';
import type {
  CreateCustomerClock,
  CreateCustomerCommand,
  CreateCustomerExpectedFailure,
  CreateCustomerRepository,
} from './types.ts';

export const createCustomerCommandHash = (
  command: CreateCustomerCommand,
): string => canonicalSha256(command);

export type CreateCustomerDependencies = Readonly<{
  repo: CreateCustomerRepository;
  clock: CreateCustomerClock;
}>;

export type ExecuteCreateCustomer = (
  command: CreateCustomerCommand,
) => Promise<CellOutcome<CustomerCommandResult, CreateCustomerExpectedFailure>>;

export const makeExecuteCreateCustomer = (
  dependencies: CreateCustomerDependencies,
): ExecuteCreateCustomer =>
  async function executeCreateCustomer(command) {
    const expectedFailure = validateCreateCustomer(command);
    if (expectedFailure !== null)
      return { kind: 'failure', failure: expectedFailure };

    try {
      const commandHash = createCustomerCommandHash(command);
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
              : { kind: 'idempotency_conflict' as const };

          const created = await repository.createCustomer({
            businessId: command.businessId,
            profile: command.profile,
            authorityFields: customerProfileFields,
            now,
          });
          const value = {
            userId: created.id,
            version: created.version,
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
            userId: created.id,
            profile: command.profile,
            now,
          });

          return { kind: 'ok' as const, value };
        },
      );

      return outcome.kind === 'ok'
        ? { kind: 'success', value: outcome.value }
        : {
            kind: 'failure',
            failure: {
              kind: 'conflict',
              code: 'user_idempotency_conflict',
            },
          };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'user_create_failed',
          message: 'The user could not be created.',
          safeMessage: 'The user could not be created.',
          status: 503,
          cause,
        }),
      );
    }
  };
