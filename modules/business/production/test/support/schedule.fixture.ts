import type { ScheduleProposal } from '../../src/foundations/language/scheduling/schedule-proposal.entity.ts';

export const scheduleProposalFixture = (): ScheduleProposal => ({
  scheduleRunId: '00000000-0000-4000-8000-000000000001',
  productionShiftId: '00000000-0000-4000-8000-000000000002',
  schedulerConfigId: '00000000-0000-4000-8000-000000000003',
  status: 'draft',
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  algorithmVersion: 'fixed-pulse-ffd-v2',
  pulseMinutes: 56,
  pulseCapacityLbs: 80,
  batchCount: 1,
  makespanMinutes: 224,
  plannedCompletionAt: '2026-08-02T20:00:00.000Z',
  batches: [
    {
      sequence: 0,
      orderIds: ['00000000-0000-4000-8000-000000000004'],
      derivedWeightLbs: 32,
      bagCount: 2,
      stages: [
        {
          stage: 'sorting',
          startsAt: '2026-08-02T16:00:00.000Z',
          endsAt: '2026-08-02T16:56:00.000Z',
          machineIds: [],
        },
        {
          stage: 'washing',
          startsAt: '2026-08-02T16:56:00.000Z',
          endsAt: '2026-08-02T17:52:00.000Z',
          machineIds: ['00000000-0000-4000-8000-000000000005'],
        },
        {
          stage: 'drying',
          startsAt: '2026-08-02T17:52:00.000Z',
          endsAt: '2026-08-02T18:48:00.000Z',
          machineIds: ['00000000-0000-4000-8000-000000000006'],
        },
        {
          stage: 'folding_packaging',
          startsAt: '2026-08-02T18:48:00.000Z',
          endsAt: '2026-08-02T19:44:00.000Z',
          machineIds: [],
        },
      ],
    },
  ],
  unplacedOrderIds: [],
  warnings: [
    {
      code: 'SHIFT_OVERFLOW',
      message: 'The plan ends after the shift.',
      blocking: true,
      orderIds: ['00000000-0000-4000-8000-000000000004'],
    },
  ],
  createdAt: '2026-08-02T15:00:00.000Z',
  acceptedAt: null,
  acceptedBy: null,
  acknowledgedWarningCodes: [],
  supersededAt: null,
});
