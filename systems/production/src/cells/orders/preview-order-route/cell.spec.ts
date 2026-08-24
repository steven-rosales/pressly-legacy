import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import type { OrderRouteProposalCommand } from '../../../model/order-route-proposal/model.ts';
import {
  makePreviewOrderRouteCell,
  previewOrderRouteCellDeclaration,
} from './cell.ts';
import { previewOrderRouteContract } from './contract.ts';
import type { PreviewOrderRouteRepository } from './types.ts';

const command: OrderRouteProposalCommand = {
  locationId: 'location-1',
  productionRunId: '10000000-0000-4000-8000-000000000001',
  productionOrderId: '10000000-0000-4000-8000-000000000002',
  actorId: '10000000-0000-4000-8000-000000000003',
  authorizedAction: 'production:stage',
  kind: 'queued_move',
  reason: 'manual_rebatch',
  targetProductionBatchId: '10000000-0000-4000-8000-000000000004',
  restartStage: 'sorting',
  expectedQueueVersion: 4,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 2,
};

describe('production.preview-order-route.v1 cell', () => {
  it('declares query ownership, after-input authorization, and snapshot consistency', () => {
    expect(previewOrderRouteCellDeclaration).toMatchObject({
      id: 'production.preview-order-route.v1',
      kind: 'query',
      authentication: 'required',
      authorization: {
        capability: 'production:stage',
        timing: 'after-input',
      },
      consistency: { transaction: 'required', concurrency: 'none' },
      idempotency: { required: false },
      emits: [],
      consumes: [],
      retry: null,
      timeoutMs: null,
      observability: { operation: 'production.preview_order_route' },
    });
    expect(previewOrderRouteCellDeclaration.contract).toBe(
      previewOrderRouteContract,
    );
    expect(
      previewOrderRouteCellDeclaration.authorization?.timing === 'after-input'
        ? previewOrderRouteCellDeclaration.authorization.scope(command)
        : null,
    ).toBe('location-1');
  });

  it('binds only the snapshot reader, production rules, and optional signals', async () => {
    const load = vi.fn<PreviewOrderRouteRepository['load']>(async () => null);
    const cell = makePreviewOrderRouteCell({
      repo: { load },
      policy: productionRules,
    });

    await expect(cell.execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_order_route_not_found' },
    });
    expect(load).toHaveBeenCalledOnce();
  });
});
