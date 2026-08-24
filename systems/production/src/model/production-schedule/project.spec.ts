import { isJsonObject } from '@pressly/codec';
import { describe, expect, it } from 'vitest';
import type { ScheduleProposal } from './model.ts';
import {
  projectScheduleProposalJson,
  projectScheduleProposalRepresentation,
} from './project.ts';

const proposal = (): ScheduleProposal => ({
  scheduleRunId: '10000000-0000-4000-8000-000000000001',
  productionShiftId: '10000000-0000-4000-8000-000000000002',
  schedulerConfigId: '10000000-0000-4000-8000-000000000003',
  status: 'draft',
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  algorithmVersion: 'fixed-pulse-ffd-v2',
  pulseMinutes: 56,
  pulseCapacityLbs: 100,
  batchCount: 0,
  makespanMinutes: 0,
  plannedCompletionAt: '2026-08-22T21:00:00.000Z',
  batches: [],
  unplacedOrderIds: [],
  warnings: [
    {
      code: 'NO_ACTIVE_WASHERS',
      message: 'No active washers are available.',
      blocking: true,
    },
  ],
  createdAt: '2026-08-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedBy: null,
  acknowledgedWarningCodes: [],
  supersededAt: null,
});

describe('production schedule proposal projections', () => {
  it('projects closed JSON and omits absent optional warning fields', () => {
    const projected = projectScheduleProposalJson(proposal());

    expect(isJsonObject(projected)).toBe(true);
    expect(projected['warnings']).toEqual([
      {
        code: 'NO_ACTIVE_WASHERS',
        message: 'No active washers are available.',
        blocking: true,
      },
    ]);
  });

  it('copies every mutable wire array at the representation boundary', () => {
    const value = proposal();
    const represented = projectScheduleProposalRepresentation(value);

    expect(represented).toEqual(value);
    expect(represented.warnings).not.toBe(value.warnings);
    expect(represented.acknowledgedWarningCodes).not.toBe(
      value.acknowledgedWarningCodes,
    );
  });
});
