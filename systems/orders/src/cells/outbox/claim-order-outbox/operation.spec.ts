import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { claimOrderOutboxCellDeclaration } from './cell.ts';
import { validateClaimOrderOutbox } from './decide.ts';
import { makeExecuteClaimOrderOutbox } from './execute.ts';

const command = { workerId: 'worker-1', limit: 10, leaseMs: 30_000 };
const now = new Date('2026-08-23T16:00:00.000Z');

proveOperation({
  operationId: 'orders.claim-order-outbox.v1',
  declaration: claimOrderOutboxCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'accepts a bounded lease request and rejects an empty worker purely',
      proves: ['decision'],
      run: () => {
        expect(validateClaimOrderOutbox(command)).toBeNull();
        expect(
          validateClaimOrderOutbox({ ...command, workerId: ' ' }),
        ).toMatchObject({ code: 'order_outbox_claim_invalid' });
      },
    },
    {
      name: 'reads the clock once and sends the exact lease request to persistence',
      proves: ['executor-success'],
      run: async () => {
        const claim = vi.fn(async () => []);
        const clock = { now: vi.fn(() => now) };
        await expect(
          makeExecuteClaimOrderOutbox({ repo: { claim }, clock })(command),
        ).resolves.toEqual({ kind: 'success', value: [] });
        expect(clock.now).toHaveBeenCalledOnce();
        expect(claim).toHaveBeenCalledWith({ command, now });
      },
    },
  ],
});
