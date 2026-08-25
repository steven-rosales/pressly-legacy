import { isJsonObject, type JsonObject, type JsonValue } from '@pressly/codec';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  IncomingOrderProposal,
  IncomingOrderProposalCustomer,
  IncomingOrderProposalResolution,
  IncomingOrderProposalSnapshot,
  IncomingOrderSourceTombstone,
} from '../../model/incoming-order-proposal/model.ts';
import {
  isOrderInputValid,
  type DirectFulfillmentInput,
  type OrderItemInput,
} from '../../model/order-input.ts';
import type { OrdersSchema } from '../../schema/orders.ts';

type ProposalRow = OrdersSchema['orderSourceProposals']['$inferSelect'];
type ResolutionRow =
  | OrdersSchema['orderSourceProposalResolutions']['$inferSelect']
  | null;
type TombstoneRow =
  | OrdersSchema['orderSourceTerminalTombstones']['$inferSelect']
  | null;

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Stored incoming order data is inconsistent.',
  });

const nullableString = (value: JsonValue | undefined): value is string | null =>
  typeof value === 'string' || value === null;

const orderItemFromJson = (value: JsonValue): OrderItemInput => {
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
    throw invariant(
      'incoming_order_proposal_item_invalid',
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

const fulfillmentFromJson = (
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
    throw invariant(
      'incoming_order_proposal_fulfillment_invalid',
      'Stored incoming proposal fulfillment is invalid.',
    );

  return {
    typeCode: value['typeCode'],
    locationId: value['locationId'],
    estimatedWeightLbs: value['estimatedWeightLbs'],
    estimatedWeightSource: value['estimatedWeightSource'],
  };
};

const customerFromJson = (
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
    throw invariant(
      'incoming_order_proposal_customer_invalid',
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

const snapshotFromJson = (
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
    throw invariant(
      'incoming_order_proposal_snapshot_invalid',
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
    throw invariant(
      'incoming_order_proposal_order_invalid',
      'Stored incoming proposal Order is invalid.',
    );

  const dueAt = new Date(raw['dueAt']);
  if (!Number.isFinite(dueAt.getTime()))
    throw invariant(
      'incoming_order_proposal_due_at_invalid',
      'Stored incoming proposal due date is invalid.',
    );

  const snapshot: IncomingOrderProposalSnapshot = {
    customer: customerFromJson(raw['customer']),
    displayNumber: raw['displayNumber'],
    dueAt,
    currency: raw['currency'],
    totalAmountCents: raw['totalAmountCents'],
    balanceDueCents: raw['balanceDueCents'],
    items: raw['items'].map(orderItemFromJson),
    fulfillment: fulfillmentFromJson(raw['fulfillment']),
  };

  if (
    !isOrderInputValid({
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
      },
    })
  )
    throw invariant(
      'incoming_order_proposal_order_incomplete',
      'Stored incoming proposal Order is incomplete.',
    );

  return { snapshot, sourceNormalizedPayload: value['source'] };
};

const resolutionFromRow = (
  row: ResolutionRow,
): IncomingOrderProposalResolution | null => {
  if (row === null) return null;
  if (
    (row.decision !== 'accepted' && row.decision !== 'rejected') ||
    !Number.isInteger(row.proposalVersion) ||
    row.proposalVersion <= 1
  )
    throw invariant(
      'incoming_order_proposal_resolution_invalid',
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

export const storedIncomingOrderSourceTombstoneFromRow = (
  row: NonNullable<TombstoneRow>,
): IncomingOrderSourceTombstone => {
  if (
    (row.terminalCode !== 'completed' && row.terminalCode !== 'canceled') ||
    !isJsonObject(row.normalizedPayload)
  )
    throw invariant(
      'incoming_order_tombstone_invalid',
      'Stored incoming Order tombstone is invalid.',
    );

  return {
    source: row.source,
    externalOrderId: row.externalOrderId,
    proposalId: row.proposalId,
    terminalCode: row.terminalCode,
    sourceRevisionAt: row.sourceRevisionAt,
    sourceRevisionHash: row.sourceRevisionHash,
    adapterVersion: row.adapterVersion,
    normalizedPayload: row.normalizedPayload,
    observedAt: row.observedAt,
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
    throw invariant(
      'incoming_order_proposal_state_invalid',
      'Stored incoming proposal state is invalid.',
    );

  const parsed = snapshotFromJson(proposal.proposalSnapshot);
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
    resolution: resolutionFromRow(resolution),
    sourceClosure:
      proposal.state === 'source_closed' && parsedTombstone !== null
        ? {
            kind: parsedTombstone.terminalCode,
            observedAt: parsedTombstone.observedAt,
          }
        : null,
  };
};
