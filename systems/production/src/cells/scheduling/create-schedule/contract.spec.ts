import { proveOperation } from '@pressly/testkit/operation-proof';
import { createScheduleCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import type { ScheduleProposal } from '../../../model/production-schedule/model.ts';
import { createScheduleContract } from './contract.ts';
const base: ScheduleProposal = {
  scheduleRunId: '10000000-0000-4000-8000-000000000001',
  productionShiftId: '10000000-0000-4000-8000-000000000002',
  schedulerConfigId: '10000000-0000-4000-8000-000000000003',
  status: 'draft',
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  algorithmVersion: 'fixed-pulse-ffd-v1',
  pulseMinutes: 56,
  pulseCapacityLbs: 100,
  batchCount: 0,
  makespanMinutes: 0,
  plannedCompletionAt: '2026-08-22T21:00:00.000Z',
  batches: [],
  unplacedOrderIds: [],
  warnings: [
    { code: 'SHIFT_OVERFLOW', message: 'overflow', blocking: false },
    {
      code: 'OVERSIZED_ORDER',
      message: 'large',
      blocking: true,
      orderIds: ['10000000-0000-4000-8000-000000000004'],
    },
  ],
  createdAt: '2026-08-22T12:00:00.000Z',
  acceptedAt: null,
  acceptedBy: null,
  acknowledgedWarningCodes: [],
  supersededAt: null,
};
describe('create schedule contract', () => {
  proveOperation({
    operationId: 'production.create-schedule.v1',
    declaration: createScheduleCellDeclaration,
    layer: 'contract',
    scenarios: [
      {
        name: 'decodes body then params plus actor',
        proves: ['contract'],
        run: () => {
          const decoded = createScheduleContract.input.decode({
            body: {
              productionShiftId: base.productionShiftId,
              schedulerConfigId: base.schedulerConfigId,
              idempotencyKey: 'create-schedule-1',
            },
            params: { locationId: 'location-1' },
            actorId: 'actor-1',
          });
          expect(decoded).toMatchObject({
            kind: 'valid',
            value: { locationId: 'location-1', actorId: 'actor-1' },
          });
          const invalid = createScheduleContract.input.decode({
            body: {},
            params: { locationId: '' },
            actorId: '',
          });
          if (invalid.kind === 'invalid')
            expect(invalid.issues.map((x) => x.path[0])).toEqual(
              expect.arrayContaining(['body', 'params', 'actorId']),
            );
        },
      },
    ],
  });
  it('preserves historical v1 and warnings with and without order IDs', () => {
    const encoded = createScheduleContract.output.encode(base);
    expect(createScheduleContract.output.decode(encoded)).toEqual({
      kind: 'valid',
      value: base,
    });
    expect((encoded as { warnings: unknown[] }).warnings).toEqual(
      base.warnings,
    );
  });
});
