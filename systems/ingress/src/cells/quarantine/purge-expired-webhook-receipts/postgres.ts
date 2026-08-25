import type { PostgresDatabase } from '@pressly/postgres/client';
import { lte } from '@pressly/postgres/query';
import type { IngressSchema } from '../../../schema/ingress.ts';
import type { PurgeExpiredWebhookReceiptsRepository } from './types.ts';

export const makePurgeExpiredWebhookReceiptsPostgresRepository = (
  db: PostgresDatabase,
  ingress: Pick<IngressSchema, 'webhookReceiptQuarantine'>,
): PurgeExpiredWebhookReceiptsRepository => ({
  purge: async (expiresAtOrBefore) => {
    const deleted = await db
      .delete(ingress.webhookReceiptQuarantine)
      .where(lte(ingress.webhookReceiptQuarantine.expiresAt, expiresAtOrBefore))
      .returning({ id: ingress.webhookReceiptQuarantine.id });
    return deleted.length;
  },
});
