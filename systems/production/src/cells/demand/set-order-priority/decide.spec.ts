import { proveOperation } from '@pressly/testkit/operation-proof';
import { setOrderPriorityCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { decideSetOrderPriority } from './decide.ts';

const command = {
  locationId: 'location-1',
  productionOrderId: '00000000-0000-4000-8000-000000000101',
  actorId: '00000000-0000-4000-8000-000000000201',
  priority: true,
  expectedVersion: 2,
  idempotencyKey: 'priority-command-1',
} as const;

describe('decide set order priority', () => {
  proveOperation({
    operationId: 'production.set-order-priority.v1',
    declaration: setOrderPriorityCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'commits an active order at the exact expected version',
        proves: ['decision'],
        run: () => {
          expect(
            decideSetOrderPriority({
              command,
              facts: {
                productionOrderId: command.productionOrderId,
                version: 2,
                resolutionState: 'open',
              },
              policy: productionRules,
            }),
          ).toEqual({ kind: 'commit' });
        },
      },
    ],
  });

  it('distinguishes missing, stale, and archived orders without effects', () => {
    expect(
      decideSetOrderPriority({ command, facts: null, policy: productionRules }),
    ).toMatchObject({
      kind: 'reject',
      failure: { kind: 'not_found', code: 'production_order_not_found' },
    });
    expect(
      decideSetOrderPriority({
        command,
        facts: {
          productionOrderId: command.productionOrderId,
          version: 3,
          resolutionState: 'open',
        },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_version_conflict' },
    });
    expect(
      decideSetOrderPriority({
        command,
        facts: {
          productionOrderId: command.productionOrderId,
          version: 2,
          resolutionState: 'resolved_without_production',
        },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_resolved' },
    });
  });
});
