import type { CommandContext } from '@pressly/cells/command-context';
import type { DirectCanonicalOrderInput } from '../../../model/canonical-order/model.ts';

export type CreateOrderReasonCode = 'new_customer_order' | 'recovery_entry';
export type CreateOrderCommand = DirectCanonicalOrderInput &
  Readonly<{
    businessId: string;
    idempotencyKey: string;
    context: CommandContext;
    reasonCode: CreateOrderReasonCode;
    reasonNote: string | null;
  }>;
export type CreateOrderExpectedFailure =
  | Readonly<{
      kind: 'validation';
      code: 'order_create_invalid';
      message: string;
    }>
  | Readonly<{
      kind: 'not_found';
      code: 'order_reference_not_found';
      message: string;
    }>
  | Readonly<{
      kind: 'conflict';
      code: 'order_idempotency_conflict';
      message: string;
    }>;
