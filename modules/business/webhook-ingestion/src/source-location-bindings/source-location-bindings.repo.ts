import { and, eq, webhookIngestion, type Database } from '@pressly/db';
import type { SourceLocationBindingsRepository } from './source-location-bindings.port.ts';

export const makeSourceLocationBindingsRepository = (
  db: Database,
): SourceLocationBindingsRepository => ({
  resolve: async ({ source, externalLocationId }) => {
    const [binding] = await db
      .select({
        locationId: webhookIngestion.sourceLocationBindings.locationId,
      })
      .from(webhookIngestion.sourceLocationBindings)
      .where(
        and(
          eq(webhookIngestion.sourceLocationBindings.source, source),
          eq(
            webhookIngestion.sourceLocationBindings.externalLocationId,
            externalLocationId,
          ),
          eq(webhookIngestion.sourceLocationBindings.isActive, true),
        ),
      )
      .limit(1);
    return binding?.locationId ?? null;
  },

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
