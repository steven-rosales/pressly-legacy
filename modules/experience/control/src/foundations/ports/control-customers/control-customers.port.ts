import type { Result } from '@pressly/kernel';
import type { ControlCommandContext } from '../../language/control-context/control-context.value.ts';
import type {
  ControlCustomerMutation,
  ControlCustomerSnapshot,
} from '../../language/control-customer/control-customer.model.ts';
import type { ControlCustomerProfile } from '../../language/control-customer/control-customer.value.ts';

export type ControlCustomerRejection = Readonly<{
  kind: 'customer_rejected';
  category:
    | 'validation'
    | 'authentication'
    | 'permission'
    | 'not_found'
    | 'conflict'
    | 'rate_limit';
  code: string;
  message: string;
  details?: Readonly<{
    currentVersion?: number;
    violations?: readonly string[];
  }>;
}>;

export type ControlCustomersPort = Readonly<{
  list: (input: {
    businessId: string;
    query: string | null;
    active: boolean | null;
    limit: number;
    cursor: string | null;
  }) => Promise<
    Result<
      Readonly<{
        items: readonly ControlCustomerSnapshot[];
        nextCursor: string | null;
      }>,
      ControlCustomerRejection
    >
  >;
  get: (input: {
    businessId: string;
    userId: string;
  }) => Promise<Result<ControlCustomerSnapshot, ControlCustomerRejection>>;
  create: (input: {
    businessId: string;
    idempotencyKey: string;
    context: ControlCommandContext;
    profile: ControlCustomerProfile;
  }) => Promise<Result<ControlCustomerMutation, ControlCustomerRejection>>;
  update: (input: {
    businessId: string;
    userId: string;
    idempotencyKey: string;
    expectedVersion: number;
    context: ControlCommandContext;
    changes: Partial<ControlCustomerProfile> & Readonly<{ active?: boolean }>;
  }) => Promise<Result<ControlCustomerMutation, ControlCustomerRejection>>;
}>;
