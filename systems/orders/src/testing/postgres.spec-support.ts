import { invariantViolationError } from '@pressly/errors/factories';
import { createPostgresRuntime } from '@pressly/postgres/client';
import { asc, eq, sql } from '@pressly/postgres/query';
import { createTestDatabaseRuntime } from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { ordersTestSchema } from './schema.ts';

const requireProofDatabaseUrl = (environmentName: string): string => {
  const value = process.env[environmentName];
  if (value !== undefined) return value;

  throw invariantViolationError({
    code: 'orders_local_proof_database_url_missing',
    message: `Orders PostgreSQL global setup did not provide ${environmentName}.`,
  });
};

const databaseUrl = requireProofDatabaseUrl(
  'PRESSLY_ORDERS_LOCAL_PROOF_DATABASE_URL',
);
const resetDatabaseUrl = requireProofDatabaseUrl(
  'PRESSLY_ORDERS_LOCAL_PROOF_DATABASE_RESET_URL',
);

export const ordersPostgresProofDatabase = createTestDatabaseRuntime({
  databaseUrl,
  resetDatabaseUrl,
  tableNames: [
    'order_source_proposal_transitions',
    'order_source_proposal_resolutions',
    'order_source_terminal_tombstones',
    'order_source_customer_refs',
    'order_source_snapshots',
    'order_source_links',
    'order_source_proposals',
    'order_outbox_events',
    'order_items',
    'order_fulfillments',
    'order_command_receipts',
    'orders',
  ],
  maxConnections: 8,
});

const faultDatabase = createPostgresRuntime({
  databaseUrl: resetDatabaseUrl,
  schema: ordersTestSchema,
  maxConnections: 1,
});

export const ordersPostgresProofNow = new Date('2026-08-22T16:00:00.000Z');
export const ordersPostgresProofClock = {
  now: () => ordersPostgresProofNow,
};
export const ordersPostgresProofBusinessId =
  '78000000-0000-4000-8000-000000000001';
export const ordersPostgresProofLocationId = 'orders-local-proof-location';
export const ordersPostgresProofOrderId =
  '78000000-0000-4000-8000-000000000002';
export const ordersPostgresProofFulfillmentId =
  '78000000-0000-4000-8000-000000000003';

export const removeOrdersPostgresInsertFault = async (): Promise<void> => {
  await faultDatabase.db.execute(
    sql`drop trigger if exists orders_local_proof_insert_fault on order_command_receipts`,
  );
  await faultDatabase.db.execute(
    sql`drop trigger if exists orders_local_proof_insert_fault on order_outbox_events`,
  );
  await faultDatabase.db.execute(
    sql`drop trigger if exists orders_local_proof_insert_fault on order_source_proposal_resolutions`,
  );
  await faultDatabase.db.execute(
    sql`drop trigger if exists orders_local_proof_insert_fault on order_source_proposal_transitions`,
  );
  await faultDatabase.db.execute(
    sql`drop trigger if exists orders_local_proof_insert_fault on order_source_proposals`,
  );
  await faultDatabase.db.execute(
    sql`drop function if exists orders_local_proof_reject_insert()`,
  );
};

export const installOrdersPostgresInsertFault = async (
  table:
    | 'order_command_receipts'
    | 'order_outbox_events'
    | 'order_source_proposals'
    | 'order_source_proposal_resolutions'
    | 'order_source_proposal_transitions',
): Promise<void> => {
  await removeOrdersPostgresInsertFault();
  await faultDatabase.db.execute(sql`
    create function orders_local_proof_reject_insert()
    returns trigger language plpgsql as $$
    begin
      raise exception 'injected Orders local proof failure';
    end;
    $$
  `);
  if (table === 'order_command_receipts')
    await faultDatabase.db.execute(sql`
      create trigger orders_local_proof_insert_fault
      before insert on order_command_receipts
      for each row execute function orders_local_proof_reject_insert()
    `);
  else if (table === 'order_outbox_events')
    await faultDatabase.db.execute(sql`
      create trigger orders_local_proof_insert_fault
      before insert on order_outbox_events
      for each row execute function orders_local_proof_reject_insert()
    `);
  else if (table === 'order_source_proposal_resolutions')
    await faultDatabase.db.execute(sql`
      create trigger orders_local_proof_insert_fault
      before insert on order_source_proposal_resolutions
      for each row execute function orders_local_proof_reject_insert()
    `);
  else if (table === 'order_source_proposals')
    await faultDatabase.db.execute(sql`
      create trigger orders_local_proof_insert_fault
      before insert on order_source_proposals
      for each row execute function orders_local_proof_reject_insert()
    `);
  else
    await faultDatabase.db.execute(sql`
      create trigger orders_local_proof_insert_fault
      before insert on order_source_proposal_transitions
      for each row execute function orders_local_proof_reject_insert()
    `);
};

export const removeOrdersPostgresUpdateFault = async (): Promise<void> => {
  await faultDatabase.db.execute(
    sql`drop trigger if exists orders_local_proof_update_fault on order_outbox_events`,
  );
  await faultDatabase.db.execute(
    sql`drop function if exists orders_local_proof_reject_update()`,
  );
};

export const installOrdersPostgresUpdateFault = async (): Promise<void> => {
  await removeOrdersPostgresUpdateFault();
  await faultDatabase.db.execute(sql`
    create function orders_local_proof_reject_update()
    returns trigger language plpgsql as $$
    begin
      raise exception 'injected Orders local proof update failure';
    end;
    $$
  `);
  await faultDatabase.db.execute(sql`
    create trigger orders_local_proof_update_fault
    before update on order_outbox_events
    for each row execute function orders_local_proof_reject_update()
  `);
};

export const seedOrdersPostgresCanonicalOrder = async (input?: {
  orderId?: string;
  fulfillmentId?: string;
  state?: 'open' | 'completed' | 'canceled';
  releaseState?: 'unreleased' | 'released' | 'withdrawn';
  orderVersion?: number;
  fulfillmentVersion?: number;
}) => {
  const orderId = input?.orderId ?? ordersPostgresProofOrderId;
  const fulfillmentId =
    input?.fulfillmentId ?? ordersPostgresProofFulfillmentId;
  await ordersPostgresProofDatabase.db.insert(ordersTestSchema.orders).values({
    id: orderId,
    businessId: ordersPostgresProofBusinessId,
    customerResolution: 'not_provided',
    displayNumber: 'P-780',
    state: input?.state ?? 'open',
    dueAt: new Date('2026-08-23T20:00:00.000Z'),
    currency: 'USD',
    totalAmountCents: 3_600,
    balanceDueCents: 3_600,
    version: input?.orderVersion ?? 1,
    createdAt: ordersPostgresProofNow,
    updatedAt: ordersPostgresProofNow,
  });
  await ordersPostgresProofDatabase.db
    .insert(ordersTestSchema.orderFulfillments)
    .values({
      id: fulfillmentId,
      businessId: ordersPostgresProofBusinessId,
      orderId,
      typeCode: 'wash_fold',
      locationId: ordersPostgresProofLocationId,
      releaseState: input?.releaseState ?? 'unreleased',
      estimatedWeightLbs: 18,
      estimatedWeightSource: 'source_estimate',
      version: input?.fulfillmentVersion ?? 1,
      createdAt: ordersPostgresProofNow,
      updatedAt: ordersPostgresProofNow,
    });
  return { orderId, fulfillmentId };
};

export const seedOrdersPostgresProposal = async (input: {
  externalOrderId: string;
  state?: 'pending' | 'source_closed' | 'restored_pending';
  version?: number;
  customer?: boolean;
}) => {
  const [proposal] = await ordersPostgresProofDatabase.db
    .insert(ordersTestSchema.orderSourceProposals)
    .values({
      source: 'cents',
      externalOrderId: input.externalOrderId,
      locationId: ordersPostgresProofLocationId,
      proposalKind: 'submitted_order',
      sourceRevisionAt: new Date('2026-08-22T15:59:00.000Z'),
      sourceRevisionHash: 'a'.repeat(64),
      adapterVersion: 'orders-local-proof-v1',
      proposalSnapshot: {
        order: {
          customer:
            input.customer === true
              ? {
                  externalUserId: `customer-${input.externalOrderId}`,
                  firstName: 'Local',
                  lastName: 'Customer',
                  businessName: null,
                  phone: null,
                  email: null,
                  normalizedPayload: { fixture: true },
                }
              : null,
          displayNumber: `P-${input.externalOrderId}`,
          dueAt: '2026-08-23T20:00:00.000Z',
          currency: 'USD',
          totalAmountCents: 3_600,
          balanceDueCents: 3_600,
          items: [],
          fulfillment: {
            typeCode: 'wash_fold',
            locationId: ordersPostgresProofLocationId,
            estimatedWeightLbs: 18,
            estimatedWeightSource: 'source_estimate',
          },
        },
        source: { order: { id: input.externalOrderId } },
      },
      displayNumber: `P-${input.externalOrderId}`,
      dueAt: new Date('2026-08-23T20:00:00.000Z'),
      estimatedWeightLbs: 18,
      observedAt: ordersPostgresProofNow,
      state: input.state ?? 'pending',
      version: input.version ?? 1,
      createdAt: ordersPostgresProofNow,
    })
    .returning();
  if (proposal === undefined)
    throw invariantViolationError({
      code: 'orders_local_proof_proposal_missing',
      message: 'Orders local proof proposal insert returned no row.',
    });
  return proposal;
};

export const ordersPostgresProofLocationFacts = {
  contract: { version: 1 },
  execute: async () => ({
    businessId: ordersPostgresProofBusinessId,
    isActive: true,
  }),
} as never;

export const ordersPostgresProofCustomerReference = {
  contract: { version: 1 },
  execute: async (input: { businessId: string; customerId: string }) => ({
    customerId: input.customerId,
    businessId: input.businessId,
    version: 1,
    active: true,
    profile: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      businessName: null,
      phone: '+12015550101',
      email: 'ada@example.com',
    },
  }),
} as never;

export const ordersPostgresProofResolveCustomer = {
  contract: { version: 1 },
  execute: async (): Promise<never> => {
    throw invariantViolationError({
      code: 'orders_local_proof_customer_resolution_unexpected',
      message: 'Customer resolution is not expected for this fixture.',
    });
  },
} as never;

export const ordersPostgresProofContext = {
  origin: 'pressly_dashboard',
  principal: { kind: 'human' as const, id: 'identity-1' },
};

let lifecycleOwner: string | null = null;

export const useOrdersPostgresProof = (owner: string): void => {
  if (!/^[a-z][a-z0-9-]*$/.test(owner))
    throw invariantViolationError({
      code: 'orders_local_proof_owner_invalid',
      message: `Orders PostgreSQL proof owner is invalid: ${owner}.`,
    });
  if (lifecycleOwner !== null)
    throw invariantViolationError({
      code: 'orders_local_proof_lifecycle_duplicate',
      message: `Orders PostgreSQL proof lifecycle is already owned by ${lifecycleOwner}; ${owner} cannot register it again.`,
    });
  lifecycleOwner = owner;

  beforeAll(async () => {
    await ordersPostgresProofDatabase.check();
    await faultDatabase.check();
  });
  beforeEach(async () => {
    await removeOrdersPostgresInsertFault();
    await removeOrdersPostgresUpdateFault();
    await ordersPostgresProofDatabase.reset();
  });
  afterAll(async () => {
    await removeOrdersPostgresInsertFault();
    await removeOrdersPostgresUpdateFault();
    await ordersPostgresProofDatabase.reset();
    await ordersPostgresProofDatabase.close();
    await faultDatabase.close();
  });
};

export const readOrdersPostgresProofOrder = async (orderId: string) => {
  const [order] = await ordersPostgresProofDatabase.db
    .select()
    .from(ordersTestSchema.orders)
    .where(eq(ordersTestSchema.orders.id, orderId));
  return order;
};

export const ordersPostgresProofEventId = (value: number): string =>
  `78000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

export const ordersPostgresProofPayload = (version: number) => ({
  schemaVersion: 2 as const,
  eventType: 'fulfillment_demand_changed' as const,
  fulfillmentId: ordersPostgresProofFulfillmentId,
  displayNumber: 'P-780',
  locationId: ordersPostgresProofLocationId,
  typeCode: 'wash_fold',
  admissionState: 'released' as const,
  commercialState: 'open' as const,
  dueAt: '2026-08-23T20:00:00.000Z',
  estimatedWeightLbs: 18,
  estimatedWeightSource: 'source_estimate',
  version,
  observedAt: ordersPostgresProofNow.toISOString(),
});

export const insertOrdersPostgresProofEvent = async (input: {
  index: number;
  version: number;
  storedPayload?: unknown;
  status?: 'pending' | 'processing' | 'completed' | 'dead';
  attempts?: number;
  availableAt?: Date;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
  completedAt?: Date | null;
  deadAt?: Date | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  createdAt?: Date;
}): Promise<string> => {
  const id = ordersPostgresProofEventId(input.index);
  await ordersPostgresProofDatabase.db
    .insert(ordersTestSchema.orderOutboxEvents)
    .values({
      id,
      orderId: ordersPostgresProofOrderId,
      fulfillmentId: ordersPostgresProofFulfillmentId,
      eventType: 'fulfillment_demand_changed',
      aggregateVersion: input.version,
      payload: input.storedPayload ?? ordersPostgresProofPayload(input.version),
      status: input.status ?? 'pending',
      attempts: input.attempts ?? 0,
      availableAt: input.availableAt ?? ordersPostgresProofNow,
      leaseOwner: input.leaseOwner ?? null,
      leaseExpiresAt: input.leaseExpiresAt ?? null,
      completedAt: input.completedAt ?? null,
      deadAt: input.deadAt ?? null,
      lastErrorCode: input.lastErrorCode ?? null,
      lastErrorMessage: input.lastErrorMessage ?? null,
      createdAt: input.createdAt ?? ordersPostgresProofNow,
    });
  return id;
};

export const readOrdersPostgresProofEvents = () =>
  ordersPostgresProofDatabase.db
    .select()
    .from(ordersTestSchema.orderOutboxEvents)
    .orderBy(asc(ordersTestSchema.orderOutboxEvents.id));
