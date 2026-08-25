import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  acceptIncomingOrderProposalCellDeclaration,
  makeAcceptIncomingOrderProposalCell,
} from './cell.ts';
import {
  installOrdersPostgresInsertFault,
  ordersPostgresProofClock,
  ordersPostgresProofContext,
  ordersPostgresProofDatabase,
  ordersPostgresProofLocationFacts,
  ordersPostgresProofLocationId,
  ordersPostgresProofOrderId,
  ordersPostgresProofResolveCustomer,
  seedOrdersPostgresCanonicalOrder,
  seedOrdersPostgresProposal,
  useOrdersPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { ordersTestSchema } from '../../../testing/schema.ts';

useOrdersPostgresProof('accept-incoming-order-proposal');

const command = (
  proposalId: string,
  idempotencyKey: string,
  reasonNote: string | null = null,
) => ({
  proposalId,
  locationId: ordersPostgresProofLocationId,
  expectedVersion: 1,
  idempotencyKey,
  context: ordersPostgresProofContext,
  reasonCode: 'incoming_order_accepted' as const,
  reasonNote,
});

const acceptCell = (
  resolveExactSourceCustomerV1 = ordersPostgresProofResolveCustomer,
) =>
  makeAcceptIncomingOrderProposalCell({
    db: ordersPostgresProofDatabase.db,
    schema: ordersTestSchema,
    clock: ordersPostgresProofClock,
    orderLocationFactsV1: ordersPostgresProofLocationFacts,
    resolveExactSourceCustomerV1,
  });

const acceptanceDurableState = async () => {
  const [
    proposals,
    transitions,
    resolutions,
    orders,
    fulfillments,
    sourceLinks,
    sourceSnapshots,
    customerRefs,
    receipts,
    outbox,
  ] = await Promise.all([
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderSourceProposals),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderSourceProposalTransitions),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderSourceProposalResolutions),
    ordersPostgresProofDatabase.db.select().from(ordersTestSchema.orders),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderFulfillments),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderSourceLinks),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderSourceSnapshots),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderSourceCustomerRefs),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderCommandReceipts),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderOutboxEvents),
  ]);
  return {
    proposals,
    transitions,
    resolutions,
    orders,
    fulfillments,
    sourceLinks,
    sourceSnapshots,
    customerRefs,
    receipts,
    outbox,
  };
};

proveOperation({
  operationId: 'orders.accept-incoming-order-proposal.v1',
  declaration: acceptIncomingOrderProposalCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes acceptance replay, rejects divergent and decided commands, and rolls back proposal, canonical Order, receipt and outbox together',
      proves: [
        'postgres-commit',
        'expected-rejection-no-partial-write',
        'unexpected-failure-rollback',
        'same-payload-replay',
        'divergent-key-conflict',
        'same-key-concurrency',
        'declared-concurrency-race',
        'state-message-atomicity',
        'message-compatibility',
      ],
      run: async () => {
        const proposal = await seedOrdersPostgresProposal({
          externalOrderId: 'accept-local-proof',
        });
        const cell = acceptCell();
        const firstCommand = command(proposal.id, 'accept-proposal-1');
        const outcomes = await Promise.all([
          cell.execute(firstCommand),
          cell.execute(firstCommand),
        ]);
        expect(
          outcomes.map((outcome) =>
            outcome.kind === 'success' ? outcome.value.replayed : null,
          ),
        ).toEqual(expect.arrayContaining([false, true]));
        await expect(
          ordersPostgresProofDatabase.db.select().from(ordersTestSchema.orders),
        ).resolves.toHaveLength(1);
        await expect(
          ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderOutboxEvents),
        ).resolves.toHaveLength(1);
        await expect(
          ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposalResolutions),
        ).resolves.toHaveLength(1);

        await expect(
          cell.execute(command(proposal.id, 'accept-proposal-1', 'divergent')),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'order_idempotency_conflict' },
        });
        await expect(
          cell.execute(command(proposal.id, 'accept-proposal-decided')),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'incoming_order_proposal_transition_invalid' },
        });

        const rollbackProposal = await seedOrdersPostgresProposal({
          externalOrderId: 'accept-local-proof-rollback',
        });
        await installOrdersPostgresInsertFault(
          'order_source_proposal_resolutions',
        );
        await expect(
          cell.execute(
            command(rollbackProposal.id, 'accept-proposal-rollback'),
          ),
        ).rejects.toMatchObject({
          code: 'incoming_order_proposal_accept_failed',
        });
        const [preserved] = await ordersPostgresProofDatabase.db
          .select()
          .from(ordersTestSchema.orderSourceProposals)
          .where(
            eq(ordersTestSchema.orderSourceProposals.id, rollbackProposal.id),
          );
        expect(preserved).toMatchObject({ state: 'pending', version: 1 });
        await expect(
          ordersPostgresProofDatabase.db.select().from(ordersTestSchema.orders),
        ).resolves.toHaveLength(1);
        await expect(
          ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderOutboxEvents),
        ).resolves.toHaveLength(1);
      },
    },
  ],
});

proveOperation({
  operationId: 'orders.accept-incoming-order-proposal.v1',
  declaration: acceptIncomingOrderProposalCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'rejects incoming_order_proposal_accept_invalid without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const proposal = await seedOrdersPostgresProposal({
          externalOrderId: 'accept-invalid',
        });
        const before = await acceptanceDurableState();
        await expect(
          acceptCell().execute({
            ...command(proposal.id, 'accept-invalid'),
            expectedVersion: 0,
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: {
            kind: 'validation',
            code: 'incoming_order_proposal_accept_invalid',
          },
        });
        expect(await acceptanceDurableState()).toEqual(before);
      },
    },
    {
      name: 'rejects incoming_order_proposal_not_found without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const before = await acceptanceDurableState();
        await expect(
          acceptCell().execute(
            command('78000000-0000-4000-8000-000000000093', 'accept-not-found'),
          ),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: {
            kind: 'not_found',
            code: 'incoming_order_proposal_not_found',
          },
        });
        expect(await acceptanceDurableState()).toEqual(before);
      },
    },
    {
      name: 'rejects incoming_order_proposal_version_conflict without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const proposal = await seedOrdersPostgresProposal({
          externalOrderId: 'accept-version-conflict',
          version: 2,
        });
        const before = await acceptanceDurableState();
        await expect(
          acceptCell().execute(command(proposal.id, 'accept-version-conflict')),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'incoming_order_proposal_version_conflict',
          },
        });
        expect(await acceptanceDurableState()).toEqual(before);
      },
    },
    {
      name: 'rejects incoming_order_proposal_identity_conflict without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const externalOrderId = 'accept-identity-conflict';
        const proposal = await seedOrdersPostgresProposal({ externalOrderId });
        await seedOrdersPostgresCanonicalOrder();
        await ordersPostgresProofDatabase.db
          .insert(ordersTestSchema.orderSourceLinks)
          .values({
            source: 'cents',
            externalOrderId,
            orderId: ordersPostgresProofOrderId,
          });
        const before = await acceptanceDurableState();
        await expect(
          acceptCell().execute(
            command(proposal.id, 'accept-identity-conflict'),
          ),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'incoming_order_proposal_identity_conflict',
          },
        });
        expect(await acceptanceDurableState()).toEqual(before);
      },
    },
    {
      name: 'rejects canonical_source_user_business_conflict without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const proposal = await seedOrdersPostgresProposal({
          externalOrderId: 'accept-customer-business-conflict',
          customer: true,
        });
        const resolver = {
          contract: { version: 1 },
          execute: async () => ({
            kind: 'failure',
            failure: { code: 'canonical_source_user_business_conflict' },
          }),
        } as never;
        const before = await acceptanceDurableState();
        await expect(
          acceptCell(resolver).execute(
            command(proposal.id, 'accept-customer-business-conflict'),
          ),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'canonical_source_user_business_conflict',
          },
        });
        expect(await acceptanceDurableState()).toEqual(before);
      },
    },
    {
      name: 'rejects user_idempotency_conflict without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const proposal = await seedOrdersPostgresProposal({
          externalOrderId: 'accept-customer-idempotency-conflict',
          customer: true,
        });
        const resolver = {
          contract: { version: 1 },
          execute: async () => ({
            kind: 'failure',
            failure: { code: 'user_idempotency_conflict' },
          }),
        } as never;
        const before = await acceptanceDurableState();
        await expect(
          acceptCell(resolver).execute(
            command(proposal.id, 'accept-customer-idempotency-conflict'),
          ),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { kind: 'conflict', code: 'user_idempotency_conflict' },
        });
        expect(await acceptanceDurableState()).toEqual(before);
      },
    },
  ],
});
