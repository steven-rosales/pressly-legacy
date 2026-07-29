import {
  and,
  desc,
  eq,
  inArray,
  lt,
  or,
  orders as orderSchema,
  sql,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import type { CommandContext } from '@pressly/kernel';
import { isOrderInputValid } from '../order-input.policy.ts';
import {
  createStoredPresslyOrder,
  loadOrderCommandReceipt,
  lockOrderKey,
  saveOrderCommandReceipt,
} from '../persistence/postgres-order.shared.ts';
import type {
  IncomingOrderProposalCustomer,
  IncomingOrderProposalSnapshot,
  OrderCustomer,
  OrderInput,
  ProposeIncomingOrderCommand,
} from '../orders.port.ts';
import type {
  DecideIncomingOrderProposalOperations,
  DecideIncomingOrderProposalRepository,
  CloseIncomingOrderSourceOperations,
  CloseIncomingOrderSourceRepository,
  ListIncomingOrderProposalsRepository,
  ProposeIncomingOrderOperations,
  ProposeIncomingOrderRepository,
  StoredIncomingOrderProposal,
  StoredIncomingOrderProposalResolution,
  StoredIncomingOrderSourceTombstone,
} from './incoming-order-proposal.port.ts';

export type IncomingOrderProposalCustomerPersistence = Readonly<{
  resolveOrCreate: (
    db: DatabaseExecutor,
    input: Readonly<{
      source: string;
      externalUserId: string;
      profile: Omit<
        IncomingOrderProposalCustomer,
        'externalUserId' | 'normalizedPayload'
      >;
      revision: Readonly<{
        at: Date;
        hash: string;
        adapterVersion: string;
        observedAt: Date;
        normalizedPayload: unknown;
      }>;
      idempotencyKey: string;
      context: CommandContext;
      now: Date;
    }>,
  ) => Promise<Readonly<{ userId: string; created: boolean }>>;
}>;

type ProposalSnapshotJson = Readonly<{
  order: Omit<IncomingOrderProposalSnapshot, 'dueAt'> &
    Readonly<{ dueAt: string }>;
  source: unknown;
}>;

const customerDisplayName = (
  customer: IncomingOrderProposalCustomer | null,
): string | null => {
  if (customer === null) return null;
  if (customer.businessName !== null && customer.businessName.trim() !== '')
    return customer.businessName.trim();
  const name = [customer.firstName, customer.lastName]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .map((part) => part.trim())
    .join(' ');
  return name === '' ? null : name;
};

const serializeSnapshot = (
  command: ProposeIncomingOrderCommand,
): ProposalSnapshotJson => ({
  order: {
    ...command.snapshot,
    dueAt: command.snapshot.dueAt.toISOString(),
  },
  source: command.revision.normalizedPayload,
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nullableString = (value: unknown): value is string | null =>
  typeof value === 'string' || value === null;

const parseCustomer = (
  value: unknown,
): IncomingOrderProposalCustomer | null => {
  if (value === null) return null;
  if (
    !isObject(value) ||
    typeof value['externalUserId'] !== 'string' ||
    value['externalUserId'].trim() === '' ||
    !nullableString(value['firstName']) ||
    !nullableString(value['lastName']) ||
    !nullableString(value['businessName']) ||
    !nullableString(value['phone']) ||
    !nullableString(value['email']) ||
    !('normalizedPayload' in value)
  )
    throw new Error('Stored incoming proposal customer is invalid.');
  return {
    externalUserId: value['externalUserId'],
    firstName: value['firstName'],
    lastName: value['lastName'],
    businessName: value['businessName'],
    phone: value['phone'],
    email: value['email'],
    normalizedPayload: value['normalizedPayload'],
  };
};

const parseSnapshot = (
  value: unknown,
): Readonly<{
  snapshot: IncomingOrderProposalSnapshot;
  sourceNormalizedPayload: unknown;
}> => {
  if (!isObject(value) || !isObject(value['order']) || !('source' in value))
    throw new Error('Stored incoming proposal snapshot is invalid.');
  const raw = value['order'];
  const dueAt = new Date(String(raw['dueAt']));
  if (
    !nullableString(raw['displayNumber']) ||
    typeof raw['currency'] !== 'string' ||
    typeof raw['totalAmountCents'] !== 'number' ||
    !(
      typeof raw['balanceDueCents'] === 'number' ||
      raw['balanceDueCents'] === null
    ) ||
    !Array.isArray(raw['items']) ||
    !isObject(raw['fulfillment'])
  )
    throw new Error('Stored incoming proposal Order is invalid.');
  const snapshot: IncomingOrderProposalSnapshot = {
    customer: parseCustomer(raw['customer']),
    displayNumber: raw['displayNumber'],
    dueAt,
    currency: raw['currency'],
    totalAmountCents: raw['totalAmountCents'],
    balanceDueCents: raw['balanceDueCents'],
    items: raw['items'] as unknown as IncomingOrderProposalSnapshot['items'],
    fulfillment: raw[
      'fulfillment'
    ] as unknown as IncomingOrderProposalSnapshot['fulfillment'],
  };
  if (
    !isOrderInputValid({
      customer: {
        resolution: 'not_provided',
        userId: null,
        externalUserId: null,
      },
      displayNumber: snapshot.displayNumber,
      state: 'open',
      dueAt: snapshot.dueAt,
      currency: snapshot.currency,
      totalAmountCents: snapshot.totalAmountCents,
      balanceDueCents: snapshot.balanceDueCents,
      items: snapshot.items,
      fulfillment: {
        ...snapshot.fulfillment,
        releaseState: 'unreleased',
        bagCount: null,
      },
    })
  )
    throw new Error('Stored incoming proposal Order is incomplete.');
  return { snapshot, sourceNormalizedPayload: value['source'] };
};

type ProposalRow = typeof orderSchema.orderSourceProposals.$inferSelect;
type ResolutionRow =
  | typeof orderSchema.orderSourceProposalResolutions.$inferSelect
  | null;
type TombstoneRow =
  | typeof orderSchema.orderSourceTerminalTombstones.$inferSelect
  | null;

const storedResolution = (
  row: ResolutionRow,
): StoredIncomingOrderProposalResolution | null => {
  if (row === null) return null;
  if (
    (row.decision !== 'accepted' && row.decision !== 'rejected') ||
    !Number.isInteger(row.proposalVersion) ||
    row.proposalVersion <= 1
  )
    throw new Error('Stored incoming proposal resolution is invalid.');
  return {
    decision: row.decision,
    proposalVersion: row.proposalVersion,
    orderId: row.orderId,
    fulfillmentId: row.fulfillmentId,
    idempotencyKey: row.idempotencyKey,
    commandHash: row.commandHash,
  };
};

const storedProposal = (
  proposal: ProposalRow,
  resolution: ResolutionRow,
  tombstone: TombstoneRow = null,
): StoredIncomingOrderProposal => {
  if (
    (proposal.proposalKind !== 'pickup' &&
      proposal.proposalKind !== 'submitted_order') ||
    (proposal.state !== 'pending' &&
      proposal.state !== 'source_closed' &&
      proposal.state !== 'restored_pending' &&
      proposal.state !== 'accepted' &&
      proposal.state !== 'rejected') ||
    !Number.isInteger(proposal.version) ||
    proposal.version < 1
  )
    throw new Error('Stored incoming proposal state is invalid.');
  const parsed = parseSnapshot(proposal.proposalSnapshot);
  return {
    id: proposal.id,
    source: proposal.source,
    externalOrderId: proposal.externalOrderId,
    locationId: proposal.locationId,
    proposalKind: proposal.proposalKind,
    sourceRevisionAt: proposal.sourceRevisionAt,
    sourceRevisionHash: proposal.sourceRevisionHash,
    adapterVersion: proposal.adapterVersion,
    sourceNormalizedPayload: parsed.sourceNormalizedPayload,
    snapshot: parsed.snapshot,
    observedAt: proposal.observedAt,
    state: proposal.state,
    version: proposal.version,
    resolution: storedResolution(resolution),
    sourceClosure:
      proposal.state === 'source_closed' && tombstone !== null
        ? {
            kind: tombstone.terminalCode as 'completed' | 'canceled',
            observedAt: tombstone.observedAt,
          }
        : null,
  };
};

const findExactOrder = async (
  tx: DatabaseExecutor,
  source: string,
  externalOrderId: string,
): Promise<Readonly<{
  orderId: string;
  fulfillment: Readonly<{
    fulfillmentId: string;
    locationId: string;
    releaseState: 'unreleased' | 'released' | 'withdrawn';
  }> | null;
}> | null> => {
  const [row] = await tx
    .select({
      orderId: orderSchema.orderSourceLinks.orderId,
      fulfillmentId: orderSchema.orderFulfillments.id,
      locationId: orderSchema.orderFulfillments.locationId,
      releaseState: orderSchema.orderFulfillments.releaseState,
    })
    .from(orderSchema.orderSourceLinks)
    .leftJoin(
      orderSchema.orderFulfillments,
      eq(
        orderSchema.orderFulfillments.orderId,
        orderSchema.orderSourceLinks.orderId,
      ),
    )
    .where(
      and(
        eq(orderSchema.orderSourceLinks.source, source),
        eq(orderSchema.orderSourceLinks.externalOrderId, externalOrderId),
      ),
    )
    .limit(1);
  if (row === undefined) return null;
  if (row.fulfillmentId === null)
    return { orderId: row.orderId, fulfillment: null };
  if (
    row.locationId === null ||
    (row.releaseState !== 'unreleased' &&
      row.releaseState !== 'released' &&
      row.releaseState !== 'withdrawn')
  )
    throw new Error('Stored canonical fulfillment is incomplete.');
  return {
    orderId: row.orderId,
    fulfillment: {
      fulfillmentId: row.fulfillmentId,
      locationId: row.locationId,
      releaseState: row.releaseState,
    },
  };
};

const storedTombstone = (
  row: NonNullable<TombstoneRow>,
): StoredIncomingOrderSourceTombstone => {
  if (row.terminalCode !== 'completed' && row.terminalCode !== 'canceled')
    throw new Error('Stored incoming Order tombstone is invalid.');
  return {
    source: row.source,
    externalOrderId: row.externalOrderId,
    proposalId: row.proposalId,
    terminalCode: row.terminalCode,
    sourceRevisionAt: row.sourceRevisionAt,
    sourceRevisionHash: row.sourceRevisionHash,
    observedAt: row.observedAt,
  };
};

const findTombstone = async (
  tx: DatabaseExecutor,
  source: string,
  externalOrderId: string,
): Promise<StoredIncomingOrderSourceTombstone | null> => {
  const [row] = await tx
    .select()
    .from(orderSchema.orderSourceTerminalTombstones)
    .where(
      and(
        eq(orderSchema.orderSourceTerminalTombstones.source, source),
        eq(
          orderSchema.orderSourceTerminalTombstones.externalOrderId,
          externalOrderId,
        ),
      ),
    )
    .limit(1);
  return row === undefined ? null : storedTombstone(row);
};

const findProposal = async (
  tx: DatabaseExecutor,
  source: string,
  externalOrderId: string,
): Promise<StoredIncomingOrderProposal | null> => {
  const [row] = await tx
    .select({
      proposal: orderSchema.orderSourceProposals,
      resolution: orderSchema.orderSourceProposalResolutions,
      tombstone: orderSchema.orderSourceTerminalTombstones,
    })
    .from(orderSchema.orderSourceProposals)
    .leftJoin(
      orderSchema.orderSourceProposalResolutions,
      eq(
        orderSchema.orderSourceProposalResolutions.proposalId,
        orderSchema.orderSourceProposals.id,
      ),
    )
    .leftJoin(
      orderSchema.orderSourceTerminalTombstones,
      and(
        eq(
          orderSchema.orderSourceTerminalTombstones.source,
          orderSchema.orderSourceProposals.source,
        ),
        eq(
          orderSchema.orderSourceTerminalTombstones.externalOrderId,
          orderSchema.orderSourceProposals.externalOrderId,
        ),
      ),
    )
    .where(
      and(
        eq(orderSchema.orderSourceProposals.source, source),
        eq(orderSchema.orderSourceProposals.externalOrderId, externalOrderId),
      ),
    )
    .limit(1);
  return row === undefined
    ? null
    : storedProposal(row.proposal, row.resolution, row.tombstone);
};

const proposalOperations = (
  tx: DatabaseExecutor,
): ProposeIncomingOrderOperations => ({
  lockSource: (source, externalOrderId) =>
    lockOrderKey(tx, `orders:source:${source}:${externalOrderId}`),
  findExactOrder: (source, externalOrderId) =>
    findExactOrder(tx, source, externalOrderId),
  findTombstone: (source, externalOrderId) =>
    findTombstone(tx, source, externalOrderId),
  findProposal: (source, externalOrderId) =>
    findProposal(tx, source, externalOrderId),
  createProposal: async (command) => {
    const customer = command.snapshot.customer;
    const [created] = await tx
      .insert(orderSchema.orderSourceProposals)
      .values({
        source: command.source,
        externalOrderId: command.externalOrderId,
        locationId: command.snapshot.fulfillment.locationId,
        proposalKind: command.proposalKind,
        sourceRevisionAt: command.revision.at,
        sourceRevisionHash: command.revision.hash,
        adapterVersion: command.revision.adapterVersion,
        proposalSnapshot: serializeSnapshot(command),
        customerDisplayName: customerDisplayName(customer),
        customerPhone: customer?.phone ?? null,
        customerEmail: customer?.email ?? null,
        displayNumber: command.snapshot.displayNumber,
        dueAt: command.snapshot.dueAt,
        estimatedWeightLbs: command.snapshot.fulfillment.estimatedWeightLbs,
        observedAt: command.revision.observedAt,
        state: 'pending',
        version: 1,
        createdAt: command.revision.observedAt,
      })
      .returning({ proposalId: orderSchema.orderSourceProposals.id });
    if (created === undefined)
      throw new Error('Incoming proposal insert returned no row.');
    return created;
  },
});

const loadProposal = async (
  tx: DatabaseExecutor,
  proposalId: string,
): Promise<StoredIncomingOrderProposal | null> => {
  const [row] = await tx
    .select({
      proposal: orderSchema.orderSourceProposals,
      resolution: orderSchema.orderSourceProposalResolutions,
      tombstone: orderSchema.orderSourceTerminalTombstones,
    })
    .from(orderSchema.orderSourceProposals)
    .leftJoin(
      orderSchema.orderSourceProposalResolutions,
      eq(
        orderSchema.orderSourceProposalResolutions.proposalId,
        orderSchema.orderSourceProposals.id,
      ),
    )
    .leftJoin(
      orderSchema.orderSourceTerminalTombstones,
      and(
        eq(
          orderSchema.orderSourceTerminalTombstones.source,
          orderSchema.orderSourceProposals.source,
        ),
        eq(
          orderSchema.orderSourceTerminalTombstones.externalOrderId,
          orderSchema.orderSourceProposals.externalOrderId,
        ),
      ),
    )
    .where(eq(orderSchema.orderSourceProposals.id, proposalId))
    .limit(1);
  return row === undefined
    ? null
    : storedProposal(row.proposal, row.resolution, row.tombstone);
};

const resolveOrCreateExactCustomer = async (
  tx: DatabaseExecutor,
  persistence: IncomingOrderProposalCustomerPersistence,
  proposal: StoredIncomingOrderProposal,
  context: Readonly<{
    origin: string;
    principal: Readonly<{
      kind: 'human' | 'service' | 'system';
      id: string;
    }>;
  }>,
  now: Date,
): Promise<OrderCustomer> => {
  const customer = proposal.snapshot.customer;
  if (customer === null)
    return {
      resolution: 'not_provided',
      userId: null,
      externalUserId: null,
    };
  const resolved = await persistence.resolveOrCreate(tx, {
    source: proposal.source,
    externalUserId: customer.externalUserId,
    profile: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      businessName: customer.businessName,
      phone: customer.phone,
      email: customer.email,
    },
    revision: {
      at: proposal.sourceRevisionAt,
      hash: proposal.sourceRevisionHash,
      adapterVersion: proposal.adapterVersion,
      observedAt: proposal.observedAt,
      normalizedPayload: customer.normalizedPayload,
    },
    idempotencyKey: `incoming-order-proposal:${proposal.id}:customer`,
    context,
    now,
  });
  return {
    resolution: 'resolved',
    userId: resolved.userId,
    externalUserId: customer.externalUserId,
  };
};

const insertResolution = async (
  tx: DatabaseExecutor,
  input: {
    proposalId: string;
    decision: 'accepted' | 'rejected';
    proposalVersion: number;
    orderId: string | null;
    fulfillmentId: string | null;
    idempotencyKey: string;
    commandHash: string;
    context: Readonly<{
      origin: string;
      principal: Readonly<{
        kind: 'human' | 'service' | 'system';
        id: string;
      }>;
    }>;
    reasonCode: string;
    reasonNote: string | null;
    decidedAt: Date;
  },
): Promise<void> => {
  await tx.insert(orderSchema.orderSourceProposalResolutions).values({
    proposalId: input.proposalId,
    decision: input.decision,
    proposalVersion: input.proposalVersion,
    orderId: input.orderId,
    fulfillmentId: input.fulfillmentId,
    idempotencyKey: input.idempotencyKey,
    commandHash: input.commandHash,
    origin: input.context.origin,
    actorKind: input.context.principal.kind,
    actorId: input.context.principal.id,
    reasonCode: input.reasonCode,
    reasonNote: input.reasonNote,
    decidedAt: input.decidedAt,
  });
};

const appendTransition = async (
  tx: DatabaseExecutor,
  input: {
    proposalId: string;
    expectedVersion: number;
    transition: Readonly<{
      from: 'pending' | 'source_closed' | 'restored_pending';
      to: 'source_closed' | 'restored_pending' | 'accepted' | 'rejected';
      event: 'accept' | 'reject' | 'source_close' | 'restore';
      version: number;
    }>;
    idempotencyKey: string;
    commandHash: string;
    context: Readonly<{
      origin: string;
      principal: Readonly<{
        kind: 'human' | 'service' | 'system';
        id: string;
      }>;
    }>;
    reasonCode: string;
    reasonNote: string | null;
    sourceTerminalCode: 'completed' | 'canceled' | null;
    occurredAt: Date;
  },
): Promise<void> => {
  const [advanced] = await tx
    .update(orderSchema.orderSourceProposals)
    .set({
      state: input.transition.to,
      version: input.transition.version,
    })
    .where(
      and(
        eq(orderSchema.orderSourceProposals.id, input.proposalId),
        eq(orderSchema.orderSourceProposals.state, input.transition.from),
        eq(orderSchema.orderSourceProposals.version, input.expectedVersion),
      ),
    )
    .returning({ id: orderSchema.orderSourceProposals.id });
  if (advanced === undefined)
    throw new Error('Incoming proposal lifecycle changed concurrently.');
  await tx.insert(orderSchema.orderSourceProposalTransitions).values({
    proposalId: input.proposalId,
    fromState: input.transition.from,
    toState: input.transition.to,
    eventType: input.transition.event,
    proposalVersion: input.transition.version,
    idempotencyKey: input.idempotencyKey,
    commandHash: input.commandHash,
    origin: input.context.origin,
    actorKind: input.context.principal.kind,
    actorId: input.context.principal.id,
    reasonCode: input.reasonCode,
    reasonNote: input.reasonNote,
    sourceTerminalCode: input.sourceTerminalCode,
    occurredAt: input.occurredAt,
  });
};

const decisionOperations = (
  tx: DatabaseExecutor,
  customerPersistence: IncomingOrderProposalCustomerPersistence,
): DecideIncomingOrderProposalOperations => ({
  lockCommand: (idempotencyKey) =>
    lockOrderKey(tx, `orders:command:${idempotencyKey}`),
  loadResolutionByIdempotencyKey: async (idempotencyKey) => {
    const [row] = await tx
      .select()
      .from(orderSchema.orderSourceProposalResolutions)
      .where(
        eq(
          orderSchema.orderSourceProposalResolutions.idempotencyKey,
          idempotencyKey,
        ),
      )
      .limit(1);
    if (row === undefined) return null;
    const resolution = storedResolution(row);
    if (resolution === null)
      throw new Error('Stored proposal resolution disappeared.');
    return { proposalId: row.proposalId, ...resolution };
  },
  loadCanonicalOrderCommandReceipt: (idempotencyKey) =>
    loadOrderCommandReceipt(tx, idempotencyKey),
  loadTransitionByIdempotencyKey: async (idempotencyKey) => {
    const [row] = await tx
      .select()
      .from(orderSchema.orderSourceProposalTransitions)
      .where(
        eq(
          orderSchema.orderSourceProposalTransitions.idempotencyKey,
          idempotencyKey,
        ),
      )
      .limit(1);
    if (row === undefined) return null;
    return {
      proposalId: row.proposalId,
      from: row.fromState as 'pending' | 'source_closed' | 'restored_pending',
      to: row.toState as
        | 'source_closed'
        | 'restored_pending'
        | 'accepted'
        | 'rejected',
      event: row.eventType as 'accept' | 'reject' | 'source_close' | 'restore',
      proposalVersion: row.proposalVersion,
      commandHash: row.commandHash,
    };
  },
  loadProposal: (proposalId) => loadProposal(tx, proposalId),
  lockSource: (source, externalOrderId) =>
    lockOrderKey(tx, `orders:source:${source}:${externalOrderId}`),
  lockProposal: async (proposalId) => {
    await tx.execute(
      sql`select 1 from ${orderSchema.orderSourceProposals} where ${orderSchema.orderSourceProposals.id} = ${proposalId} for update`,
    );
  },
  findExactOrder: (source, externalOrderId) =>
    findExactOrder(tx, source, externalOrderId),
  resolveOrCreateExactCustomer: (proposal, now, context) =>
    resolveOrCreateExactCustomer(
      tx,
      customerPersistence,
      proposal,
      context,
      now,
    ),
  acceptProposal: async (input) => {
    const canonical: OrderInput = {
      customer: input.customer,
      displayNumber: input.proposal.snapshot.displayNumber,
      state: input.canonical.state,
      dueAt: input.proposal.snapshot.dueAt,
      currency: input.proposal.snapshot.currency,
      totalAmountCents: input.proposal.snapshot.totalAmountCents,
      balanceDueCents: input.proposal.snapshot.balanceDueCents,
      items: input.proposal.snapshot.items,
      fulfillment: {
        ...input.proposal.snapshot.fulfillment,
        releaseState: input.canonical.releaseState,
        bagCount: null,
      },
    };
    const value = await createStoredPresslyOrder(tx, {
      order: canonical,
      now: input.decidedAt,
    });
    const [sourceLink] = await tx
      .insert(orderSchema.orderSourceLinks)
      .values({
        source: input.proposal.source,
        externalOrderId: input.proposal.externalOrderId,
        orderId: value.orderId,
        createdAt: input.decidedAt,
        updatedAt: input.decidedAt,
      })
      .returning({ id: orderSchema.orderSourceLinks.id });
    if (sourceLink === undefined)
      throw new Error('Accepted proposal source link returned no row.');
    await tx.insert(orderSchema.orderSourceSnapshots).values({
      sourceLinkId: sourceLink.id,
      sourceRevisionAt: input.proposal.sourceRevisionAt,
      sourceRevisionHash: input.proposal.sourceRevisionHash,
      adapterVersion: input.proposal.adapterVersion,
      sourceLifecycleCode: null,
      normalizedPayload: input.proposal.sourceNormalizedPayload,
      observedAt: input.proposal.observedAt,
      createdAt: input.decidedAt,
      updatedAt: input.decidedAt,
    });
    const proposalCustomer = input.proposal.snapshot.customer;
    await tx.insert(orderSchema.orderSourceCustomerRefs).values({
      orderSourceLinkId: sourceLink.id,
      externalUserId: proposalCustomer?.externalUserId ?? null,
      resolvedUserId:
        input.customer.resolution === 'resolved' ? input.customer.userId : null,
      resolution: input.customer.resolution,
      observedAt: input.proposal.observedAt,
      updatedAt: input.decidedAt,
    });
    await saveOrderCommandReceipt(tx, {
      idempotencyKey: input.idempotencyKey,
      commandHash: input.commandHash,
      context: input.context,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
      value,
      now: input.decidedAt,
    });
    await appendTransition(tx, {
      proposalId: input.proposal.id,
      expectedVersion: input.proposal.version,
      transition: input.transition,
      idempotencyKey: input.idempotencyKey,
      commandHash: input.commandHash,
      context: input.context,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
      sourceTerminalCode: null,
      occurredAt: input.decidedAt,
    });
    await insertResolution(tx, {
      proposalId: input.proposal.id,
      decision: 'accepted',
      proposalVersion: input.transition.version,
      orderId: value.orderId,
      fulfillmentId: value.fulfillmentId,
      idempotencyKey: input.idempotencyKey,
      commandHash: input.commandHash,
      context: input.context,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
      decidedAt: input.decidedAt,
    });
    return value;
  },
  rejectProposal: (input) =>
    (async () => {
      await appendTransition(tx, {
        proposalId: input.proposal.id,
        expectedVersion: input.proposal.version,
        transition: input.transition,
        idempotencyKey: input.idempotencyKey,
        commandHash: input.commandHash,
        context: input.context,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
        sourceTerminalCode: null,
        occurredAt: input.decidedAt,
      });
      await insertResolution(tx, {
        proposalId: input.proposal.id,
        decision: 'rejected',
        proposalVersion: input.transition.version,
        orderId: null,
        fulfillmentId: null,
        idempotencyKey: input.idempotencyKey,
        commandHash: input.commandHash,
        context: input.context,
        reasonCode: input.reasonCode,
        reasonNote: input.reasonNote,
        decidedAt: input.decidedAt,
      });
    })(),
  restoreProposal: async (input) => {
    await appendTransition(tx, {
      proposalId: input.proposal.id,
      expectedVersion: input.proposal.version,
      transition: input.transition,
      idempotencyKey: input.idempotencyKey,
      commandHash: input.commandHash,
      context: input.context,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
      sourceTerminalCode: null,
      occurredAt: input.restoredAt,
    });
    return {
      proposalId: input.proposal.id,
      state: 'restored_pending',
      version: input.transition.version,
      replayed: false,
    };
  },
});

const closeSourceOperations = (
  tx: DatabaseExecutor,
): CloseIncomingOrderSourceOperations => ({
  lockSource: (source, externalOrderId) =>
    lockOrderKey(tx, `orders:source:${source}:${externalOrderId}`),
  findExactOrder: (source, externalOrderId) =>
    findExactOrder(tx, source, externalOrderId),
  findProposal: (source, externalOrderId) =>
    findProposal(tx, source, externalOrderId),
  lockProposal: async (proposalId) => {
    await tx.execute(
      sql`select 1 from ${orderSchema.orderSourceProposals} where ${orderSchema.orderSourceProposals.id} = ${proposalId} for update`,
    );
  },
  findTombstone: (source, externalOrderId) =>
    findTombstone(tx, source, externalOrderId),
  createTombstone: async (command, proposalId) => {
    const [created] = await tx
      .insert(orderSchema.orderSourceTerminalTombstones)
      .values({
        source: command.source,
        externalOrderId: command.externalOrderId,
        proposalId,
        terminalCode: command.terminalCode,
        sourceRevisionAt: command.revision.at,
        sourceRevisionHash: command.revision.hash,
        adapterVersion: command.revision.adapterVersion,
        normalizedPayload: command.revision.normalizedPayload,
        observedAt: command.revision.observedAt,
        createdAt: command.revision.observedAt,
      })
      .returning();
    if (created === undefined)
      throw new Error('Incoming source tombstone insert returned no row.');
    return storedTombstone(created);
  },
  closeProposal: async (input) => {
    await appendTransition(tx, {
      proposalId: input.proposal.id,
      expectedVersion: input.proposal.version,
      transition: input.transition,
      idempotencyKey: input.idempotencyKey,
      commandHash: input.commandHash,
      context: input.command.context,
      reasonCode: 'source_reported_terminal',
      reasonNote: null,
      sourceTerminalCode: input.command.terminalCode,
      occurredAt: input.closedAt,
    });
    return {
      outcome: 'source_closed',
      proposalId: input.proposal.id,
      version: input.transition.version,
      canonical: null,
      replayed: false,
    };
  },
});

type IncomingCursor = Readonly<{
  view: 'needs_review' | 'source_closed';
  observedAt: Date;
  id: string;
}>;

const encodeCursor = (cursor: IncomingCursor): string =>
  Buffer.from(
    JSON.stringify([cursor.view, cursor.observedAt.toISOString(), cursor.id]),
  ).toString('base64url');

const decodeCursor = (cursor: string): IncomingCursor | null => {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 3 ||
      typeof parsed[0] !== 'string' ||
      typeof parsed[1] !== 'string' ||
      typeof parsed[2] !== 'string' ||
      (parsed[0] !== 'needs_review' && parsed[0] !== 'source_closed')
    )
      throw new Error('shape');
    const observedAt = new Date(parsed[1]);
    if (!Number.isFinite(observedAt.getTime()) || parsed[2].trim() === '')
      throw new Error('value');
    return { view: parsed[0], observedAt, id: parsed[2] };
  } catch {
    return null;
  }
};

export const makePostgresIncomingOrderProposalRepository = (
  db: Database,
  customerPersistence: IncomingOrderProposalCustomerPersistence,
): ProposeIncomingOrderRepository &
  CloseIncomingOrderSourceRepository &
  DecideIncomingOrderProposalRepository &
  ListIncomingOrderProposalsRepository => ({
  transaction: (work) =>
    db.transaction((tx) =>
      work({
        ...proposalOperations(tx),
        ...closeSourceOperations(tx),
        ...decisionOperations(tx, customerPersistence),
      }),
    ),
  listPending: async (query) => {
    const cursor = query.cursor === null ? null : decodeCursor(query.cursor);
    if (
      query.cursor !== null &&
      (cursor === null || cursor.view !== query.view)
    )
      return { kind: 'invalid_cursor' };
    const cursorPredicate =
      cursor === null
        ? undefined
        : or(
            lt(orderSchema.orderSourceProposals.observedAt, cursor.observedAt),
            and(
              eq(
                orderSchema.orderSourceProposals.observedAt,
                cursor.observedAt,
              ),
              lt(orderSchema.orderSourceProposals.id, cursor.id),
            ),
          );
    const rows = await db
      .select({
        proposal: orderSchema.orderSourceProposals,
        linkedOrderId: orderSchema.orderSourceLinks.orderId,
        tombstone: orderSchema.orderSourceTerminalTombstones,
      })
      .from(orderSchema.orderSourceProposals)
      .leftJoin(
        orderSchema.orderSourceLinks,
        and(
          eq(
            orderSchema.orderSourceLinks.source,
            orderSchema.orderSourceProposals.source,
          ),
          eq(
            orderSchema.orderSourceLinks.externalOrderId,
            orderSchema.orderSourceProposals.externalOrderId,
          ),
        ),
      )
      .leftJoin(
        orderSchema.orderSourceTerminalTombstones,
        and(
          eq(
            orderSchema.orderSourceTerminalTombstones.source,
            orderSchema.orderSourceProposals.source,
          ),
          eq(
            orderSchema.orderSourceTerminalTombstones.externalOrderId,
            orderSchema.orderSourceProposals.externalOrderId,
          ),
        ),
      )
      .where(
        and(
          eq(orderSchema.orderSourceProposals.locationId, query.locationId),
          query.view === 'needs_review'
            ? inArray(orderSchema.orderSourceProposals.state, [
                'pending',
                'restored_pending',
              ])
            : eq(orderSchema.orderSourceProposals.state, 'source_closed'),
          cursorPredicate,
        ),
      )
      .orderBy(
        desc(orderSchema.orderSourceProposals.observedAt),
        desc(orderSchema.orderSourceProposals.id),
      )
      .limit(query.limit + 1);
    const pageRows = rows.slice(0, query.limit);
    const items = pageRows.map(({ proposal, linkedOrderId, tombstone }) => ({
      id: proposal.id,
      version: proposal.version,
      state: proposal.state as 'pending' | 'source_closed' | 'restored_pending',
      source: proposal.source,
      externalOrderId: proposal.externalOrderId,
      locationId: proposal.locationId,
      displayNumber: proposal.displayNumber,
      customer:
        proposal.customerDisplayName === null &&
        proposal.customerPhone === null &&
        proposal.customerEmail === null
          ? null
          : {
              displayName: proposal.customerDisplayName,
              phone: proposal.customerPhone,
              email: proposal.customerEmail,
            },
      dueAt: proposal.dueAt,
      estimatedWeightLbs: proposal.estimatedWeightLbs,
      sourceReportedAt: proposal.sourceRevisionAt,
      reportedAt: proposal.observedAt,
      sourceClosure:
        proposal.state === 'source_closed' && tombstone !== null
          ? {
              kind: tombstone.terminalCode as 'completed' | 'canceled',
              observedAt: tombstone.observedAt,
            }
          : null,
      availableActions:
        proposal.state === 'source_closed'
          ? (['restore'] as const)
          : linkedOrderId === null
            ? (['accept', 'reject'] as const)
            : (['reject'] as const),
      acceptBlockedReason:
        linkedOrderId === null ? null : ('exact_order_exists' as const),
    }));
    const last = pageRows.at(-1)?.proposal;
    return {
      kind: 'ok',
      value: {
        items,
        nextCursor:
          rows.length > query.limit && last !== undefined
            ? encodeCursor({
                view: query.view,
                observedAt: last.observedAt,
                id: last.id,
              })
            : null,
      },
    };
  },
});

/**
 * Worker-facing persistence is deliberately narrower than the manager
 * decision repository. Ingestion can only create an immutable proposal; it
 * cannot gain access to customer creation or proposal acceptance by sharing
 * the API composition.
 */
export const makePostgresIncomingOrderProposalSubmissionRepository = (
  db: Database,
): ProposeIncomingOrderRepository & CloseIncomingOrderSourceRepository => ({
  transaction: (work) =>
    db.transaction((tx) =>
      work({
        ...proposalOperations(tx),
        ...closeSourceOperations(tx),
      }),
    ),
});
