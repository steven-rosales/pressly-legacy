import { proveOperation } from '@pressly/testkit/operation-proof';
import { startScheduleCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { startScheduleContract } from './contract.ts';
import type { StartScheduleResult } from './types.ts';

const ids = {
  schedule: '10000000-0000-4000-8000-000000000001',
  run: '10000000-0000-4000-8000-000000000002',
  batch: '10000000-0000-4000-8000-000000000003',
};
const output: StartScheduleResult = {
  scheduleRunId: ids.schedule,
  productionRunId: ids.run,
  productionBatchIds: [ids.batch],
  queueVersion: 1,
  startedAt: '2026-08-22T15:00:00.000Z',
  replayed: false,
};

describe('start schedule contract', () => {
  proveOperation({
    operationId: 'production.start-schedule.v1',
    declaration: startScheduleCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'decodes the exact body, params and authenticated actor',
        proves: ['contract'],
        run: () => {
          expect(
            startScheduleContract.input.decode({
              body: {
                expectedOutputPlanHash: 'a'.repeat(64),
                idempotencyKey: 'start-schedule-1',
              },
              params: { locationId: 'location-1', scheduleRunId: ids.schedule },
              actorId: 'actor-1',
            }),
          ).toEqual({
            kind: 'valid',
            value: {
              locationId: 'location-1',
              scheduleRunId: ids.schedule,
              expectedOutputPlanHash: 'a'.repeat(64),
              idempotencyKey: 'start-schedule-1',
              actorId: 'actor-1',
            },
          });
        },
      },
    ],
  });

  it('reports body, params, and actor issues without losing location order', () => {
    const decoded = startScheduleContract.input.decode({
      body: {},
      params: { locationId: '', scheduleRunId: 'bad' },
      actorId: '',
    });
    expect(decoded.kind).toBe('invalid');
    if (decoded.kind === 'invalid')
      expect(decoded.issues.map((issue) => issue.path[0])).toEqual([
        'body',
        'body',
        'params',
        'params',
        'actorId',
      ]);
  });

  it('copies batch IDs across the v1 result boundary', () => {
    const encoded = startScheduleContract.output.encode(output);
    expect(startScheduleContract.output.decode(encoded)).toEqual({
      kind: 'valid',
      value: output,
    });
    const decoded = startScheduleContract.output.decode(encoded);
    if (decoded.kind === 'valid')
      expect(decoded.value.productionBatchIds).not.toBe(
        output.productionBatchIds,
      );
  });
});
