import { proveOperation } from '@pressly/testkit/operation-proof';
import { previewOrderBacklogCellDeclaration } from './cell.ts';
import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import type {
  ProductionOrderBacklogScope,
  ProductionOrderBacklogSnapshotOrder,
} from '../../../read-models/production-order-backlog/model.ts';
import { makeExecutePreviewOrderBacklog } from './execute.ts';

const input: ProductionOrderBacklogScope = {
  locationId: 'location-1',
  filter: 'all_due_before_cutoff',
  cutoff: '2026-08-01T00:00:00.000Z',
  reason: 'processor_not_in_use',
  cursor: null,
  maxOrders: 10,
};
const snapshotOrder: ProductionOrderBacklogSnapshotOrder = {
  orderId: '73000000-0000-4000-8000-000000000001',
  locationId: input.locationId,
  displayReference: 'ORDER-1',
  dueAt: new Date('2026-07-01T12:00:00.000Z'),
  productionVersion: 2,
  resolutionState: 'open',
  executionStatus: 'unassigned',
  operationalStatus: 'release_pending',
  hasIntake: false,
  hasManualAdmission: false,
  isPriority: false,
  hasPendingPlacement: false,
  hasShiftSelection: false,
  hasBatchMembership: false,
  hasStageAttempt: false,
  hasRoute: false,
};

describe('preview order backlog executor', () => {
  proveOperation({
    operationId: 'production.preview-order-backlog.v1',
    declaration: previewOrderBacklogCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'reads and classifies the snapshot before its one clock observation',
        proves: ['executor-success'],
        run: async () => {
          const trace: string[] = [];
          const loadSnapshot = vi.fn(async () => {
            trace.push('read');
            return { orders: [snapshotOrder], hasMore: false };
          });
          const policy = {
            ...productionRules,
            resolveProductionOrderExecutionState: (
              facts: Parameters<
                typeof productionRules.resolveProductionOrderExecutionState
              >[0],
            ) => {
              trace.push('classify');
              return productionRules.resolveProductionOrderExecutionState(
                facts,
              );
            },
          };
          const clock = vi.fn(() => {
            trace.push('clock');
            return new Date('2026-08-22T15:00:00.000Z');
          });

          await expect(
            makeExecutePreviewOrderBacklog({
              repo: { loadSnapshot },
              policy,
              clock: { now: clock },
            })(input),
          ).resolves.toMatchObject({
            kind: 'success',
            value: {
              candidateCount: 1,
              generatedAt: '2026-08-22T15:00:00.000Z',
            },
          });
          expect(trace).toEqual(['read', 'classify', 'clock']);
          expect(clock).toHaveBeenCalledOnce();
          expect(loadSnapshot).toHaveBeenCalledWith({
            locationId: input.locationId,
            filter: input.filter,
            cutoff: new Date(input.cutoff),
            maxOrders: input.maxOrders,
            after: null,
          });
        },
      },
    ],
  });

  it('returns the stable empty preview for a missing location', async () => {
    const clock = vi.fn(() => new Date('2026-08-22T15:00:00.000Z'));
    const execute = makeExecutePreviewOrderBacklog({
      repo: {
        loadSnapshot: vi.fn(async () => ({ orders: [], hasMore: false })),
      },
      policy: productionRules,
      clock: { now: clock },
    });

    await expect(
      execute({ ...input, locationId: 'missing-location' }),
    ).resolves.toMatchObject({
      kind: 'success',
      value: {
        locationId: 'missing-location',
        candidateCount: 0,
        hasMore: false,
        nextCursor: null,
        groups: {
          readyToArchive: [],
          reviewIndividually: [],
          keptForSafety: [],
          alreadyHistorical: [],
        },
      },
    });
    expect(clock).toHaveBeenCalledOnce();
  });

  it('rejects an invalid cursor before location/database lookup or clock', async () => {
    const loadSnapshot = vi.fn();
    const clock = vi.fn();
    const execute = makeExecutePreviewOrderBacklog({
      repo: { loadSnapshot },
      policy: productionRules,
      clock: { now: clock },
      cursor: {
        encode: vi.fn(),
        decode: () => ({
          kind: 'invalid',
          failure: {
            code: 'production_order_backlog_cursor_scope_mismatch',
            message: 'The backlog cursor does not belong to this review scope.',
          },
        }),
      },
    });

    await expect(
      execute({ ...input, locationId: 'missing-location' }),
    ).resolves.toEqual({
      kind: 'failure',
      failure: {
        tag: 'ProductionFailure',
        kind: 'validation',
        classification: 'malformed',
        code: 'production_order_backlog_cursor_invalid',
        message: 'The backlog cursor does not belong to this review scope.',
        safeMessage: 'The backlog cursor does not belong to this review scope.',
        details: {
          reason: 'production_order_backlog_cursor_scope_mismatch',
        },
      },
    });
    expect(loadSnapshot).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
  });

  it('maps a snapshot failure and does not observe the clock', async () => {
    const cause = Object.freeze({ fixture: 'database unavailable' });
    const clock = vi.fn();
    const execute = makeExecutePreviewOrderBacklog({
      repo: {
        loadSnapshot: vi.fn(async () => {
          throw cause;
        }),
      },
      policy: productionRules,
      clock: { now: clock },
    });

    await expect(execute(input)).rejects.toMatchObject({
      code: 'production_order_backlog_preview_failed',
      status: 503,
      cause,
    });
    expect(clock).not.toHaveBeenCalled();
  });
});
