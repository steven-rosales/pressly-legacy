import { drizzle } from 'drizzle-orm/postgres-js';
import { pgTable, text } from 'drizzle-orm/pg-core';
import {
  type PostgresDatabase,
  type PostgresExecutor,
  type PostgresRuntime,
  type PostgresSchema,
  type PostgresTransaction,
  type TypedPostgresTransaction,
} from '../src/client.ts';
import { describe, expect, expectTypeOf, it } from 'vitest';

const widgets = pgTable('client_conformance_widgets', {
  id: text('id').primaryKey(),
});
const arbitrarySchema = { widgets };

const databaseFromRuntime = <Schema extends PostgresSchema>(
  runtime: PostgresRuntime<Schema>,
): PostgresDatabase => runtime.db;

const transactionFromTypedTransaction = <Schema extends PostgresSchema>(
  transaction: TypedPostgresTransaction<Schema>,
): PostgresTransaction => transaction;

const executorFromRuntime = <Schema extends PostgresSchema>(
  runtime: PostgresRuntime<Schema>,
): PostgresExecutor => runtime.db;

const executorFromTypedTransaction = <Schema extends PostgresSchema>(
  transaction: TypedPostgresTransaction<Schema>,
): PostgresExecutor => transaction;

const runReadOnlySnapshot = (
  database: PostgresDatabase,
): Promise<readonly unknown[]> =>
  database.transaction(
    async (transaction) => transaction.select().from(widgets),
    {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    },
  );

describe('schema-agnostic PostgreSQL capabilities', () => {
  it('accepts an arbitrary schema-typed Drizzle database at runtime', () => {
    const typedDatabase = drizzle.mock({ schema: arbitrarySchema });
    const database: PostgresDatabase = typedDatabase;
    const executor: PostgresExecutor = typedDatabase;

    expect(database).toBe(typedDatabase);
    expect(executor).toBe(typedDatabase);
    expect(database.select).toBeTypeOf('function');
    expect(database.selectDistinct).toBeTypeOf('function');
    expect(database.insert).toBeTypeOf('function');
    expect(database.update).toBeTypeOf('function');
    expect(database.delete).toBeTypeOf('function');
    expect(database.execute).toBeTypeOf('function');
    expect(database.transaction).toBeTypeOf('function');
  });

  it('proves generic runtime and transaction conformance at compile time', () => {
    expectTypeOf(databaseFromRuntime).toBeFunction();
    expectTypeOf(transactionFromTypedTransaction).toBeFunction();
    expectTypeOf(executorFromRuntime).toBeFunction();
    expectTypeOf(executorFromTypedTransaction).toBeFunction();
    expectTypeOf(runReadOnlySnapshot).toBeFunction();
  });
});
