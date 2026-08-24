import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import type { IngressSchema } from '../../../schema/ingress.ts';
import type { ResolveSourceLocationRepository } from './types.ts';

export const makeResolveSourceLocationPostgresRepository = (
  db: PostgresDatabase,
  ingress: Pick<IngressSchema, 'sourceLocationBindings'>,
): ResolveSourceLocationRepository => ({
  resolve: async ({ source, externalLocationId }) => {
    const [binding] = await db
      .select({ locationId: ingress.sourceLocationBindings.locationId })
      .from(ingress.sourceLocationBindings)
      .where(
        and(
          eq(ingress.sourceLocationBindings.source, source),
          eq(
            ingress.sourceLocationBindings.externalLocationId,
            externalLocationId,
          ),
          eq(ingress.sourceLocationBindings.isActive, true),
        ),
      )
      .limit(1);
    return binding?.locationId ?? null;
  },
});
