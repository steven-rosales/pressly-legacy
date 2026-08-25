export const purgeExpiredWebhookReceiptsOperationId =
  'ingress.purge-expired-webhook-receipts.v1' as const;
export type PurgeExpiredWebhookReceiptsInput = Readonly<Record<string, never>>;
export type PurgeExpiredWebhookReceiptsResult = Readonly<{
  purgedCount: number;
}>;
export type PurgeExpiredWebhookReceiptsExpectedFailure = never;
export type PurgeExpiredWebhookReceiptsRepository = Readonly<{
  purge: (expiresAtOrBefore: Date) => Promise<number>;
}>;
export type PurgeExpiredWebhookReceiptsClock = Readonly<{ now: () => Date }>;
