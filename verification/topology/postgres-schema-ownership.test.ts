import { getTableName, is, SQL } from 'drizzle-orm';
import {
  getTableConfig,
  isPgEnum,
  PgDialect,
  PgTable,
  type AnyPgTable,
  type PgEnum,
} from 'drizzle-orm/pg-core';
import {
  presslyPostgresOwnerSchemas,
  presslyPostgresSchema,
} from '@pressly/topology/postgres-schema';
import * as presslyDrizzleSchema from '../../topology/pressly-drizzle-schema.ts';
import { describe, expect, it } from 'vitest';

const ownerNames = [
  'access',
  'customers',
  'ingress',
  'orders',
  'pricing',
  'production',
] as const;

type OwnerName = (typeof ownerNames)[number];
type SchemaEntry = AnyPgTable | PgEnum<[string, ...string[]]>;
type SchemaRecord = Readonly<Record<string, SchemaEntry>>;
type OwnerSchemaRecord = Readonly<Record<OwnerName, SchemaRecord>>;

const isTable = (value: unknown): value is AnyPgTable => is(value, PgTable);
const isSchemaEntry = (value: unknown): value is SchemaEntry =>
  isTable(value) || isPgEnum(value);

const schemaEntries = (source: object): SchemaRecord =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(source).filter((entry): entry is [string, SchemaEntry] =>
        isSchemaEntry(entry[1]),
      ),
    ),
  );

const topologyOwnerSchemas = presslyPostgresOwnerSchemas as OwnerSchemaRecord;
const topologySchema = schemaEntries(presslyPostgresSchema);
const dialect = new PgDialect();

const sorted = (values: readonly string[]): readonly string[] =>
  [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

const sqlDescriptor = (value: unknown): unknown => {
  if (!(value instanceof SQL)) return value ?? null;
  const query = dialect.sqlToQuery(value);
  return {
    sql: query.sql.replace(/\s+/g, ' ').trim(),
    params: query.params,
  };
};

const tableDescriptor = (table: AnyPgTable) => {
  const config = getTableConfig(table);
  return {
    name: getTableName(table),
    schema: config.schema ?? null,
    enableRls: config.enableRLS,
    columns: config.columns.map((column) => ({
      name: column.name,
      keyAsName: column.keyAsName,
      sqlType: column.getSQLType(),
      dataType: column.dataType,
      columnType: column.columnType,
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      default: sqlDescriptor(column.default),
      hasDefaultFn: column.defaultFn !== undefined,
      hasOnUpdateFn: column.onUpdateFn !== undefined,
      primary: column.primary,
      isUnique: column.isUnique,
      uniqueName: column.uniqueName ?? null,
      uniqueType: column.uniqueType ?? null,
      enumValues: column.enumValues ?? null,
      generated: column.generated ?? null,
      generatedIdentity: column.generatedIdentity ?? null,
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
    policies: config.policies.map((policy) => ({
      name: policy.name,
      as: policy.as ?? null,
      for: policy.for ?? null,
      to: policy.to ?? null,
      using: sqlDescriptor(policy.using),
      withCheck: sqlDescriptor(policy.withCheck),
    })),
  };
};

const enumDescriptor = (value: PgEnum<[string, ...string[]]>) => ({
  name: value.enumName,
  schema: value.schema ?? null,
  values: [...value.enumValues],
});

const schemaDescriptor = (value: SchemaEntry): unknown =>
  isTable(value)
    ? { kind: 'table', value: tableDescriptor(value) }
    : { kind: 'enum', value: enumDescriptor(value) };

const allOwnerEntries = (
  owners: OwnerSchemaRecord,
): readonly Readonly<{
  owner: OwnerName;
  key: string;
  value: SchemaEntry;
}>[] =>
  ownerNames.flatMap((owner) =>
    Object.entries(owners[owner]).map(([key, value]) => ({
      owner,
      key,
      value,
    })),
  );

type OwnedSchemaEntry = ReturnType<typeof allOwnerEntries>[number];
type OwnedTableEntry = Readonly<{
  owner: OwnerName;
  key: string;
  value: AnyPgTable;
}>;
type OwnedEnumEntry = Readonly<{
  owner: OwnerName;
  key: string;
  value: PgEnum<[string, ...string[]]>;
}>;

const isOwnedTableEntry = (entry: OwnedSchemaEntry): entry is OwnedTableEntry =>
  isTable(entry.value);

const isOwnedEnumEntry = (entry: OwnedSchemaEntry): entry is OwnedEnumEntry =>
  isPgEnum(entry.value);

const tableOwnerByName = (
  owners: OwnerSchemaRecord,
): ReadonlyMap<string, OwnerName> =>
  new Map(
    allOwnerEntries(owners)
      .filter(isOwnedTableEntry)
      .map((entry) => [getTableName(entry.value), entry.owner]),
  );

const crossOwnerForeignKeys = (owners: OwnerSchemaRecord) => {
  const ownerByTable = tableOwnerByName(owners);
  return allOwnerEntries(owners)
    .filter(isOwnedTableEntry)
    .flatMap((entry) =>
      getTableConfig(entry.value).foreignKeys.flatMap((foreignKey) => {
        const reference = foreignKey.reference();
        const foreignTable = getTableName(reference.foreignTable);
        const foreignOwner = ownerByTable.get(foreignTable);
        if (foreignOwner === undefined || foreignOwner === entry.owner)
          return [];
        return [
          {
            name: foreignKey.getName(),
            owner: entry.owner,
            table: getTableName(entry.value),
            columns: reference.columns.map((column) => column.name),
            foreignOwner,
            foreignTable,
            foreignColumns: reference.foreignColumns.map(
              (column) => column.name,
            ),
            onUpdate: foreignKey.onUpdate ?? 'no action',
            onDelete: foreignKey.onDelete ?? 'no action',
          },
        ];
      }),
    )
    .sort((left, right) => {
      const leftKey = `${left.table}.${left.name}`;
      const rightKey = `${right.table}.${right.name}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
};

const unownedForeignKeyTargets = (owners: OwnerSchemaRecord) => {
  const ownerByTable = tableOwnerByName(owners);
  return allOwnerEntries(owners)
    .filter(isOwnedTableEntry)
    .flatMap((entry) =>
      getTableConfig(entry.value).foreignKeys.flatMap((foreignKey) => {
        const foreignTable = getTableName(foreignKey.reference().foreignTable);
        return ownerByTable.has(foreignTable)
          ? []
          : [
              {
                name: foreignKey.getName(),
                table: getTableName(entry.value),
                foreignTable,
              },
            ];
      }),
    );
};

describe('PostgreSQL schema ownership composition', () => {
  it('exposes the identical composed objects as direct Drizzle discovery exports', () => {
    const drizzleSchema = schemaEntries(presslyDrizzleSchema);

    expect(sorted(Object.keys(presslyDrizzleSchema))).toEqual(
      sorted(Object.keys(topologySchema)),
    );
    for (const [key, value] of Object.entries(topologySchema))
      expect(drizzleSchema[key]).toBe(value);
  });

  it('assigns every schema key to exactly one complete owner', () => {
    expect(sorted(Object.keys(topologyOwnerSchemas))).toEqual(
      sorted(ownerNames),
    );

    const ownerEntries = allOwnerEntries(topologyOwnerSchemas);
    const ownerKeys = ownerEntries.map((entry) => entry.key);
    expect(new Set(ownerKeys).size).toBe(ownerKeys.length);
    expect(sorted(Object.keys(presslyPostgresSchema))).toEqual(
      sorted(ownerKeys),
    );
    expect(sorted(Object.keys(topologySchema))).toEqual(sorted(ownerKeys));

    for (const entry of ownerEntries)
      expect(topologySchema[entry.key]).toBe(entry.value);
  });

  it('describes every owner table and enum without duplicate owner keys', () => {
    const descriptors = allOwnerEntries(topologyOwnerSchemas)
      .map((entry) => ({
        owner: entry.owner,
        key: entry.key,
        descriptor: schemaDescriptor(entry.value),
      }))
      .sort((left, right) => {
        const leftKey = `${left.owner}.${left.key}`;
        const rightKey = `${right.owner}.${right.key}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });

    expect(descriptors).toHaveLength(
      allOwnerEntries(topologyOwnerSchemas).length,
    );
    expect(
      new Set(descriptors.map((entry) => `${entry.owner}.${entry.key}`)).size,
    ).toBe(descriptors.length);
  });

  it('keeps every table and enum physical name unique', () => {
    const entries = allOwnerEntries(topologyOwnerSchemas);
    const tables = entries.filter(isOwnedTableEntry);
    const enums = entries.filter(isOwnedEnumEntry);
    const tableNames = tables.map((entry) => getTableName(entry.value));
    const enumNames = enums.map((entry) => entry.value.enumName);

    expect(tables.length).toBeGreaterThan(0);
    expect(enums.length).toBeGreaterThan(0);
    expect(new Set(tableNames).size).toBe(tables.length);
    expect(new Set(enumNames).size).toBe(enums.length);
  });

  it('keeps every owned table structurally defined', () => {
    const tableConfigs = allOwnerEntries(topologyOwnerSchemas)
      .filter(isOwnedTableEntry)
      .map((entry) => getTableConfig(entry.value));

    expect(tableConfigs.every((config) => config.columns.length > 0)).toBe(
      true,
    );
  });

  it('contains zero cross-owner or unowned foreign-key targets', () => {
    const topologyCrossOwnerForeignKeys =
      crossOwnerForeignKeys(topologyOwnerSchemas);

    expect(topologyCrossOwnerForeignKeys).toEqual([]);
    expect(unownedForeignKeyTargets(topologyOwnerSchemas)).toEqual([]);
  });
});
