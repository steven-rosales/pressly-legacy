import { isJsonObject, type JsonObject, type JsonValue } from '@pressly/codec';
import type * as orderSchema from '@pressly/db/schema/orders';
import { incomingOrderProposalInvariant } from '../../../language/incoming-order-proposal/incoming-order-proposal.error.ts';
import type {
  IncomingOrderProposal,
  IncomingOrderProposalResolution,
  IncomingOrderProposalTransition,
  IncomingOrderSourceTombstone,
} from '../../../language/incoming-order-proposal/incoming-order-proposal.entity.ts';
import type {
  IncomingOrderProposalCustomer,
  IncomingOrderProposalSnapshot,
} from '../../../language/incoming-order-proposal/incoming-order-proposal.model.ts';
import type {
  DirectFulfillmentInput,
  OrderItemInput,
} from '../../../language/order/order.model.ts';
import { isOrderInputValid } from '../../../language/order/order-input.policy.ts';

type ProposalRow = typeof orderSchema.orderSourceProposals.$inferSelect;
type ResolutionRow =
  | typeof orderSchema.orderSourceProposalResolutions.$inferSelect
  | null;
type TombstoneRow =
  | typeof orderSchema.orderSourceTerminalTombstones.$inferSelect
  | null;
type TransitionRow =
  typeof orderSchema.orderSourceProposalTransitions.$inferSelect;

const isProposalTransitionFromState = (
  value: string,
): value is IncomingOrderProposalTransition['from'] =>
  value === 'pending' ||
  value === 'source_closed' ||
  value === 'restored_pending';

const isProposalTransitionToState = (
  value: string,
): value is IncomingOrderProposalTransition['to'] =>
  value === 'source_closed' ||
  value === 'restored_pending' ||
  value === 'accepted' ||
  value === 'rejected';

const isProposalTransitionEvent = (
  value: string,
): value is IncomingOrderProposalTransition['event'] =>
  value === 'accept' ||
  value === 'reject' ||
  value === 'source_close' ||
  value === 'restore';

const nullableString = (value: JsonValue | undefined): value is string | null =>
  typeof value === 'string' || value === null;

const incomingOrderProposalItemFromJson = (
  value: JsonValue,
): OrderItemInput => {
  if (
    !isJsonObject(value) ||
    typeof value['lineKey'] !== 'string' ||
    typeof value['itemType'] !== 'string' ||
    typeof value['code'] !== 'string' ||
    typeof value['description'] !== 'string' ||
    typeof value['quantity'] !== 'number' ||
    typeof value['unit'] !== 'string' ||
    typeof value['unitPriceCents'] !== 'number' ||
    typeof value['totalAmountCents'] !== 'number' ||
    !isJsonObject(value['sourceMetadata'])
  )
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_ITEM_INVALID',
      'Stored incoming proposal item is invalid.',
    );

  return {
    lineKey: value['lineKey'],
    itemType: value['itemType'],
    code: value['code'],
    description: value['description'],
    quantity: value['quantity'],
    unit: value['unit'],
    unitPriceCents: value['unitPriceCents'],
    totalAmountCents: value['totalAmountCents'],
    sourceMetadata: value['sourceMetadata'],
  };
};

const incomingOrderProposalFulfillmentFromJson = (
  value: JsonValue | undefined,
): DirectFulfillmentInput => {
  if (
    !isJsonObject(value) ||
    typeof value['typeCode'] !== 'string' ||
    typeof value['locationId'] !== 'string' ||
    !(
      typeof value['estimatedWeightLbs'] === 'number' ||
      value['estimatedWeightLbs'] === null
    ) ||
    !nullableString(value['estimatedWeightSource'])
  )
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_FULFILLMENT_INVALID',
      'Stored incoming proposal fulfillment is invalid.',
    );

  return {
    typeCode: value['typeCode'],
    locationId: value['locationId'],
    estimatedWeightLbs: value['estimatedWeightLbs'],
    estimatedWeightSource: value['estimatedWeightSource'],
  };
};

const incomingOrderProposalCustomerFromJson = (
  value: unknown,
): IncomingOrderProposalCustomer | null => {
  if (value === null) return null;
  if (
    !isJsonObject(value) ||
    typeof value['externalUserId'] !== 'string' ||
    value['externalUserId'].trim() === '' ||
    !nullableString(value['firstName']) ||
    !nullableString(value['lastName']) ||
    !nullableString(value['businessName']) ||
    !nullableString(value['phone']) ||
    !nullableString(value['email']) ||
    !isJsonObject(value['normalizedPayload'])
  )
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_CUSTOMER_INVALID',
      'Stored incoming proposal customer is invalid.',
    );

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

const incomingOrderProposalSnapshotFromJson = (
  value: unknown,
): Readonly<{
  snapshot: IncomingOrderProposalSnapshot;
  sourceNormalizedPayload: JsonObject;
}> => {
  if (
    !isJsonObject(value) ||
    !isJsonObject(value['order']) ||
    !isJsonObject(value['source'])
  )
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_SNAPSHOT_INVALID',
      'Stored incoming proposal snapshot is invalid.',
    );

  const raw = value['order'];
  if (
    typeof raw['dueAt'] !== 'string' ||
    !nullableString(raw['displayNumber']) ||
    typeof raw['currency'] !== 'string' ||
    typeof raw['totalAmountCents'] !== 'number' ||
    !(
      typeof raw['balanceDueCents'] === 'number' ||
      raw['balanceDueCents'] === null
    ) ||
    !Array.isArray(raw['items'])
  )
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_ORDER_INVALID',
      'Stored incoming proposal Order is invalid.',
    );

  const dueAt = new Date(raw['dueAt']);
  if (!Number.isFinite(dueAt.getTime()))
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_DUE_AT_INVALID',
      'Stored incoming proposal due date is invalid.',
    );

  const snapshot: IncomingOrderProposalSnapshot = {
    customer: incomingOrderProposalCustomerFromJson(raw['customer']),
    displayNumber: raw['displayNumber'],
    dueAt,
    currency: raw['currency'],
    totalAmountCents: raw['totalAmountCents'],
    balanceDueCents: raw['balanceDueCents'],
    items: raw['items'].map(incomingOrderProposalItemFromJson),
    fulfillment: incomingOrderProposalFulfillmentFromJson(raw['fulfillment']),
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
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_ORDER_INCOMPLETE',
      'Stored incoming proposal Order is incomplete.',
    );

  return { snapshot, sourceNormalizedPayload: value['source'] };
};

export const storedIncomingOrderProposalResolutionFromRow = (
  row: ResolutionRow,
): IncomingOrderProposalResolution | null => {
  if (row === null) return null;
  if (
    (row.decision !== 'accepted' && row.decision !== 'rejected') ||
    !Number.isInteger(row.proposalVersion) ||
    row.proposalVersion <= 1
  )
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_RESOLUTION_INVALID',
      'Stored incoming proposal resolution is invalid.',
    );

  return {
    decision: row.decision,
    proposalVersion: row.proposalVersion,
    orderId: row.orderId,
    fulfillmentId: row.fulfillmentId,
    idempotencyKey: row.idempotencyKey,
    commandHash: row.commandHash,
  };
};

export const storedIncomingOrderProposalFromRows = (
  proposal: ProposalRow,
  resolution: ResolutionRow,
  tombstone: TombstoneRow = null,
): IncomingOrderProposal => {
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
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_STATE_INVALID',
      'Stored incoming proposal state is invalid.',
    );

  const parsed = incomingOrderProposalSnapshotFromJson(
    proposal.proposalSnapshot,
  );
  const parsedTombstone =
    tombstone === null
      ? null
      : storedIncomingOrderSourceTombstoneFromRow(tombstone);
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
    resolution: storedIncomingOrderProposalResolutionFromRow(resolution),
    sourceClosure:
      proposal.state === 'source_closed' && parsedTombstone !== null
        ? {
            kind: parsedTombstone.terminalCode,
            observedAt: parsedTombstone.observedAt,
          }
        : null,
  };
};

export const storedIncomingOrderProposalTransitionFromRow = (
  row: TransitionRow,
): IncomingOrderProposalTransition => {
  if (
    !isProposalTransitionFromState(row.fromState) ||
    !isProposalTransitionToState(row.toState) ||
    !isProposalTransitionEvent(row.eventType) ||
    !Number.isInteger(row.proposalVersion) ||
    row.proposalVersion < 2
  )
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_TRANSITION_INVALID',
      'Stored incoming proposal transition is invalid.',
    );

  return {
    proposalId: row.proposalId,
    from: row.fromState,
    to: row.toState,
    event: row.eventType,
    proposalVersion: row.proposalVersion,
    commandHash: row.commandHash,
  };
};

export const storedIncomingOrderSourceTombstoneFromRow = (
  row: NonNullable<TombstoneRow>,
): IncomingOrderSourceTombstone => {
  if (row.terminalCode !== 'completed' && row.terminalCode !== 'canceled')
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_TOMBSTONE_INVALID',
      'Stored incoming Order tombstone is invalid.',
    );

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
