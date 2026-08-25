import type { CellOutcome } from '@pressly/cells';
import {
  resolveExactSourceCustomerOperationId,
  type ResolveExactSourceCustomerCommand,
  type ResolveExactSourceCustomerExpectedFailure,
  type ResolveExactSourceCustomerResult,
} from '../cells/sources/resolve-exact-source-customer/types.ts';

export const resolveExactSourceCustomerV1CapabilityContract = Object.freeze({
  id: resolveExactSourceCustomerOperationId,
  version: 1,
  execution: 'owner-owned',
} as const);

export type ResolveExactSourceCustomerV1Capability = Readonly<{
  contract: typeof resolveExactSourceCustomerV1CapabilityContract;
  execute: (
    command: ResolveExactSourceCustomerCommand,
  ) => Promise<
    CellOutcome<
      ResolveExactSourceCustomerResult,
      ResolveExactSourceCustomerExpectedFailure
    >
  >;
}>;

export type {
  ResolveExactSourceCustomerCommand,
  ResolveExactSourceCustomerExpectedFailure,
  ResolveExactSourceCustomerResult,
} from '../cells/sources/resolve-exact-source-customer/types.ts';
