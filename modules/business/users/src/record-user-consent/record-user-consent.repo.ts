import {
  eq,
  users as schema,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import {
  lockUserKey,
  resolveStoredUserSource,
} from '../persistence/postgres-user.shared.ts';
import type {
  RecordUserConsentOperations,
  RecordUserConsentRepository,
} from './record-user-consent.port.ts';

const makeOperations = (tx: DatabaseExecutor): RecordUserConsentOperations => ({
  lockConsent: async (idempotencyKey) =>
    lockUserKey(tx, `users:consent:${idempotencyKey}`),
  loadConsent: async (idempotencyKey) => {
    const [row] = await tx
      .select({
        userId: schema.userConsents.userId,
        source: schema.userConsents.source,
        kind: schema.userConsents.consentKind,
        granted: schema.userConsents.granted,
        sourcePayloadHash: schema.userConsents.sourcePayloadHash,
      })
      .from(schema.userConsents)
      .where(eq(schema.userConsents.idempotencyKey, idempotencyKey))
      .limit(1);
    return row ?? null;
  },
  resolveSource: (identity) => resolveStoredUserSource(tx, identity),
  insertConsent: async ({ command, userId }) => {
    await tx.insert(schema.userConsents).values({
      userId,
      consentKind: command.kind,
      granted: command.granted,
      source: command.source,
      idempotencyKey: command.idempotencyKey,
      observedAt: command.observedAt,
      sourcePayloadHash: command.sourcePayloadHash,
    });
    return { userId, replayed: false };
  },
});

export const makePostgresRecordUserConsentRepository = (
  db: Database,
): RecordUserConsentRepository => ({
  transaction: (work) => db.transaction((tx) => work(makeOperations(tx))),
});
