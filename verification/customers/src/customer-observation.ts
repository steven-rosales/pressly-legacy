import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, eq } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';

export type CustomerObservationAliases = ReadonlyMap<string, string>;

export const normalizeCustomerValue = (
  value: unknown,
  aliases: CustomerObservationAliases,
): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return aliases.get(value) ?? value;
  if (Array.isArray(value))
    return value.map((item) => normalizeCustomerValue(item, aliases));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      normalizeCustomerValue(item, aliases),
    ]),
  );
};

export const normalizeCustomerOutcome = (
  outcome: unknown,
  aliases: CustomerObservationAliases,
): unknown => {
  if (outcome === null || typeof outcome !== 'object')
    return normalizeCustomerValue(outcome, aliases);
  return normalizeCustomerValue(outcome, aliases);
};

const by =
  <Value>(key: (value: Value) => string) =>
  (left: Value, right: Value): number =>
    key(left).localeCompare(key(right));

export const observeCustomerState = async (
  database: PostgresDatabase,
  aliases: CustomerObservationAliases,
) => {
  const userRows = await database
    .select({
      id: presslyPostgresOwnerSchemas.customers.users.id,
      businessId: presslyPostgresOwnerSchemas.customers.users.businessId,
      version: presslyPostgresOwnerSchemas.customers.users.version,
      active: presslyPostgresOwnerSchemas.customers.users.active,
      firstName: presslyPostgresOwnerSchemas.customers.users.firstName,
      lastName: presslyPostgresOwnerSchemas.customers.users.lastName,
      businessName: presslyPostgresOwnerSchemas.customers.users.businessName,
      phone: presslyPostgresOwnerSchemas.customers.users.phone,
      email: presslyPostgresOwnerSchemas.customers.users.email,
      createdAt: presslyPostgresOwnerSchemas.customers.users.createdAt,
      updatedAt: presslyPostgresOwnerSchemas.customers.users.updatedAt,
    })
    .from(presslyPostgresOwnerSchemas.customers.users)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.customers.users.createdAt),
      asc(presslyPostgresOwnerSchemas.customers.users.id),
    );
  const authorityRows = await database
    .select({
      userId: presslyPostgresOwnerSchemas.customers.userFieldAuthorities.userId,
      fieldName:
        presslyPostgresOwnerSchemas.customers.userFieldAuthorities.fieldName,
      authority:
        presslyPostgresOwnerSchemas.customers.userFieldAuthorities.authority,
      source: presslyPostgresOwnerSchemas.customers.userFieldAuthorities.source,
      updatedAt:
        presslyPostgresOwnerSchemas.customers.userFieldAuthorities.updatedAt,
    })
    .from(presslyPostgresOwnerSchemas.customers.userFieldAuthorities);
  const duplicateRows = await database
    .select({
      userId:
        presslyPostgresOwnerSchemas.customers.userDuplicateCandidates.userId,
      candidateUserId:
        presslyPostgresOwnerSchemas.customers.userDuplicateCandidates
          .candidateUserId,
      reason:
        presslyPostgresOwnerSchemas.customers.userDuplicateCandidates.reason,
      status:
        presslyPostgresOwnerSchemas.customers.userDuplicateCandidates.status,
      resolvedAt:
        presslyPostgresOwnerSchemas.customers.userDuplicateCandidates
          .resolvedAt,
      createdAt:
        presslyPostgresOwnerSchemas.customers.userDuplicateCandidates.createdAt,
      updatedAt:
        presslyPostgresOwnerSchemas.customers.userDuplicateCandidates.updatedAt,
    })
    .from(presslyPostgresOwnerSchemas.customers.userDuplicateCandidates);
  const receiptRows = await database
    .select({
      idempotencyKey:
        presslyPostgresOwnerSchemas.customers.userCommandReceipts
          .idempotencyKey,
      businessId:
        presslyPostgresOwnerSchemas.customers.userCommandReceipts.businessId,
      commandHash:
        presslyPostgresOwnerSchemas.customers.userCommandReceipts.commandHash,
      origin: presslyPostgresOwnerSchemas.customers.userCommandReceipts.origin,
      actorKind:
        presslyPostgresOwnerSchemas.customers.userCommandReceipts.actorKind,
      actorId:
        presslyPostgresOwnerSchemas.customers.userCommandReceipts.actorId,
      userId: presslyPostgresOwnerSchemas.customers.userCommandReceipts.userId,
      result: presslyPostgresOwnerSchemas.customers.userCommandReceipts.result,
      createdAt:
        presslyPostgresOwnerSchemas.customers.userCommandReceipts.createdAt,
    })
    .from(presslyPostgresOwnerSchemas.customers.userCommandReceipts);
  const sourceRows = await database
    .select({
      source: presslyPostgresOwnerSchemas.customers.userSourceLinks.source,
      externalUserId:
        presslyPostgresOwnerSchemas.customers.userSourceLinks.externalUserId,
      userId: presslyPostgresOwnerSchemas.customers.userSourceLinks.userId,
      linkCreatedAt:
        presslyPostgresOwnerSchemas.customers.userSourceLinks.createdAt,
      linkUpdatedAt:
        presslyPostgresOwnerSchemas.customers.userSourceLinks.updatedAt,
      sourceRevisionAt:
        presslyPostgresOwnerSchemas.customers.userSourceSnapshots
          .sourceRevisionAt,
      sourceRevisionHash:
        presslyPostgresOwnerSchemas.customers.userSourceSnapshots
          .sourceRevisionHash,
      adapterVersion:
        presslyPostgresOwnerSchemas.customers.userSourceSnapshots
          .adapterVersion,
      normalizedPayload:
        presslyPostgresOwnerSchemas.customers.userSourceSnapshots
          .normalizedPayload,
      observedAt:
        presslyPostgresOwnerSchemas.customers.userSourceSnapshots.observedAt,
      snapshotCreatedAt:
        presslyPostgresOwnerSchemas.customers.userSourceSnapshots.createdAt,
      snapshotUpdatedAt:
        presslyPostgresOwnerSchemas.customers.userSourceSnapshots.updatedAt,
    })
    .from(presslyPostgresOwnerSchemas.customers.userSourceLinks)
    .innerJoin(
      presslyPostgresOwnerSchemas.customers.userSourceSnapshots,
      eq(
        presslyPostgresOwnerSchemas.customers.userSourceSnapshots.sourceLinkId,
        presslyPostgresOwnerSchemas.customers.userSourceLinks.id,
      ),
    );

  const normalized = {
    customers: userRows.map((row) => normalizeCustomerValue(row, aliases)),
    fieldAuthorities: authorityRows.map((row) =>
      normalizeCustomerValue(row, aliases),
    ),
    duplicateCandidates: duplicateRows.map((row) =>
      normalizeCustomerValue(row, aliases),
    ),
    commandReceipts: receiptRows.map((row) =>
      normalizeCustomerValue(
        {
          ...row,
          commandHash: /^[a-f0-9]{64}$/.test(row.commandHash)
            ? `$sha256:${row.idempotencyKey}`
            : row.commandHash,
        },
        aliases,
      ),
    ),
    sourceEvidence: sourceRows.map((row) =>
      normalizeCustomerValue(row, aliases),
    ),
  };

  return {
    customers: normalized.customers.sort(
      by((row) => String(Reflect.get(row as object, 'id'))),
    ),
    fieldAuthorities: normalized.fieldAuthorities.sort(
      by(
        (row) =>
          `${String(Reflect.get(row as object, 'userId'))}:${String(Reflect.get(row as object, 'fieldName'))}`,
      ),
    ),
    duplicateCandidates: normalized.duplicateCandidates.sort(
      by(
        (row) =>
          `${String(Reflect.get(row as object, 'userId'))}:${String(Reflect.get(row as object, 'candidateUserId'))}:${String(Reflect.get(row as object, 'reason'))}`,
      ),
    ),
    commandReceipts: normalized.commandReceipts.sort(
      by((row) => String(Reflect.get(row as object, 'idempotencyKey'))),
    ),
    sourceEvidence: normalized.sourceEvidence.sort(
      by((row) => String(Reflect.get(row as object, 'externalUserId'))),
    ),
  };
};
