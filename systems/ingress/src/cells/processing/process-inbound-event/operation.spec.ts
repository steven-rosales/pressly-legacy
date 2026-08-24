import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { webhookEventReadyV1MessageContract } from '../../../contracts/webhook-event-ready-v1.ts';
import { processInboundEventCellDeclaration } from './cell.ts';
import { decideCentsInboundEvent } from './cents.ts';
import { makeExecuteProcessInboundEvent } from './execute.ts';

const event = {
  eventId: '83000000-0000-4000-8000-000000000001',
  source: 'cents',
  eventType: 'customer_updated',
  subjectType: 'customer',
  subjectId: 'customer-1',
  sourceLocationId: null,
  sourceOccurredAt: new Date('2026-07-10T13:00:00.000Z'),
  receivedAt: new Date('2026-07-10T13:00:01.000Z'),
  payload: { externalUserId: 'customer-1' },
  payloadHash: 'a'.repeat(64),
} as const;

proveOperation({
  operationId: 'ingress.process-inbound-event.v1',
  declaration: processInboundEventCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'owns one versioned ready-event job boundary',
      proves: ['contract', 'protocol', 'message-compatibility'],
      run: () => {
        expect(processInboundEventCellDeclaration.consumes).toEqual([
          webhookEventReadyV1MessageContract,
        ]);
        expect(processInboundEventCellDeclaration.surfaces).toEqual([
          expect.objectContaining({
            kind: 'job',
            id: 'ingress.process-inbound-event-job.v1',
          }),
        ]);
        expect(
          processInboundEventCellDeclaration.contract.input.decode(
            processInboundEventCellDeclaration.contract.input.encode(event),
          ).kind,
        ).toBe('valid');
      },
    },
    {
      name: 'decides and executes an approved no-op without owner effects',
      proves: ['decision', 'executor-success'],
      run: async () => {
        const resolveSourceLocation = vi.fn();
        const proposeIncomingOrder = vi.fn();
        const closeIncomingOrderSource = vi.fn();
        const resolveSourceClosedFulfillment = vi.fn();
        expect(decideCentsInboundEvent(event)).toEqual({ kind: 'ignore' });
        await expect(
          makeExecuteProcessInboundEvent({
            resolveSourceLocation,
            proposeIncomingOrder,
            closeIncomingOrderSource,
            resolveSourceClosedFulfillment,
          })(event),
        ).resolves.toEqual({
          kind: 'success',
          value: { acknowledged: true },
        });
        expect(resolveSourceLocation).not.toHaveBeenCalled();
        expect(proposeIncomingOrder).not.toHaveBeenCalled();
        expect(closeIncomingOrderSource).not.toHaveBeenCalled();
        expect(resolveSourceClosedFulfillment).not.toHaveBeenCalled();
      },
    },
  ],
});
