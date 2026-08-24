export const deadLetterOrderOutboxOperationId =
  'orders.dead-letter-order-outbox.v1' as const;

export type DeadLetterOrderOutboxCommand = Readonly<{
  eventId: string;
  workerId: string;
  errorCode: string;
  errorMessage: string;
}>;

export type DeadLetterOrderOutboxResult = Readonly<{
  deadLettered: boolean;
}>;

export type DeadLetterOrderOutboxExpectedFailure = Readonly<{
  kind: 'validation';
  code: 'order_outbox_dead_letter_invalid';
  message: string;
}>;

export type DeadLetterOrderOutboxRepository = Readonly<{
  deadLetter: (input: {
    command: DeadLetterOrderOutboxCommand;
    now: Date;
  }) => Promise<boolean>;
}>;

export type DeadLetterOrderOutboxClock = Readonly<{ now: () => Date }>;
