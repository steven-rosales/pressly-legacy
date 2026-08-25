import type { CellOutcome } from '@pressly/cells';
import type { OrderLocationFactsV1Capability } from '@pressly/access-system/capabilities/order-location-facts-v1';
import type { ResolveExactSourceCustomerV1Capability } from '@pressly/customers-system/capabilities/resolve-exact-source-customer-v1';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import { mapUnknownError } from '@pressly/errors/app-error';
import {
  databaseError,
  invariantViolationError,
} from '@pressly/errors/factories';
import type { OrderCustomer } from '../../../model/canonical-order/model.ts';
import {
  orderCustomerSnapshotFromReference,
  type OrderCustomerSnapshot,
} from '../../../model/canonical-order/customer-snapshot.ts';
import { hashOrderCommand } from '../../../model/canonical-order/policy.ts';
import {
  decideIncomingOrderProposal,
  incomingOrderProposalDecisionCommandValid,
} from '../../../model/incoming-order-proposal/lifecycle.ts';
import type {
  IncomingOrderProposal,
  IncomingOrderProposalDecisionResult,
} from '../../../model/incoming-order-proposal/model.ts';
import {
  createStoredOrder,
  loadOrderCommandReceipt,
  saveOrderCommandReceipt,
} from '../../../postgres/canonical-order/canonical-order.postgres.ts';
import {
  appendIncomingOrderProposalTransition,
  findExactCanonicalOrder,
  insertIncomingOrderProposalResolution,
  loadIncomingOrderProposal,
  loadIncomingOrderProposalResolutionByIdempotencyKey,
  lockIncomingOrderCommand,
  lockIncomingOrderProposal,
  lockIncomingOrderSource,
} from '../../../postgres/incoming-order-proposal/incoming-order-proposal.postgres.ts';
import type {
  AcceptIncomingOrderProposalCommand,
  AcceptIncomingOrderProposalExpectedFailure,
} from './types.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';

const failure = Object.freeze({
  invalid: (): AcceptIncomingOrderProposalExpectedFailure => ({
    kind: 'validation',
    code: 'incoming_order_proposal_accept_invalid',
    message: 'The incoming Order acceptance is incomplete.',
  }),
  notFound: (): AcceptIncomingOrderProposalExpectedFailure => ({
    kind: 'not_found',
    code: 'incoming_order_proposal_not_found',
    message: 'The incoming Order proposal was not found.',
  }),
  versionConflict: (): AcceptIncomingOrderProposalExpectedFailure => ({
    kind: 'conflict',
    code: 'incoming_order_proposal_version_conflict',
    message:
      'The incoming Order proposal changed after this request was prepared.',
  }),
  invalidTransition: (): AcceptIncomingOrderProposalExpectedFailure => ({
    kind: 'conflict',
    code: 'incoming_order_proposal_transition_invalid',
    message: 'The incoming Order proposal has already been decided.',
  }),
  identityConflict: (): AcceptIncomingOrderProposalExpectedFailure => ({
    kind: 'conflict',
    code: 'incoming_order_proposal_identity_conflict',
    message: 'This exact source Order is already linked to Pressly.',
  }),
  idempotencyConflict: (): AcceptIncomingOrderProposalExpectedFailure => ({
    kind: 'conflict',
    code: 'order_idempotency_conflict',
    message: 'The idempotency key belongs to a different Order command.',
  }),
  customerResolution: (
    code:
      | 'canonical_source_user_business_conflict'
      | 'user_idempotency_conflict',
  ): AcceptIncomingOrderProposalExpectedFailure =>
    code === 'canonical_source_user_business_conflict'
      ? {
          kind: 'conflict',
          code,
          message:
            'The source customer is already associated with another business.',
        }
      : {
          kind: 'conflict',
          code,
          message:
            'The customer idempotency key belongs to another user command.',
        },
});

const businessIdForLocation = async (
  capability: OrderLocationFactsV1Capability,
  locationId: string,
): Promise<string> => {
  const location = await capability.execute({
    locationId,
  });
  if (location === null)
    throw invariantViolationError({
      code: 'incoming_order_location_ancestry_missing',
      message:
        'Incoming Order proposal location has no authoritative business ancestry.',
      safeMessage: 'Stored incoming order data is inconsistent.',
    });
  return location.businessId;
};

const resolveCustomer = async (
  capability: ResolveExactSourceCustomerV1Capability,
  businessId: string,
  proposal: IncomingOrderProposal,
  command: AcceptIncomingOrderProposalCommand,
  now: Date,
): Promise<
  | Readonly<{
      kind: 'success';
      customer: OrderCustomer;
      customerSnapshot: OrderCustomerSnapshot | null;
    }>
  | Readonly<{
      kind: 'failure';
      code:
        | 'canonical_source_user_business_conflict'
        | 'user_idempotency_conflict';
    }>
> => {
  const customer = proposal.snapshot.customer;
  if (customer === null)
    return {
      kind: 'success',
      customer: {
        resolution: 'not_provided',
        userId: null,
        externalUserId: null,
      },
      customerSnapshot: null,
    };
  const resolved = await capability.execute({
    businessId,
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
    context: command.context,
    now,
  });
  return resolved.kind === 'failure'
    ? { kind: 'failure', code: resolved.failure.code }
    : {
        kind: 'success',
        customer: {
          resolution: 'resolved',
          userId: resolved.value.customer.customerId,
          externalUserId: customer.externalUserId,
        },
        customerSnapshot: orderCustomerSnapshotFromReference(
          resolved.value.customer,
        ),
      };
};

export const makeAcceptIncomingOrderProposalPostgresWriter =
  (dependencies: {
    db: PostgresDatabase;
    schema: OrdersSchema;
    clock: Clock;
    orderLocationFactsV1: OrderLocationFactsV1Capability;
    resolveExactSourceCustomerV1: ResolveExactSourceCustomerV1Capability;
  }) =>
  async (
    command: AcceptIncomingOrderProposalCommand,
  ): Promise<
    CellOutcome<
      IncomingOrderProposalDecisionResult,
      AcceptIncomingOrderProposalExpectedFailure
    >
  > => {
    const orders = dependencies.schema;
    if (
      !incomingOrderProposalDecisionCommandValid(command) ||
      command.reasonCode !== 'incoming_order_accepted'
    )
      return { kind: 'failure', failure: failure.invalid() };
    try {
      const commandHash = hashOrderCommand(command);
      const now = dependencies.clock.now();
      const priorResolution =
        await loadIncomingOrderProposalResolutionByIdempotencyKey(
          dependencies.db,
          orders,
          command.idempotencyKey,
        );
      if (priorResolution !== null)
        return priorResolution.commandHash === commandHash
          ? {
              kind: 'success',
              value: {
                proposalId: priorResolution.proposalId,
                state: priorResolution.decision,
                version: priorResolution.proposalVersion,
                orderId: priorResolution.orderId,
                fulfillmentId: priorResolution.fulfillmentId,
                replayed: true,
              },
            }
          : { kind: 'failure', failure: failure.idempotencyConflict() };

      const priorCanonicalReceipt = await loadOrderCommandReceipt(
        dependencies.db,
        orders,
        command.idempotencyKey,
      );
      if (priorCanonicalReceipt !== null) {
        if (priorCanonicalReceipt.commandHash !== commandHash)
          return { kind: 'failure', failure: failure.idempotencyConflict() };
        throw invariantViolationError({
          code: 'incoming_order_proposal_resolution_missing',
          message:
            'Canonical Order receipt exists without its proposal resolution.',
          safeMessage: 'Stored incoming order data is inconsistent.',
        });
      }

      const preparedProposal = await loadIncomingOrderProposal(
        dependencies.db,
        orders,
        command.proposalId,
      );
      if (
        preparedProposal === null ||
        preparedProposal.locationId !== command.locationId
      )
        return { kind: 'failure', failure: failure.notFound() };
      if (
        decideIncomingOrderProposal(preparedProposal.state, 'accept').kind ===
        'denied'
      )
        return { kind: 'failure', failure: failure.invalidTransition() };
      if (preparedProposal.version !== command.expectedVersion)
        return { kind: 'failure', failure: failure.versionConflict() };
      if (
        (await findExactCanonicalOrder(
          dependencies.db,
          orders,
          preparedProposal.source,
          preparedProposal.externalOrderId,
        )) !== null
      )
        return { kind: 'failure', failure: failure.identityConflict() };

      const businessId = await businessIdForLocation(
        dependencies.orderLocationFactsV1,
        preparedProposal.locationId,
      );
      const customer = await resolveCustomer(
        dependencies.resolveExactSourceCustomerV1,
        businessId,
        preparedProposal,
        command,
        now,
      );
      if (customer.kind === 'failure')
        return {
          kind: 'failure',
          failure: failure.customerResolution(customer.code),
        };

      const outcome = await dependencies.db.transaction(async (transaction) => {
        await lockIncomingOrderCommand(transaction, command.idempotencyKey);
        const resolution =
          await loadIncomingOrderProposalResolutionByIdempotencyKey(
            transaction,
            orders,
            command.idempotencyKey,
          );
        if (resolution !== null)
          return resolution.commandHash === commandHash
            ? {
                kind: 'ok' as const,
                value: {
                  proposalId: resolution.proposalId,
                  state: resolution.decision,
                  version: resolution.proposalVersion,
                  orderId: resolution.orderId,
                  fulfillmentId: resolution.fulfillmentId,
                  replayed: true,
                },
              }
            : { kind: 'idempotency_conflict' as const };

        const canonicalReceipt = await loadOrderCommandReceipt(
          transaction,
          orders,
          command.idempotencyKey,
        );
        if (canonicalReceipt !== null) {
          if (canonicalReceipt.commandHash !== commandHash)
            return { kind: 'idempotency_conflict' as const };
          throw invariantViolationError({
            code: 'incoming_order_proposal_resolution_missing',
            message:
              'Canonical Order receipt exists without its proposal resolution.',
            safeMessage: 'Stored incoming order data is inconsistent.',
          });
        }

        const discovered = await loadIncomingOrderProposal(
          transaction,
          orders,
          command.proposalId,
        );
        if (discovered !== null) {
          await lockIncomingOrderSource(
            transaction,
            discovered.source,
            discovered.externalOrderId,
          );
          await lockIncomingOrderProposal(
            transaction,
            orders,
            command.proposalId,
          );
        }
        const proposal =
          discovered === null
            ? null
            : await loadIncomingOrderProposal(
                transaction,
                orders,
                command.proposalId,
              );
        if (proposal === null || proposal.locationId !== command.locationId)
          return { kind: 'not_found' as const };
        const decision = decideIncomingOrderProposal(proposal.state, 'accept');
        if (decision.kind === 'denied')
          return { kind: 'invalid_transition' as const };
        if (proposal.version !== command.expectedVersion)
          return { kind: 'version_conflict' as const };
        if (
          proposal.source !== preparedProposal.source ||
          proposal.externalOrderId !== preparedProposal.externalOrderId ||
          proposal.sourceRevisionHash !== preparedProposal.sourceRevisionHash ||
          proposal.sourceRevisionAt.getTime() !==
            preparedProposal.sourceRevisionAt.getTime() ||
          proposal.adapterVersion !== preparedProposal.adapterVersion ||
          proposal.observedAt.getTime() !==
            preparedProposal.observedAt.getTime()
        )
          return { kind: 'version_conflict' as const };
        if (
          (await findExactCanonicalOrder(
            transaction,
            orders,
            proposal.source,
            proposal.externalOrderId,
          )) !== null
        )
          return { kind: 'identity_conflict' as const };

        const value = await createStoredOrder(transaction, orders, {
          businessId,
          order: {
            customer: customer.customer,
            displayNumber: proposal.snapshot.displayNumber,
            state: 'open',
            dueAt: proposal.snapshot.dueAt,
            currency: proposal.snapshot.currency,
            totalAmountCents: proposal.snapshot.totalAmountCents,
            balanceDueCents: proposal.snapshot.balanceDueCents,
            items: proposal.snapshot.items,
            fulfillment: {
              ...proposal.snapshot.fulfillment,
              releaseState: 'unreleased',
            },
          },
          customerSnapshot: customer.customerSnapshot,
          now,
        });
        const [sourceLink] = await transaction
          .insert(orders.orderSourceLinks)
          .values({
            source: proposal.source,
            externalOrderId: proposal.externalOrderId,
            orderId: value.orderId,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: orders.orderSourceLinks.id });
        if (sourceLink === undefined)
          throw invariantViolationError({
            code: 'incoming_order_source_link_insert_result_missing',
            message: 'Accepted proposal source link returned no row.',
            safeMessage: 'Stored incoming order data is inconsistent.',
          });
        await transaction.insert(orders.orderSourceSnapshots).values({
          sourceLinkId: sourceLink.id,
          sourceRevisionAt: proposal.sourceRevisionAt,
          sourceRevisionHash: proposal.sourceRevisionHash,
          adapterVersion: proposal.adapterVersion,
          sourceLifecycleCode: null,
          normalizedPayload: proposal.sourceNormalizedPayload,
          observedAt: proposal.observedAt,
          createdAt: now,
          updatedAt: now,
        });
        await transaction.insert(orders.orderSourceCustomerRefs).values({
          orderSourceLinkId: sourceLink.id,
          externalUserId: proposal.snapshot.customer?.externalUserId ?? null,
          resolvedCustomerId:
            customer.customer.resolution === 'resolved'
              ? customer.customer.userId
              : null,
          resolution: customer.customer.resolution,
          observedAt: proposal.observedAt,
          updatedAt: now,
        });
        await saveOrderCommandReceipt(transaction, orders, {
          idempotencyKey: command.idempotencyKey,
          commandHash,
          context: command.context,
          reasonCode: command.reasonCode,
          reasonNote: command.reasonNote,
          value,
          now,
        });
        const version = proposal.version + 1;
        await appendIncomingOrderProposalTransition(transaction, orders, {
          proposalId: proposal.id,
          expectedVersion: proposal.version,
          transition: {
            from: decision.from as 'pending' | 'restored_pending',
            to: 'accepted',
            event: 'accept',
            version,
          },
          idempotencyKey: command.idempotencyKey,
          commandHash,
          context: command.context,
          reasonCode: command.reasonCode,
          reasonNote: command.reasonNote,
          sourceTerminalCode: null,
          occurredAt: now,
        });
        await insertIncomingOrderProposalResolution(transaction, orders, {
          proposalId: proposal.id,
          decision: 'accepted',
          proposalVersion: version,
          orderId: value.orderId,
          fulfillmentId: value.fulfillmentId,
          idempotencyKey: command.idempotencyKey,
          commandHash,
          context: command.context,
          reasonCode: command.reasonCode,
          reasonNote: command.reasonNote,
          decidedAt: now,
        });
        return {
          kind: 'ok' as const,
          value: {
            proposalId: proposal.id,
            state: 'accepted' as const,
            version,
            orderId: value.orderId,
            fulfillmentId: value.fulfillmentId,
            replayed: false,
          },
        };
      });

      if (outcome.kind === 'ok')
        return { kind: 'success', value: outcome.value };
      if (outcome.kind === 'not_found')
        return { kind: 'failure', failure: failure.notFound() };
      if (outcome.kind === 'version_conflict')
        return { kind: 'failure', failure: failure.versionConflict() };
      if (outcome.kind === 'invalid_transition')
        return { kind: 'failure', failure: failure.invalidTransition() };
      if (outcome.kind === 'identity_conflict')
        return { kind: 'failure', failure: failure.identityConflict() };
      return { kind: 'failure', failure: failure.idempotencyConflict() };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'incoming_order_proposal_accept_failed',
          message: 'The incoming Order proposal could not be accepted.',
          safeMessage: 'The incoming Order proposal could not be accepted.',
          status: 503,
          cause,
        }),
      );
    }
  };
