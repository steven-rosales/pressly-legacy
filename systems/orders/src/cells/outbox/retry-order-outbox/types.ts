export const retryOrderOutboxOperationId =
  'orders.retry-order-outbox.v1' as const;

export type RetryOrderOutboxCommand = Readonly<{
  eventId: string;
  workerId: string;
  availableAt: Date;
  errorCode: string;
  errorMessage: string;
}>;

export type RetryOrderOutboxResult = Readonly<{ retried: boolean }>;

export type RetryOrderOutboxExpectedFailure = never;

export type RetryOrderOutboxRepository = Readonly<{
  retry: (command: RetryOrderOutboxCommand) => Promise<boolean>;
}>;
