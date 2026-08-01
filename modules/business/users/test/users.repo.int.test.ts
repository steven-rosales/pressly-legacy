import { business as businessSchema, eq, users as schema } from '@pressly/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePostgresUsersApplication } from '../src/main.ts';
import { makePostgresCanonicalSourceUserAcceptanceAdapter } from '../src/canonical-source-user/canonical-source-user.repo.ts';
import { createUsersTestDatabase } from './support/database.ts';

const testDb = createUsersTestDatabase();
const clock = { now: () => new Date('2026-07-21T16:00:00.000Z') };
const businessId = '00000000-0000-4000-8000-000000000100';
const otherBusinessId = '00000000-0000-4000-8000-000000000201';
const directContext = {
  origin: 'pressly_dashboard',
  principal: { kind: 'human', id: 'identity-1' },
} as const;
const emptyProfile = {
  firstName: null,
  lastName: null,
  businessName: null,
  phone: null,
  email: null,
};

beforeAll(async () => {
  await testDb.check();
  await testDb.db
    .insert(businessSchema.businessAccounts)
    .values({
      id: otherBusinessId,
      slug: 'users-isolation-fixture',
      displayName: 'Users isolation fixture',
    })
    .onConflictDoNothing();
});
beforeEach(testDb.reset);
afterAll(async () => {
  await testDb.db
    .delete(businessSchema.businessAccounts)
    .where(eq(businessSchema.businessAccounts.id, otherBusinessId));
  await testDb.close();
});

describe('Postgres Users application', () => {
  it('creates canonical source-linked User evidence once inside the caller transaction', async () => {
    const adapter = makePostgresCanonicalSourceUserAcceptanceAdapter();
    const input = {
      businessId,
      source: 'external-orders',
      externalUserId: 'customer-proposal-1',
      profile: {
        ...emptyProfile,
        firstName: 'Ada',
        phone: '+12015550101',
      },
      revision: {
        at: new Date('2026-07-21T15:59:00.000Z'),
        hash: 'a'.repeat(64),
        adapterVersion: 'external-orders-v1',
        observedAt: clock.now(),
        normalizedPayload: { customer: { id: 'customer-proposal-1' } },
      },
      idempotencyKey: 'incoming-order-proposal:proposal-1:customer',
      context: directContext,
      now: clock.now(),
    } as const;

    const first = await testDb.db.transaction((tx) =>
      adapter.resolveOrCreate(tx, input),
    );
    const replay = await testDb.db.transaction((tx) =>
      adapter.resolveOrCreate(tx, input),
    );

    expect(first).toMatchObject({ created: true });
    expect(replay).toEqual({ userId: first.userId, created: false });
    await expect(testDb.db.select().from(schema.users)).resolves.toHaveLength(
      1,
    );
    await expect(
      testDb.db.select().from(schema.userSourceLinks),
    ).resolves.toHaveLength(1);
    await expect(
      testDb.db.select().from(schema.userSourceSnapshots),
    ).resolves.toHaveLength(1);
    await expect(
      testDb.db.select().from(schema.userCommandReceipts),
    ).resolves.toHaveLength(1);
    await expect(
      testDb.db
        .select({
          authority: schema.userFieldAuthorities.authority,
          source: schema.userFieldAuthorities.source,
        })
        .from(schema.userFieldAuthorities),
    ).resolves.toEqual(
      Array.from({ length: 5 }, () => ({
        authority: 'pressly',
        source: null,
      })),
    );
  });

  it('serializes concurrent exact-source acceptance to one canonical User', async () => {
    const adapter = makePostgresCanonicalSourceUserAcceptanceAdapter();
    const input = {
      businessId,
      context: directContext,
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
      idempotencyKey: 'incoming-order-proposal:proposal-concurrent:customer',
      now: clock.now(),
    } as const;

    const outcomes = await Promise.all([
      testDb.db.transaction((tx) => adapter.resolveOrCreate(tx, input)),
      testDb.db.transaction((tx) => adapter.resolveOrCreate(tx, input)),
    ]);

    expect(outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ created: true }),
        expect.objectContaining({ created: false }),
      ]),
    );
    expect(outcomes[0]?.userId).toBe(outcomes[1]?.userId);
    await expect(testDb.db.select().from(schema.users)).resolves.toHaveLength(
      1,
    );
    await expect(
      testDb.db.select().from(schema.userSourceLinks),
    ).resolves.toHaveLength(1);
    await expect(
      testDb.db.select().from(schema.userSourceSnapshots),
    ).resolves.toHaveLength(1);
    await expect(
      testDb.db.select().from(schema.userCommandReceipts),
    ).resolves.toHaveLength(1);
  });

  it('signals a possible contact duplicate instead of merging a new source identity', async () => {
    const application = makePostgresUsersApplication({ db: testDb.db, clock });
    const existing = await application.createUser({
      businessId,
      context: directContext,
      idempotencyKey: 'create-user-before-source-acceptance',
      profile: {
        ...emptyProfile,
        firstName: 'Existing',
        phone: '+12015550101',
      },
    });
    expect(existing.tag).toBe('ok');
    if (existing.tag === 'err') return;

    const adapter = makePostgresCanonicalSourceUserAcceptanceAdapter();
    const accepted = await testDb.db.transaction((tx) =>
      adapter.resolveOrCreate(tx, {
        businessId,
        context: directContext,
        source: 'cents',
        externalUserId: 'customer-with-matching-phone',
        profile: {
          ...emptyProfile,
          firstName: 'Incoming',
          phone: '+12015550101',
        },
        revision: {
          at: clock.now(),
          observedAt: clock.now(),
          hash: 'b'.repeat(64),
          adapterVersion: 'cents-webhook-v2',
          normalizedPayload: {
            customer: { id: 'customer-with-matching-phone' },
          },
        },
        idempotencyKey: 'incoming-order-proposal:proposal-duplicate:customer',
        now: clock.now(),
      }),
    );

    expect(accepted).toMatchObject({ created: true });
    expect(accepted.userId).not.toBe(existing.value.userId);
    await expect(testDb.db.select().from(schema.users)).resolves.toHaveLength(
      2,
    );
    await expect(
      testDb.db.select().from(schema.userDuplicateCandidates),
    ).resolves.toMatchObject([
      {
        userId: accepted.userId,
        candidateUserId: existing.value.userId,
        reason: 'same_phone',
        status: 'open',
      },
    ]);
  });

  it('signals duplicate contact data without silently merging Users', async () => {
    const application = makePostgresUsersApplication({ db: testDb.db, clock });
    const first = await application.createUser({
      businessId,
      context: directContext,
      idempotencyKey: 'create-user-001',
      profile: { ...emptyProfile, firstName: 'Ada', phone: '+12015550101' },
    });
    const second = await application.createUser({
      businessId,
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

  it('isolates customer reads and duplicate signals by business', async () => {
    const application = makePostgresUsersApplication({ db: testDb.db, clock });
    const first = await application.createUser({
      businessId,
      context: directContext,
      idempotencyKey: 'create-user-primary-business',
      profile: {
        ...emptyProfile,
        firstName: 'Ada',
        phone: '+12015550109',
      },
    });
    const other = await application.createUser({
      businessId: otherBusinessId,
      context: directContext,
      idempotencyKey: 'create-user-other-business',
      profile: {
        ...emptyProfile,
        firstName: 'Grace',
        phone: '+12015550109',
      },
    });
    expect(first.tag).toBe('ok');
    expect(other.tag).toBe('ok');
    if (first.tag === 'err' || other.tag === 'err') return;

    const primaryPage = await application.listUsers({
      businessId,
      query: null,
      active: null,
      limit: 50,
      cursor: null,
    });
    expect(primaryPage).toMatchObject({
      tag: 'ok',
      value: { items: [{ id: first.value.userId }] },
    });
    await expect(
      application.getUser({
        businessId,
        userId: other.value.userId,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'user_not_found' },
    });
    await expect(
      testDb.db.select().from(schema.userDuplicateCandidates),
    ).resolves.toEqual([]);
  });

  it('rejects stale direct mutations and preserves the current version', async () => {
    const application = makePostgresUsersApplication({ db: testDb.db, clock });
    const created = await application.createUser({
      businessId,
      context: directContext,
      idempotencyKey: 'create-user-003',
      profile: emptyProfile,
    });
    expect(created.tag).toBe('ok');
    if (created.tag === 'err') return;

    await application.updateUser({
      businessId,
      context: directContext,
      idempotencyKey: 'update-user-001',
      userId: created.value.userId,
      expectedVersion: 1,
      changes: { phone: '+12015550102' },
    });
    const stale = await application.updateUser({
      businessId,
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
