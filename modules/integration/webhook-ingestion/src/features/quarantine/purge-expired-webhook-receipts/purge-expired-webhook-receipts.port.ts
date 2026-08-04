import type { Ok } from '@pressly/kernel';

export type PurgeExpiredWebhookReceipts = () => Promise<
  Ok<Readonly<{ purgedCount: number }>>
>;
