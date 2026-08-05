import type { Database } from '@pressly/db/client';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import type { ReconcileSourceLocationBindingsRepository } from './reconcile-source-location-bindings.port.ts';

export const makePostgresReconcileSourceLocationBindingsRepository = (
  db: Database,
): ReconcileSourceLocationBindingsRepository => ({
  loadAll: async () => {
    const rows = await db
      .select()
      .from(webhookIngestion.sourceLocationBindings);
    return rows.map((row) => ({
      source: row.source,
      externalLocationId: row.externalLocationId,
      locationId: row.locationId,
      isActive: row.isActive,
    }));
  },

  insert: async (bindings, now) => {
    if (bindings.length === 0) return;
    await db.insert(webhookIngestion.sourceLocationBindings).values(
      bindings.map((binding) => ({
        ...binding,
        createdAt: now,
        updatedAt: now,
      })),
    );
  },
});
