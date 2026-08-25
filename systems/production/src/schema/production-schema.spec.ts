import { getTableName, SQL } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { productionTestSchema as expectedProduction } from '../testing/production-schema.spec-support.ts';
import { describe, expect, it } from 'vitest';

import { makeProductionSchema } from './production-schema.ts';

const tableNames = [
  'productionLocations',
  'orderDemands',
  'productionShifts',
  'productionOrders',
  'productionShiftSelections',
  'productionShiftSelectedOrders',
  'bags',
  'stations',
  'machines',
  'schedulerConfigs',
  'scheduleRuns',
  'productionRuns',
  'productionBatches',
  'productionBatchOrders',
  'stageRuns',
  'stageMachineAssignments',
  'productionOrderStageAttempts',
  'workEvents',
] as const;

type ProductionTableName = (typeof tableNames)[number];
type ProductionTable = Parameters<typeof getTableConfig>[0];

const expectedTables: Readonly<Record<ProductionTableName, ProductionTable>> = {
  productionLocations: expectedProduction.productionLocations,
  orderDemands: expectedProduction.orderDemands,
  productionShifts: expectedProduction.productionShifts,
  productionOrders: expectedProduction.productionOrders,
  productionShiftSelections: expectedProduction.productionShiftSelections,
  productionShiftSelectedOrders:
    expectedProduction.productionShiftSelectedOrders,
  bags: expectedProduction.bags,
  stations: expectedProduction.stations,
  machines: expectedProduction.machines,
  schedulerConfigs: expectedProduction.schedulerConfigs,
  scheduleRuns: expectedProduction.scheduleRuns,
  productionRuns: expectedProduction.productionRuns,
  productionBatches: expectedProduction.productionBatches,
  productionBatchOrders: expectedProduction.productionBatchOrders,
  stageRuns: expectedProduction.stageRuns,
  stageMachineAssignments: expectedProduction.stageMachineAssignments,
  productionOrderStageAttempts: expectedProduction.productionOrderStageAttempts,
  workEvents: expectedProduction.workEvents,
};

const dialect = new PgDialect();

const sqlDescriptor = (value: unknown): unknown => {
  if (!(value instanceof SQL)) return value ?? null;
  const query = dialect.sqlToQuery(value);
  return {
    sql: query.sql.replace(/\s+/g, ' ').trim(),
    params: query.params,
  };
};

const tableDescriptor = (table: ProductionTable) => {
  const config = getTableConfig(table);
  return {
    name: getTableName(table),
    schema: config.schema ?? null,
    enableRls: config.enableRLS,
    columns: config.columns.map((column) => ({
      name: column.name,
      sqlType: column.getSQLType(),
      dataType: column.dataType,
      columnType: column.columnType,
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      default: sqlDescriptor(column.default),
      primary: column.primary,
      isUnique: column.isUnique,
      uniqueName: column.uniqueName,
      uniqueType: column.uniqueType ?? null,
      enumValues: column.enumValues ?? null,
    })),
    indexes: config.indexes.map((candidate) => ({
      name: candidate.config.name,
      unique: candidate.config.unique,
      only: candidate.config.only,
      method: candidate.config.method,
      columns: candidate.config.columns.map((column) => ({
        name: 'name' in column ? column.name : null,
        sql: 'name' in column ? null : sqlDescriptor(column),
        order: 'indexConfig' in column ? column.indexConfig.order : null,
        nulls: 'indexConfig' in column ? column.indexConfig.nulls : null,
        opClass: 'indexConfig' in column ? column.indexConfig.opClass : null,
      })),
      where: sqlDescriptor(candidate.config.where),
      with: candidate.config.with ?? null,
      concurrently: candidate.config.concurrently ?? false,
    })),
    checks: config.checks.map((check) => ({
      name: check.name,
      value: sqlDescriptor(check.value),
    })),
    foreignKeys: config.foreignKeys.map((foreignKey) => {
      const reference = foreignKey.reference();
      return {
        name: foreignKey.getName(),
        columns: reference.columns.map((column) => column.name),
        foreignTable: getTableName(reference.foreignTable),
        foreignColumns: reference.foreignColumns.map((column) => column.name),
        onUpdate: foreignKey.onUpdate ?? 'no action',
        onDelete: foreignKey.onDelete ?? 'no action',
      };
    }),
    primaryKeys: config.primaryKeys.map((primaryKey) => ({
      name: primaryKey.getName(),
      columns: primaryKey.columns.map((column) => column.name),
    })),
    uniqueConstraints: config.uniqueConstraints.map((constraint) => ({
      name: constraint.getName(),
      columns: constraint.columns.map((column) => column.name),
      nullsNotDistinct: constraint.nullsNotDistinct,
    })),
  };
};

describe('Production schema ownership factory', () => {
  const target = makeProductionSchema();

  it('returns exactly the enum and eighteen Production-owned tables', () => {
    expect(Object.keys(target)).toEqual([
      'stageBoundaryProvenanceEnum',
      ...tableNames,
    ]);
    expect(target.stageBoundaryProvenanceEnum.enumName).toBe(
      'stage_boundary_provenance',
    );
    expect(target.stageBoundaryProvenanceEnum.enumValues).toEqual([
      'live_observed',
      'operator_reported',
      'not_recorded',
    ]);
  });

  it.each(tableNames)(
    'produces the complete expected %s descriptor',
    (tableName) => {
      expect(tableDescriptor(target[tableName])).toEqual(
        tableDescriptor(expectedTables[tableName]),
      );
    },
  );
});
