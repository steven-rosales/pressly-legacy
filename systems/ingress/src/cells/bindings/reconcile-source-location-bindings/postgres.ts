import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import type { IngressSchema } from '../../../schema/ingress.ts';
import type {
  ReconcileSourceLocationBindingsRepository,
  ReconcileSourceLocationBindingsTransaction,
} from './types.ts';

const transactionRepository = (
  db: PostgresExecutor,
  ingress: Pick<IngressSchema, 'sourceLocationBindings'>,
): ReconcileSourceLocationBindingsTransaction => ({
  loadAll: async () => {
    const rows = await db.select().from(ingress.sourceLocationBindings);
    return rows.map((row) => ({
      source: row.source,
      externalLocationId: row.externalLocationId,
      locationId: row.locationId,
      isActive: row.isActive,
    }));
  },
  insert: async (bindings, now) => {
    if (bindings.length === 0) return;
    await db.insert(ingress.sourceLocationBindings).values(
      bindings.map((binding) => ({
        ...binding,
        createdAt: now,
        updatedAt: now,
      })),
    );
  },
});

export const makeReconcileSourceLocationBindingsPostgresRepository = (
  db: PostgresDatabase,
  ingress: Pick<IngressSchema, 'sourceLocationBindings'>,
): ReconcileSourceLocationBindingsRepository => ({
  transaction: (work) =>
    db.transaction((transaction) =>
      work(transactionRepository(transaction, ingress)),
    ),
});
