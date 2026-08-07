import type { Database } from '@pressly/db/client';
import { lte } from '@pressly/db/query';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import type { PurgeExpiredWebhookReceiptsRepository } from './purge-expired-webhook-receipts.port.ts';

export const makePostgresPurgeExpiredWebhookReceiptsRepository =
  (db: Database): PurgeExpiredWebhookReceiptsRepository =>
  async (expiresAtOrBefore) => {
    const deleted = await db
      .delete(webhookIngestion.webhookReceiptQuarantine)
      .where(
        lte(
          webhookIngestion.webhookReceiptQuarantine.expiresAt,
          expiresAtOrBefore,
        ),
      )
      .returning({ id: webhookIngestion.webhookReceiptQuarantine.id });
    return deleted.length;
  };
