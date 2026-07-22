import {
  and,
  eq,
  orders as schema,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import {
  fulfillmentReleaseAuthorityField,
  orderSourceFields,
} from '../order-field-authority.policy.ts';
import {
  createOrderRows,
  emitFulfillmentDemand,
  insertOrderItems,
  loadOrderAggregate,
  lockOrderKey,
  upsertOrderAuthorities,
} from '../persistence/postgres-order.shared.ts';
import type {
  ObserveOrderSourceOperations,
  ObserveOrderSourceRepository,
} from './observe-order-source.port.ts';

const makeOperations = (
  tx: DatabaseExecutor,
): ObserveOrderSourceOperations => ({
  lockSource: async (command) =>
    lockOrderKey(
      tx,
      `orders:source:${command.source}:${command.externalOrderId}`,
    ),
  loadSource: async (command) => {
    const [link] = await tx
      .select()
      .from(schema.orderSourceLinks)
      .where(
        and(
          eq(schema.orderSourceLinks.source, command.source),
          eq(schema.orderSourceLinks.externalOrderId, command.externalOrderId),
        ),
      )
      .limit(1);
    if (link === undefined) return null;
    const aggregate = await loadOrderAggregate(tx, link.orderId);
    if (aggregate === null) throw new Error('Order source link is orphaned.');
    if (aggregate.fulfillment.typeCode !== command.fulfillment.typeCode)
      throw new Error('Order source fulfillment type changed.');
    const [snapshot] = await tx
      .select()
      .from(schema.orderSourceSnapshots)
      .where(eq(schema.orderSourceSnapshots.sourceLinkId, link.id))
      .limit(1);
    const rows = await tx
      .select()
      .from(schema.orderFieldAuthorities)
      .where(eq(schema.orderFieldAuthorities.orderId, aggregate.order.id));
    const authorities = new Map(
      rows.map((row) => {
        if (row.authority !== 'pressly' && row.authority !== 'source')
          throw new Error('Stored Order field authority is invalid.');
        return [
          row.fieldName,
          { authority: row.authority, source: row.source },
        ] as const;
      }),
    );
    return {
      ...aggregate,
      sourceLinkId: link.id,
      revision:
        snapshot === undefined
          ? null
          : {
              at: snapshot.sourceRevisionAt,
              hash: snapshot.sourceRevisionHash,
            },
      authorities,
    };
  },
  createSourceOrder: async (command) => {
    const value = await createOrderRows(
      tx,
      command,
      command.revision.observedAt,
    );
    const [link] = await tx
      .insert(schema.orderSourceLinks)
      .values({
        source: command.source,
        externalOrderId: command.externalOrderId,
        orderId: value.orderId,
        createdAt: command.revision.observedAt,
        updatedAt: command.revision.observedAt,
      })
      .returning({ id: schema.orderSourceLinks.id });
    if (link === undefined)
      throw new Error('Order source link insert returned no row.');
    await tx.insert(schema.orderSourceCustomerRefs).values({
      orderSourceLinkId: link.id,
      externalUserId: command.customer.externalUserId,
      resolvedUserId: command.customer.userId,
      resolution: command.customer.resolution,
      observedAt: command.revision.observedAt,
      updatedAt: command.revision.observedAt,
    });
    await tx.insert(schema.orderSourceSnapshots).values({
      sourceLinkId: link.id,
      sourceRevisionAt: command.revision.at,
      sourceRevisionHash: command.revision.hash,
      adapterVersion: command.revision.adapterVersion,
      sourceLifecycleCode: command.revision.lifecycleCode,
      normalizedPayload: command.revision.normalizedPayload,
      observedAt: command.revision.observedAt,
      createdAt: command.revision.observedAt,
      updatedAt: command.revision.observedAt,
    });
    await upsertOrderAuthorities(tx, {
      orderId: value.orderId,
      fields: [
        ...orderSourceFields,
        fulfillmentReleaseAuthorityField(command.fulfillment.typeCode),
      ],
      authority: 'source',
      source: command.source,
      now: command.revision.observedAt,
    });
    return value;
  },
  applySourceOrder: async (input) => {
    const now = input.observation.revision.observedAt;
    await tx
      .update(schema.orders)
      .set({
        ...input.nextOrder,
        version: input.nextOrderVersion,
        updatedAt: now,
      })
      .where(eq(schema.orders.id, input.current.order.id));
    await tx
      .delete(schema.orderItems)
      .where(eq(schema.orderItems.orderId, input.current.order.id));
    await insertOrderItems(tx, input.current.order.id, input.items, now);
    await tx
      .update(schema.orderFulfillments)
      .set({
        ...input.nextFulfillment,
        version: input.nextFulfillmentVersion,
        updatedAt: now,
      })
      .where(eq(schema.orderFulfillments.id, input.current.fulfillment.id));
    await tx
      .insert(schema.orderSourceCustomerRefs)
      .values({
        orderSourceLinkId: input.current.sourceLinkId,
        externalUserId: input.observation.customer.externalUserId,
        resolvedUserId: input.observation.customer.userId,
        resolution: input.observation.customer.resolution,
        observedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.orderSourceCustomerRefs.orderSourceLinkId,
        set: {
          externalUserId: input.observation.customer.externalUserId,
          resolvedUserId: input.observation.customer.userId,
          resolution: input.observation.customer.resolution,
          observedAt: now,
          updatedAt: now,
        },
      });
    await tx
      .insert(schema.orderSourceSnapshots)
      .values({
        sourceLinkId: input.current.sourceLinkId,
        sourceRevisionAt: input.observation.revision.at,
        sourceRevisionHash: input.observation.revision.hash,
        adapterVersion: input.observation.revision.adapterVersion,
        sourceLifecycleCode: input.observation.revision.lifecycleCode,
        normalizedPayload: input.observation.revision.normalizedPayload,
        observedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.orderSourceSnapshots.sourceLinkId,
        set: {
          sourceRevisionAt: input.observation.revision.at,
          sourceRevisionHash: input.observation.revision.hash,
          adapterVersion: input.observation.revision.adapterVersion,
          sourceLifecycleCode: input.observation.revision.lifecycleCode,
          normalizedPayload: input.observation.revision.normalizedPayload,
          observedAt: now,
          updatedAt: now,
        },
      });
    await upsertOrderAuthorities(tx, {
      orderId: input.current.order.id,
      fields: input.missingAuthorities,
      authority: 'source',
      source: input.observation.source,
      now,
    });
    await emitFulfillmentDemand(tx, {
      orderId: input.current.order.id,
      fulfillmentId: input.current.fulfillment.id,
      aggregateVersion: input.nextOrderVersion,
      displayNumber: input.nextOrder.displayNumber,
      dueAt: input.nextOrder.dueAt,
      commercialState: input.nextOrder.state,
      fulfillment: input.nextFulfillment,
      now,
    });
  },
});

export const makePostgresObserveOrderSourceRepository = (
  db: Database,
): ObserveOrderSourceRepository => ({
  transaction: (work) => db.transaction((tx) => work(makeOperations(tx))),
});
