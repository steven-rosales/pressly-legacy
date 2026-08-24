import { proveOperation } from '@pressly/testkit/operation-proof';
import { acceptScheduleCellDeclaration } from './cell.ts';
import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import {
  acceptanceScheduleCoversInputExactly,
  acceptScheduleOperationId,
  decideAcceptScheduleProposal,
  decideAcceptScheduleSnapshot,
  decideAcceptScheduleWindow,
} from './decide.ts';
import type {
  AcceptScheduleCommand,
  ScheduleAcceptanceRecord,
} from './types.ts';

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  shift: '10000000-0000-4000-8000-000000000002',
  schedule: '10000000-0000-4000-8000-000000000003',
  config: '10000000-0000-4000-8000-000000000004',
  order: '10000000-0000-4000-8000-000000000005',
} as const;
const outputHash = 'a'.repeat(64);

const record = (overrides: Partial<ScheduleAcceptanceRecord> = {}) => {
  const startsAt = '2026-08-22T13:00:00.000Z';
  const stageStarts = [13, 14, 15, 16].map(
    (hour) => `2026-08-22T${String(hour).padStart(2, '0')}:00:00.000Z`,
  );
  const stageEnds = [14, 15, 16, 17].map(
    (hour) => `2026-08-22T${String(hour).padStart(2, '0')}:00:00.000Z`,
  );
  const base: ScheduleAcceptanceRecord = {
    schedule: {
      scheduleRunId: ids.schedule,
      productionShiftId: ids.shift,
      schedulerConfigId: ids.config,
      status: 'draft',
      inputSnapshotHash: 'b'.repeat(64),
      outputPlanHash: outputHash,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      pulseMinutes: 60,
      pulseCapacityLbs: 100,
      batchCount: 1,
      makespanMinutes: 300,
      plannedCompletionAt: stageEnds[3]!,
      batches: [
        {
          sequence: 0,
          orderIds: [ids.order],
          derivedWeightLbs: 20,
          bagCount: 1,
          stages: ['sorting', 'washing', 'drying', 'folding_packaging'].map(
            (stage, index) => ({
              stage: stage as
                | 'sorting'
                | 'washing'
                | 'drying'
                | 'folding_packaging',
              startsAt: stageStarts[index]!,
              endsAt: stageEnds[index]!,
              machineIds: [],
            }),
          ),
        },
      ],
      unplacedOrderIds: [],
      warnings: [],
      createdAt: '2026-08-22T12:00:00.000Z',
      acceptedAt: null,
      acceptedBy: null,
      acknowledgedWarningCodes: [],
      supersededAt: null,
    },
    inputSnapshot: {
      orders: [
        {
          id: ids.order,
          externalOrderId: 'ORDER-1',
          dueAt: '2026-08-22T20:00:00.000Z',
          priority: false,
          derivedWeightLbs: 20,
          bagCount: 1,
          version: 1,
        },
      ],
      machines: [],
      shift: {
        id: ids.shift,
        startsAt,
        endsAt: '2026-08-22T21:00:00.000Z',
        timezone: 'America/New_York',
        effectiveFolderCount: 2,
        version: 1,
      },
      config: {
        id: ids.config,
        pulseMinutes: 60,
        foldLbsPerFolderMinute: 2,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        version: 1,
      },
    },
  };
  return { ...base, ...overrides };
};

const command = (
  overrides: Partial<AcceptScheduleCommand> = {},
): AcceptScheduleCommand => ({
  locationId: 'location-1',
  scheduleRunId: ids.schedule,
  expectedOutputPlanHash: outputHash,
  acknowledgedWarningCodes: [],
  idempotencyKey: 'accept-schedule-command-1',
  actorId: ids.actor,
  ...overrides,
});

describe('accept schedule decisions', () => {
  it('owns the stable operation identity and exact schedule/input partition rule', () => {
    const acceptance = record();
    expect(acceptScheduleOperationId).toBe('production.accept-schedule.v1');
    expect(
      acceptanceScheduleCoversInputExactly(
        acceptance.schedule,
        acceptance.inputSnapshot,
      ),
    ).toBe(true);
    expect(
      acceptanceScheduleCoversInputExactly(
        { ...acceptance.schedule, unplacedOrderIds: [ids.order] },
        acceptance.inputSnapshot,
      ),
    ).toBe(false);
  });

  proveOperation({
    operationId: 'production.accept-schedule.v1',
    declaration: acceptScheduleCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'evaluates Accept against the persisted snapshot window',
        proves: ['decision'],
        run: () => {
          expect(
            decideAcceptScheduleWindow({
              record: record(),
              now: new Date('2026-08-22T14:00:00.000Z'),
              policy: productionRules,
            }),
          ).toEqual({ kind: 'continue' });
          expect(
            decideAcceptScheduleWindow({
              record: record(),
              now: new Date('2026-08-22T21:00:00.000Z'),
              policy: productionRules,
            }),
          ).toMatchObject({
            kind: 'reject',
            failure: { code: 'production_shift_expired' },
          });
        },
      },
    ],
  });

  it('checks existing execution and the draft lifecycle before acceptance policy', () => {
    expect(
      decideAcceptScheduleProposal({
        command: command(),
        schedule: record().schedule,
        productionRunExists: true,
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_shift_already_started' },
    });
    expect(
      decideAcceptScheduleProposal({
        command: command(),
        schedule: { ...record().schedule, status: 'accepted' },
        productionRunExists: false,
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'schedule_not_draft' },
    });
  });

  it('maps hash and warning policy failures and retains the draft-to-accepted lifecycle', () => {
    expect(
      decideAcceptScheduleProposal({
        command: command({ expectedOutputPlanHash: 'c'.repeat(64) }),
        schedule: record().schedule,
        productionRunExists: false,
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'schedule_hash_mismatch' },
    });

    const warningSchedule = {
      ...record().schedule,
      warnings: [
        {
          code: 'SHIFT_OVERFLOW' as const,
          message: 'Overflow.',
          blocking: true,
        },
      ],
    };
    expect(
      decideAcceptScheduleProposal({
        command: command(),
        schedule: warningSchedule,
        productionRunExists: false,
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'schedule_warning_not_acknowledged' },
    });
    expect(
      decideAcceptScheduleProposal({
        command: command({ acknowledgedWarningCodes: ['SHIFT_OVERFLOW'] }),
        schedule: warningSchedule,
        productionRunExists: false,
        policy: productionRules,
      }),
    ).toEqual({
      kind: 'continue',
      lifecycle: { from: 'draft', state: 'accepted' },
    });
  });

  it('preserves the current-plan quirk while mapping snapshot staleness', () => {
    const evaluateCurrentPlanAcceptance = vi.fn(
      productionRules.evaluateCurrentPlanAcceptance,
    );
    const policy = { ...productionRules, evaluateCurrentPlanAcceptance };
    expect(
      decideAcceptScheduleSnapshot({
        scheduleRunId: ids.schedule,
        eligibleOrderSnapshotMatches: true,
        policy,
      }),
    ).toEqual({ kind: 'accept' });
    expect(evaluateCurrentPlanAcceptance).toHaveBeenCalledWith({
      scheduleRunId: ids.schedule,
      currentScheduleRunId: ids.schedule,
      eligibleOrderSnapshotMatches: true,
    });
    expect(
      decideAcceptScheduleSnapshot({
        scheduleRunId: ids.schedule,
        eligibleOrderSnapshotMatches: false,
        policy,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'schedule_input_snapshot_stale' },
    });
  });
});
