import type { PostgresDatabase } from '@pressly/postgres/client';
import { describe, expect, it } from 'vitest';
import { processInboundEventCellDeclaration } from './cells/processing/process-inbound-event/cell.ts';
import { listDeadEventsCellDeclaration } from './cells/inbox/list-dead-events/cell.ts';
import { replayDeadEventCellDeclaration } from './cells/inbox/replay-dead-event/cell.ts';
import { receiveCentsWebhookCellDeclaration } from './cells/sources/receive-cents-webhook/cell.ts';
import { makeIngressStateSystem, makeIngressSystem } from './system.ts';
import { ingressTestSchema } from './testing/schema.ts';

const baseDependencies = () => ({
  db: { transaction: () => undefined } as unknown as PostgresDatabase,
  schema: ingressTestSchema,
  clock: { now: () => new Date('2026-08-22T16:00:00.000Z') },
  ids: { next: () => '81000000-0000-4000-8000-000000000001' },
});

const processDependencies = () => ({
  proposeIncomingOrder: async () => ({
    kind: 'success' as const,
    value: { outcome: 'proposed' },
  }),
  closeIncomingOrderSource: async () => ({
    kind: 'success' as const,
    value: { canonical: null },
  }),
  resolveSourceClosedFulfillment: async () => ({
    kind: 'success' as const,
    value: { outcome: 'already_resolved' as const },
  }),
});

describe('Ingress system owner assembly', () => {
  it('assembles exactly fourteen selected operation owners', () => {
    const system = makeIngressStateSystem(baseDependencies());

    expect(Object.keys(system.cells)).toEqual([
      'captureWebhookReceipt',
      'claimEvents',
      'completeEvent',
      'deadLetterEvent',
      'ingestEvent',
      'linkWebhookReceipt',
      'listDeadEvents',
      'measureWebhookBacklog',
      'purgeExpiredWebhookReceipts',
      'reconcileSourceLocationBindings',
      'replayDeadEvent',
      'resolveSourceLocation',
      'retryEvent',
      'receiveCentsWebhook',
    ]);
    expect(
      Object.values(system.cells).map(({ id, kind, surfaces, execute }) => ({
        id,
        kind,
        surfaces,
        executable: typeof execute === 'function',
      })),
    ).toEqual([
      {
        id: 'ingress.capture-webhook-receipt.v1',
        kind: 'command',
        surfaces: [],
        executable: true,
      },
      {
        id: 'ingress.claim-events.v1',
        kind: 'command',
        surfaces: [],
        executable: true,
      },
      {
        id: 'ingress.complete-event.v1',
        kind: 'command',
        surfaces: [],
        executable: true,
      },
      {
        id: 'ingress.dead-letter-event.v1',
        kind: 'command',
        surfaces: [],
        executable: true,
      },
      {
        id: 'ingress.ingest-event.v1',
        kind: 'command',
        surfaces: [],
        executable: true,
      },
      {
        id: 'ingress.link-webhook-receipt.v1',
        kind: 'command',
        surfaces: [],
        executable: true,
      },
      {
        id: 'ingress.list-dead-events.v1',
        kind: 'query',
        surfaces: listDeadEventsCellDeclaration.surfaces,
        executable: true,
      },
      {
        id: 'ingress.measure-webhook-backlog.v1',
        kind: 'query',
        surfaces: [],
        executable: true,
      },
      {
        id: 'ingress.purge-expired-webhook-receipts.v1',
        kind: 'command',
        surfaces: [],
        executable: true,
      },
      {
        id: 'ingress.reconcile-source-location-bindings.v1',
        kind: 'command',
        surfaces: [],
        executable: true,
      },
      {
        id: 'ingress.replay-dead-event.v1',
        kind: 'command',
        surfaces: replayDeadEventCellDeclaration.surfaces,
        executable: true,
      },
      {
        id: 'ingress.resolve-source-location.v1',
        kind: 'query',
        surfaces: [],
        executable: true,
      },
      {
        id: 'ingress.retry-event.v1',
        kind: 'command',
        surfaces: [],
        executable: true,
      },
      {
        id: 'ingress.receive-cents-webhook.v1',
        kind: 'command',
        surfaces: receiveCentsWebhookCellDeclaration.surfaces,
        executable: true,
      },
    ]);
  });

  it('assembles one canonical fifteen-cell owner including the reaction', () => {
    const system = makeIngressSystem({
      ...baseDependencies(),
      processInboundEvent: processDependencies(),
    });

    expect(Object.keys(system.cells)).toEqual([
      'captureWebhookReceipt',
      'claimEvents',
      'completeEvent',
      'deadLetterEvent',
      'ingestEvent',
      'linkWebhookReceipt',
      'listDeadEvents',
      'measureWebhookBacklog',
      'purgeExpiredWebhookReceipts',
      'reconcileSourceLocationBindings',
      'replayDeadEvent',
      'resolveSourceLocation',
      'retryEvent',
      'receiveCentsWebhook',
      'processInboundEvent',
    ]);
    expect(system.cells.processInboundEvent.id).toBe(
      processInboundEventCellDeclaration.id,
    );
    expect(system.cells.processInboundEvent.contract).toBe(
      processInboundEventCellDeclaration.contract,
    );
    expect(system.cells.processInboundEvent.surfaces).toBe(
      processInboundEventCellDeclaration.surfaces,
    );
    expect(typeof system.cells.processInboundEvent.execute).toBe('function');
  });
});
