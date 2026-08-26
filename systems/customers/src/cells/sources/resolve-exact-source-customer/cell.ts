import { defineOperation } from '@pressly/cells';
import { resolveExactSourceCustomerContract } from './contract.ts';
import { makeExecuteResolveExactSourceCustomer } from './execute.ts';
import { resolveExactSourceCustomerCommandHash } from './idempotency.ts';
import type { ResolveExactSourceCustomerRepository } from './types.ts';
import {
  resolveExactSourceCustomerOperationId,
  type ResolveExactSourceCustomerCommand,
  type ResolveExactSourceCustomerExpectedFailure,
  type ResolveExactSourceCustomerResult,
} from './types.ts';

export const resolveExactSourceCustomerCellDeclaration = defineOperation<
  ResolveExactSourceCustomerCommand,
  ResolveExactSourceCustomerResult,
  ResolveExactSourceCustomerExpectedFailure
>({
  kind: 'command',
  id: resolveExactSourceCustomerOperationId,
  authentication: 'none',
  contract: resolveExactSourceCustomerContract,
  consistency: {
    transaction: 'required',
    concurrency: 'partitioned',
    concurrencyKey: (input) => `${input.source}:${input.externalUserId}`,
  },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
    fingerprint: resolveExactSourceCustomerCommandHash,
  },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'customers.resolve_exact_source_customer' },
});

export const makeResolveExactSourceCustomerCell = (
  repository: ResolveExactSourceCustomerRepository,
) =>
  defineOperation(
    resolveExactSourceCustomerCellDeclaration,
    makeExecuteResolveExactSourceCustomer(repository),
  );
