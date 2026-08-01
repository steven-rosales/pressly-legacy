import type { CommandContext } from '@pressly/kernel';

export type OrderMutationResult = Readonly<{
  orderId: string;
  fulfillmentId: string;
  version: number;
  replayed: boolean;
}>;

export type AuditedOrderCommand<ReasonCode extends string> = Readonly<{
  businessId: string;
  idempotencyKey: string;
  context: CommandContext;
  reasonCode: ReasonCode;
  reasonNote: string | null;
}>;

export type OrderClockPort = Readonly<{ now: () => Date }>;
