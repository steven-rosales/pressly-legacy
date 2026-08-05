import type { Database } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import type { ResolveSourceLocation } from './resolve-source-location.port.ts';

export const makePostgresResolveSourceLocationRepository =
  (db: Database): ResolveSourceLocation =>
  async ({ source, externalLocationId }) => {
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
  };
