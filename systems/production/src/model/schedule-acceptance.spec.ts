import { describe, expect, it } from 'vitest';
import { evaluateScheduleAcceptance } from './schedule-acceptance.ts';

const start = Date.parse('2026-07-10T14:00:00.000Z');
const stages = (
  ['sorting', 'washing', 'drying', 'folding_packaging'] as const
).map((stage, index) => ({
  stage,
  startsAt: new Date(start + index * 56 * 60_000),
  endsAt: new Date(start + (index + 1) * 56 * 60_000),
  pulseMinutes: 56,
}));

const valid = {
  expectedOutputPlanHash: 'hash',
  actualOutputPlanHash: 'hash',
  warningCodes: [],
  blockingWarningCodes: [],
  acknowledgedWarningCodes: [],
  batches: [
    {
      weightLbs: 224,
      capacityLbs: 224,
      orderIds: ['order-1', 'order-2'],
      stages,
    },
  ],
} as const;

describe('schedule acceptance policy', () => {
  it('accepts a coherent immutable proposal', () => {
    expect(evaluateScheduleAcceptance(valid)).toEqual({
      tag: 'ok',
      value: { accepted: true },
    });
  });

  it('rejects hash drift, unacknowledged warnings, and split orders', () => {
    expect(
      evaluateScheduleAcceptance({ ...valid, actualOutputPlanHash: 'changed' }),
    ).toMatchObject({ tag: 'err', error: { code: 'SCHEDULE_HASH_MISMATCH' } });
    expect(
      evaluateScheduleAcceptance({
        ...valid,
        warningCodes: ['SHIFT_OVERFLOW'],
        blockingWarningCodes: ['SHIFT_OVERFLOW'],
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'SCHEDULE_WARNING_NOT_ACKNOWLEDGED' },
    });
    expect(
      evaluateScheduleAcceptance({
        ...valid,
        batches: [...valid.batches, { ...valid.batches[0] }],
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'ORDER_SPLIT_ACROSS_BATCHES' },
    });
  });

  it('rejects fabricated or duplicate warning acknowledgements', () => {
    expect(
      evaluateScheduleAcceptance({
        ...valid,
        acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'SCHEDULE_WARNING_ACKNOWLEDGEMENT_INVALID' },
    });
    expect(
      evaluateScheduleAcceptance({
        ...valid,
        warningCodes: ['SHIFT_OVERFLOW'],
        blockingWarningCodes: ['SHIFT_OVERFLOW'],
        acknowledgedWarningCodes: ['SHIFT_OVERFLOW', 'SHIFT_OVERFLOW'],
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'SCHEDULE_WARNING_ACKNOWLEDGEMENT_INVALID' },
    });
  });

  it('rejects empty work and malformed stage pipelines', () => {
    expect(evaluateScheduleAcceptance({ ...valid, batches: [] })).toMatchObject(
      { tag: 'err', error: { code: 'SCHEDULE_HAS_NO_BATCHES' } },
    );
    expect(
      evaluateScheduleAcceptance({
        ...valid,
        batches: [{ ...valid.batches[0], orderIds: [] }],
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'BATCH_HAS_NO_ORDERS' },
    });
    expect(
      evaluateScheduleAcceptance({
        ...valid,
        batches: [
          {
            ...valid.batches[0],
            stages: [stages[1]!, stages[0]!, stages[2]!, stages[3]!],
          },
        ],
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'BATCH_STAGE_ORDER_INVALID' },
    });
    expect(
      evaluateScheduleAcceptance({
        ...valid,
        batches: [
          {
            ...valid.batches[0],
            stages: [
              stages[0]!,
              {
                ...stages[1]!,
                startsAt: new Date('2026-07-10T15:00:00.000Z'),
                endsAt: new Date('2026-07-10T15:56:00.000Z'),
              },
              stages[2]!,
              stages[3]!,
            ],
          },
        ],
      }),
    ).toMatchObject({
      tag: 'err',
      error: { code: 'BATCH_STAGE_GAP_INVALID' },
    });
  });
});
