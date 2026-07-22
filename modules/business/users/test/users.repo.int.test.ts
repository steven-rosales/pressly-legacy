import { eq, users as schema } from '@pressly/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePostgresUsersApplication } from '../src/main.ts';
import { createUsersTestDatabase } from './support/database.ts';

const testDb = createUsersTestDatabase();
const clock = { now: () => new Date('2026-07-21T16:00:00.000Z') };
const directContext = {
  origin: 'pressly_dashboard',
  principal: { kind: 'human', id: 'identity-1' },
} as const;
const sourceContext = {
  origin: 'cents',
  principal: { kind: 'system', id: 'cents-webhook' },
} as const;
const emptyProfile = {
  firstName: null,
  lastName: null,
  businessName: null,
  phone: null,
  email: null,
};

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

describe('Postgres Users application', () => {
  it('serializes concurrent exact-source observations to one canonical User', async () => {
    const application = makePostgresUsersApplication({ db: testDb.db, clock });
    const command = {
      context: sourceContext,
      source: 'cents',
      externalUserId: 'customer-1',
      profile: { ...emptyProfile, firstName: 'Ada', phone: '+12015550101' },
      revision: {
        at: clock.now(),
        observedAt: clock.now(),
        hash: 'a'.repeat(64),
        adapterVersion: 'cents-webhook-v2',
        normalizedPayload: { customer: { id: 'customer-1' } },
      },
    } as const;

    const outcomes = await Promise.all([
      application.observeSource(command),
      application.observeSource(command),
    ]);

    expect(outcomes.every((outcome) => outcome.tag === 'ok')).toBe(true);
    await expect(testDb.db.select().from(schema.users)).resolves.toHaveLength(
      1,
    );
    await expect(
      testDb.db.select().from(schema.userSourceLinks),
    ).resolves.toHaveLength(1);
    expect(
      outcomes.map((outcome) =>
        outcome.tag === 'ok' ? outcome.value.outcome : 'error',
      ),
    ).toEqual(expect.arrayContaining(['created', 'replayed']));
  });

  it('signals duplicate contact data without silently merging Users', async () => {
    const application = makePostgresUsersApplication({ db: testDb.db, clock });
    const first = await application.createUser({
      context: directContext,
      idempotencyKey: 'create-user-001',
      profile: { ...emptyProfile, firstName: 'Ada', phone: '+12015550101' },
    });
    const second = await application.createUser({
      context: directContext,
      idempotencyKey: 'create-user-002',
      profile: { ...emptyProfile, firstName: 'Grace', phone: '+12015550101' },
    });

    expect(first.tag).toBe('ok');
    expect(second.tag).toBe('ok');
    if (first.tag === 'err' || second.tag === 'err') return;
    expect(second.value.userId).not.toBe(first.value.userId);
    await expect(testDb.db.select().from(schema.users)).resolves.toHaveLength(
      2,
    );
    await expect(
      testDb.db.select().from(schema.userDuplicateCandidates),
    ).resolves.toHaveLength(1);
    const receipts = await testDb.db
      .select({
        origin: schema.userCommandReceipts.origin,
        actorKind: schema.userCommandReceipts.actorKind,
        actorId: schema.userCommandReceipts.actorId,
      })
      .from(schema.userCommandReceipts)
      .where(eq(schema.userCommandReceipts.userId, second.value.userId));
    expect(receipts).toEqual([
      {
        origin: 'pressly_dashboard',
        actorKind: 'human',
        actorId: 'identity-1',
      },
    ]);
  });

  it('rejects stale direct mutations and preserves the current version', async () => {
    const application = makePostgresUsersApplication({ db: testDb.db, clock });
    const created = await application.createUser({
      context: directContext,
      idempotencyKey: 'create-user-003',
      profile: emptyProfile,
    });
    expect(created.tag).toBe('ok');
    if (created.tag === 'err') return;

    await application.updateUser({
      context: directContext,
      idempotencyKey: 'update-user-001',
      userId: created.value.userId,
      expectedVersion: 1,
      changes: { phone: '+12015550102' },
    });
    const stale = await application.updateUser({
      context: directContext,
      idempotencyKey: 'update-user-002',
      userId: created.value.userId,
      expectedVersion: 1,
      changes: { phone: '+12015550103' },
    });

    expect(stale).toMatchObject({
      tag: 'err',
      error: { code: 'user_version_conflict' },
    });
    await expect(
      testDb.db
        .select({ version: schema.users.version, phone: schema.users.phone })
        .from(schema.users)
        .where(eq(schema.users.id, created.value.userId)),
    ).resolves.toEqual([{ version: 2, phone: '+12015550102' }]);
  });
});
