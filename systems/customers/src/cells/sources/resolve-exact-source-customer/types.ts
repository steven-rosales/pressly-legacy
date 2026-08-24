import type { JsonValue } from '@pressly/codec';
import type { CommandContext } from '@pressly/cells/command-context';
import type { CustomerReferenceV1 } from '../../../contracts/customer-reference-v1.ts';
import type { CustomerProfile } from '../../../model/customer.ts';

export const resolveExactSourceCustomerOperationId =
  'customers.resolve-exact-source-customer.v1' as const;

export type ResolveExactSourceCustomerCommand = Readonly<{
  businessId: string;
  source: string;
  externalUserId: string;
  profile: CustomerProfile;
  revision: Readonly<{
    at: Date;
    hash: string;
    adapterVersion: string;
    observedAt: Date;
    normalizedPayload: JsonValue;
  }>;
  idempotencyKey: string;
  context: CommandContext;
  now: Date;
}>;

export type ResolveExactSourceCustomerResult = Readonly<{
  customer: CustomerReferenceV1;
  created: boolean;
}>;

export type ResolveExactSourceCustomerExpectedFailure =
  | Readonly<{
      kind: 'conflict';
      code: 'canonical_source_user_business_conflict';
    }>
  | Readonly<{
      kind: 'conflict';
      code: 'user_idempotency_conflict';
    }>;

export type ResolveExactSourceCustomerRepository = Readonly<{
  transaction: <Value>(
    work: (
      resolve: (command: ResolveExactSourceCustomerCommand) => Promise<
        | Readonly<{
            kind: 'success';
            value: ResolveExactSourceCustomerResult;
          }>
        | Readonly<{
            kind: 'failure';
            failure: ResolveExactSourceCustomerExpectedFailure;
          }>
      >,
    ) => Promise<Value>,
  ) => Promise<Value>;
}>;
