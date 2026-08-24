import {
  scheduleProposalSchema,
  type ScheduleProposal,
} from '@pressly/production-system/contracts/read-models/production-schedule';
import type { LoadScheduleInput } from '@pressly/production-system/operations/scheduling/load-schedule/types';

const uuid = (suffix: number): string =>
  `25000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

export const loadScheduleConformanceLocationId =
  'load-schedule-conformance-location';
export const loadScheduleConformanceSiblingLocationId =
  'load-schedule-conformance-sibling';

export const loadScheduleConformanceIds = Object.freeze({
  business: uuid(1),
  actor: uuid(2),
  shift: uuid(3),
  config: uuid(4),
  schedule: uuid(5),
  missingSchedule: uuid(6),
  firstOrder: uuid(7),
  secondOrder: uuid(8),
  unplacedOrder: uuid(9),
  firstWasher: uuid(10),
  secondWasher: uuid(11),
  dryer: uuid(12),
});

export const loadScheduleExpectedProposal = Object.freeze({
  scheduleRunId: loadScheduleConformanceIds.schedule,
  productionShiftId: loadScheduleConformanceIds.shift,
  schedulerConfigId: loadScheduleConformanceIds.config,
  status: 'accepted',
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  algorithmVersion: 'fixed-pulse-ffd-v2',
  pulseMinutes: 42,
  pulseCapacityLbs: 90,
  batchCount: 2,
  makespanMinutes: 252,
  plannedCompletionAt: '2026-08-22T20:12:00.000Z',
  batches: [
    {
      sequence: 1,
      orderIds: [loadScheduleConformanceIds.secondOrder],
      derivedWeightLbs: 52,
      bagCount: 3,
      stages: [
        {
          stage: 'sorting',
          startsAt: '2026-08-22T16:42:00.000Z',
          endsAt: '2026-08-22T17:24:00.000Z',
          machineIds: [],
        },
        {
          stage: 'washing',
          startsAt: '2026-08-22T17:24:00.000Z',
          endsAt: '2026-08-22T18:06:00.000Z',
          machineIds: [
            loadScheduleConformanceIds.secondWasher,
            loadScheduleConformanceIds.firstWasher,
          ],
        },
        {
          stage: 'drying',
          startsAt: '2026-08-22T18:06:00.000Z',
          endsAt: '2026-08-22T18:48:00.000Z',
          machineIds: [loadScheduleConformanceIds.dryer],
        },
        {
          stage: 'folding_packaging',
          startsAt: '2026-08-22T18:48:00.000Z',
          endsAt: '2026-08-22T19:30:00.000Z',
          machineIds: [],
        },
      ],
    },
    {
      sequence: 0,
      orderIds: [loadScheduleConformanceIds.firstOrder],
      derivedWeightLbs: 38,
      bagCount: 2,
      stages: [
        {
          stage: 'sorting',
          startsAt: '2026-08-22T16:00:00.000Z',
          endsAt: '2026-08-22T16:42:00.000Z',
          machineIds: [],
        },
        {
          stage: 'washing',
          startsAt: '2026-08-22T16:42:00.000Z',
          endsAt: '2026-08-22T17:24:00.000Z',
          machineIds: [loadScheduleConformanceIds.firstWasher],
        },
        {
          stage: 'drying',
          startsAt: '2026-08-22T17:24:00.000Z',
          endsAt: '2026-08-22T18:06:00.000Z',
          machineIds: [loadScheduleConformanceIds.dryer],
        },
        {
          stage: 'folding_packaging',
          startsAt: '2026-08-22T18:06:00.000Z',
          endsAt: '2026-08-22T18:48:00.000Z',
          machineIds: [],
        },
      ],
    },
  ],
  unplacedOrderIds: [
    loadScheduleConformanceIds.unplacedOrder,
    loadScheduleConformanceIds.secondOrder,
  ],
  warnings: [
    {
      code: 'SHIFT_OVERFLOW',
      message: 'The plan ends after the shift.',
      blocking: true,
      orderIds: [
        loadScheduleConformanceIds.secondOrder,
        loadScheduleConformanceIds.firstOrder,
      ],
    },
    {
      code: 'OVERSIZED_ORDER',
      message: 'An order exceeds the available pulse capacity.',
      blocking: true,
      orderIds: [loadScheduleConformanceIds.unplacedOrder],
    },
  ],
  createdAt: '2026-08-22T15:00:00.000Z',
  acceptedAt: '2026-08-22T15:30:00.000Z',
  acceptedBy: loadScheduleConformanceIds.actor,
  acknowledgedWarningCodes: ['OVERSIZED_ORDER', 'SHIFT_OVERFLOW'],
  supersededAt: null,
} satisfies ScheduleProposal);

export type LoadScheduleConformanceFixture = 'canonical' | 'historical_v1';

export type LoadScheduleConformanceScenario = Readonly<{
  name: string;
  fixture: LoadScheduleConformanceFixture;
  input: LoadScheduleInput;
  expectedCode: 'success' | 'schedule_not_found' | 'stored_output_invalid';
}>;

export const loadScheduleConformanceScenarios: readonly LoadScheduleConformanceScenario[] =
  Object.freeze([
    {
      name: 'accepted schedule returns the complete serialized proposal in stored order',
      fixture: 'canonical',
      input: {
        locationId: loadScheduleConformanceLocationId,
        scheduleRunId: loadScheduleConformanceIds.schedule,
      },
      expectedCode: 'success',
    },
    {
      name: 'missing schedule returns the exact typed not-found failure',
      fixture: 'canonical',
      input: {
        locationId: loadScheduleConformanceLocationId,
        scheduleRunId: loadScheduleConformanceIds.missingSchedule,
      },
      expectedCode: 'schedule_not_found',
    },
    {
      name: 'cross-location schedule identity is indistinguishable from not found',
      fixture: 'canonical',
      input: {
        locationId: loadScheduleConformanceSiblingLocationId,
        scheduleRunId: loadScheduleConformanceIds.schedule,
      },
      expectedCode: 'schedule_not_found',
    },
    {
      name: 'historical v1 output remains unrepresentable and preserves the stored-output invariant',
      fixture: 'historical_v1',
      input: {
        locationId: loadScheduleConformanceLocationId,
        scheduleRunId: loadScheduleConformanceIds.schedule,
      },
      expectedCode: 'stored_output_invalid',
    },
  ]);

export type CanonicalLoadScheduleFailure = Readonly<{
  tag: string | null;
  kind: string;
  code: string;
  message: string;
  safeMessage: string | null;
  status: number | null;
}>;

export type CanonicalLoadScheduleOutcome =
  | Readonly<{ kind: 'success'; value: ScheduleProposal }>
  | Readonly<{ kind: 'failure'; failure: CanonicalLoadScheduleFailure }>
  | Readonly<{ kind: 'unexpected'; error: CanonicalLoadScheduleFailure }>;

export type LoadScheduleConformanceVariant = Readonly<{
  execute: (input: LoadScheduleInput) => Promise<unknown>;
  calls: () => readonly string[];
  clockReads: () => number;
  idReads: () => number;
}>;

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const stringField = (
  fields: Readonly<Record<string, unknown>> | null,
  key: string,
): string | null => (typeof fields?.[key] === 'string' ? fields[key] : null);

const canonicalFailure = (value: unknown): CanonicalLoadScheduleFailure => {
  const fields = record(value);
  return {
    tag: stringField(fields, 'tag'),
    kind: stringField(fields, 'kind') ?? 'unknown',
    code: stringField(fields, 'code') ?? 'unknown_error',
    message:
      value instanceof Error
        ? value.message
        : (stringField(fields, 'message') ?? 'Unknown error.'),
    safeMessage: stringField(fields, 'safeMessage'),
    status: typeof fields?.['status'] === 'number' ? fields['status'] : null,
  };
};

export const captureLoadScheduleOutcome = async (
  execute: LoadScheduleConformanceVariant['execute'],
  input: LoadScheduleInput,
): Promise<CanonicalLoadScheduleOutcome> => {
  try {
    const raw = await execute(input);
    const wrapper = record(raw);
    if (wrapper?.['tag'] === 'err')
      return { kind: 'failure', failure: canonicalFailure(wrapper['error']) };
    if (wrapper?.['kind'] === 'failure')
      return {
        kind: 'failure',
        failure: canonicalFailure(wrapper['failure']),
      };
    const value =
      wrapper?.['tag'] === 'ok' || wrapper?.['kind'] === 'success'
        ? wrapper['value']
        : raw;
    const parsed = scheduleProposalSchema.safeParse(value);
    return parsed.success
      ? { kind: 'success', value: parsed.data }
      : {
          kind: 'unexpected',
          error: {
            tag: null,
            kind: 'invalid_result',
            code: 'invalid_load_schedule_result',
            message: 'The load-schedule result is invalid.',
            safeMessage: null,
            status: null,
          },
        };
  } catch (error) {
    return { kind: 'unexpected', error: canonicalFailure(error) };
  }
};

export const loadScheduleOutcomeCode = (
  outcome: CanonicalLoadScheduleOutcome,
): string =>
  outcome.kind === 'success'
    ? 'success'
    : outcome.kind === 'failure'
      ? outcome.failure.code
      : outcome.error.code === 'production_schedule_output_plan_invalid'
        ? 'stored_output_invalid'
        : outcome.error.code;
