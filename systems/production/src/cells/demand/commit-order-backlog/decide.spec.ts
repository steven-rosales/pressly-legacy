import { proveOperation } from '@pressly/testkit/operation-proof';
import { commitOrderBacklogCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import type { ProductionOrderBacklogSnapshotOrder } from '../../../read-models/production-order-backlog/model.ts';
import {
  classifyProductionOrderBacklogSnapshot,
  hashProductionOrderBacklogPreview,
} from '../../../read-models/production-order-backlog/project.ts';
import { decideCommitOrderBacklog } from './decide.ts';
import type { CommitOrderBacklogCommand } from './types.ts';

const order = (
  suffix: number,
  overrides: Partial<ProductionOrderBacklogSnapshotOrder> = {},
): ProductionOrderBacklogSnapshotOrder => ({
  orderId: `75000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`,
  locationId: 'location-1',
  displayReference: `ORDER-${suffix}`,
  dueAt: new Date(`2026-07-0${suffix}T12:00:00.000Z`),
  productionVersion: 1,
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
  ...overrides,
});
const base = {
  locationId: 'location-1',
  actorId: '75000000-0000-4000-8000-000000000099',
  filter: 'all_due_before_cutoff' as const,
  cutoff: '2026-08-01T00:00:00.000Z',
  reason: 'processor_not_in_use' as const,
  cursor: null,
  maxOrders: 250,
  note: null,
  idempotencyKey: 'commit-backlog-decision-1',
};

describe('commit order backlog decision', () => {
  proveOperation({
    operationId: 'production.commit-order-backlog.v1',
    declaration: commitOrderBacklogCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'selects only ready lifecycle decisions after the exact hash fence',
        proves: ['decision'],
        run: () => {
          const classified = classifyProductionOrderBacklogSnapshot(
            productionRules,
            {
              hasMore: false,
              orders: [order(1), order(2, { hasIntake: true })],
            },
          );
          const command: CommitOrderBacklogCommand = {
            ...base,
            previewHash: hashProductionOrderBacklogPreview(base, classified),
          };
          const decision = decideCommitOrderBacklog({ command, classified });
          expect(decision).toMatchObject({
            kind: 'commit',
            candidates: [{ snapshot: { orderId: order(1).orderId } }],
          });
        },
      },
    ],
  });

  it('rejects any canonical snapshot or scope drift before mutation', () => {
    const classified = classifyProductionOrderBacklogSnapshot(productionRules, {
      hasMore: false,
      orders: [order(1)],
    });
    const command: CommitOrderBacklogCommand = {
      ...base,
      previewHash: 'f'.repeat(64),
    };
    expect(decideCommitOrderBacklog({ command, classified })).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_backlog_preview_stale' },
    });
  });
});
