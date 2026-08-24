export const completeOrderOutboxOperationId =
  'orders.complete-order-outbox.v1' as const;

export type CompleteOrderOutboxCommand = Readonly<{
  eventId: string;
  workerId: string;
}>;

export type CompleteOrderOutboxResult = Readonly<{ completed: boolean }>;

export type CompleteOrderOutboxExpectedFailure = never;

export type CompleteOrderOutboxRepository = Readonly<{
  complete: (input: {
    command: CompleteOrderOutboxCommand;
    now: Date;
  }) => Promise<boolean>;
}>;

export type CompleteOrderOutboxClock = Readonly<{ now: () => Date }>;
