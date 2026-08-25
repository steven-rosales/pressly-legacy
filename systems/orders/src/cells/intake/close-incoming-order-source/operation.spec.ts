import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { closeIncomingOrderSourceCellDeclaration } from './cell.ts';
import { validateCloseIncomingOrderSource } from './decide.ts';
import { makeExecuteCloseIncomingOrderSource } from './execute.ts';
import type { CloseIncomingOrderSourceCommand } from './types.ts';

const command: CloseIncomingOrderSourceCommand = {
  context: {
    origin: 'external_orders_adapter',
    principal: { kind: 'system', id: 'external-orders' },
  },
  source: 'cents',
  externalOrderId: 'source-order-1',
  terminalCode: 'completed',
  revision: {
    at: new Date('2026-08-23T15:59:00.000Z'),
    hash: 'b'.repeat(64),
    adapterVersion: 'external-orders-v1',
    observedAt: new Date('2026-08-23T16:00:00.000Z'),
    normalizedPayload: {
      order: { id: 'source-order-1', state: 'completed' },
    },
  },
};

proveOperation({
  operationId: 'orders.close-incoming-order-source.v1',
  declaration: closeIncomingOrderSourceCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'accepts exact terminal evidence and rejects an empty source purely',
      proves: ['decision'],
      run: () => {
        expect(validateCloseIncomingOrderSource(command)).toBeNull();
        expect(
          validateCloseIncomingOrderSource({ ...command, source: ' ' }),
        ).toMatchObject({ code: 'incoming_order_source_close_invalid' });
      },
    },
    {
      name: 'locks the source and stores terminal evidence before returning the tombstone',
      proves: ['executor-success'],
      run: async () => {
        const calls: string[] = [];
        const createTombstone = vi.fn(async () => ({
          source: command.source,
          externalOrderId: command.externalOrderId,
          proposalId: null,
          terminalCode: command.terminalCode,
          sourceRevisionAt: command.revision.at,
          sourceRevisionHash: command.revision.hash,
          adapterVersion: command.revision.adapterVersion,
          normalizedPayload: command.revision.normalizedPayload,
          observedAt: command.revision.observedAt,
        }));
        const execute = makeExecuteCloseIncomingOrderSource({
          clock: { now: () => command.revision.observedAt },
          repo: {
            transaction: (work) =>
              work({
                lockSource: async () => {
                  calls.push('lock-source');
                },
                findProposal: async () => null,
                lockProposal: async () => undefined,
                findTombstone: async () => null,
                createTombstone,
                findExactOrder: async () => null,
                closeProposal: async () => null as never,
              }),
          },
        });
        await expect(execute(command)).resolves.toMatchObject({
          kind: 'success',
          value: { outcome: 'tombstoned', replayed: false },
        });
        expect(calls).toEqual(['lock-source']);
        expect(createTombstone).toHaveBeenCalledWith(command, null);
      },
    },
  ],
});
