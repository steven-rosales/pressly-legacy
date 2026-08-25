import {
  loadImmutableMigrationHistory,
  presslyMigrationHistoryBaseline,
  verifyFreshMigrationLedger,
  verifyUpgradeMigrationLedger,
  type MigrationLedgerVerification,
} from './migration-ledger.ts';
import type { PostgresExecutor } from './client.ts';

export type PresslyMigrationRunnerDependencies = Readonly<{
  db: PostgresExecutor;
  migrationsDirectory: string;
  readAppliedCount: () => Promise<number>;
  apply: () => Promise<void>;
}>;

export const runPresslyMigrations = async (
  dependencies: PresslyMigrationRunnerDependencies,
): Promise<MigrationLedgerVerification> => {
  await loadImmutableMigrationHistory(dependencies.migrationsDirectory);

  const before = await dependencies.readAppliedCount();
  if (before > 0)
    await verifyUpgradeMigrationLedger({
      db: dependencies.db,
      migrationsDirectory: dependencies.migrationsDirectory,
      expectedAppliedCount: before,
    });

  await dependencies.apply();

  return before === 0
    ? verifyFreshMigrationLedger({
        db: dependencies.db,
        migrationsDirectory: dependencies.migrationsDirectory,
      })
    : verifyUpgradeMigrationLedger({
        db: dependencies.db,
        migrationsDirectory: dependencies.migrationsDirectory,
        expectedAppliedCount: presslyMigrationHistoryBaseline.entryCount,
      });
};
