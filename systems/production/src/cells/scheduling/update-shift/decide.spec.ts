import { proveOperation } from '@pressly/testkit/operation-proof';
import { updateShiftCellDeclaration } from './cell.ts';
import * as result from '@pressly/cells/result';
import { describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import {
  changedUpdateShiftFields,
  decideUpdateShiftEligibility,
  decideUpdateShiftState,
  decideUpdateShiftSupersession,
  updateShiftOperationId,
  validateUpdateShiftWindow,
} from './decide.ts';
import type {
  ProductionShift,
  UpdateShiftCommand,
  UpdateShiftPolicy,
} from './types.ts';

const command: UpdateShiftCommand = {
  locationId: 'location-1',
  productionShiftId: '10000000-0000-4000-8000-000000000001',
  startsAt: '2026-08-22T12:30:00.000Z',
  endsAt: '2026-08-22T22:00:00.000Z',
  effectiveFolderCount: 4,
  expectedVersion: 1,
  actorId: '10000000-0000-4000-8000-000000000002',
  idempotencyKey: 'update-shift-command-1',
};

const current: ProductionShift = {
  id: command.productionShiftId,
  locationId: command.locationId,
  startsAt: '2026-08-22T13:00:00.000Z',
  endsAt: '2026-08-22T21:00:00.000Z',
  timezone: 'America/New_York',
  effectiveFolderCount: 2,
  status: 'open',
  version: 1,
};

describe('production.update-shift.v1 decisions', () => {
  proveOperation({
    operationId: 'production.update-shift.v1',
    declaration: updateShiftCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'owns the stable operation identity and exact window rule',
        proves: ['decision'],
        run: () => {
          expect(updateShiftOperationId).toBe('production.update-shift.v1');
          expect(validateUpdateShiftWindow(command)).toBeNull();
          for (const invalid of [
            { startsAt: command.startsAt, endsAt: command.startsAt },
            { startsAt: command.endsAt, endsAt: command.startsAt },
            { startsAt: 'not-an-instant', endsAt: command.endsAt },
            { startsAt: command.startsAt, endsAt: 'not-an-instant' },
          ])
            expect(validateUpdateShiftWindow(invalid)).toMatchObject({
              kind: 'validation',
              classification: 'semantic',
              code: 'production_shift_window_invalid',
            });
        },
      },
    ],
  });

  it('compares timestamp meaning and returns changed fields in declared order', () => {
    expect(changedUpdateShiftFields(current, command)).toEqual([
      'startsAt',
      'endsAt',
      'effectiveFolderCount',
    ]);
    expect(
      changedUpdateShiftFields(current, {
        startsAt: '2026-08-22T09:00:00-04:00',
        endsAt: current.endsAt,
        effectiveFolderCount: current.effectiveFolderCount,
      }),
    ).toEqual([]);
  });

  it('preserves missing, version, closed, and execution-freeze precedence', () => {
    expect(
      decideUpdateShiftState({
        command,
        current: null,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_shift_not_found' },
    });
    expect(
      decideUpdateShiftState({
        command: { ...command, expectedVersion: 2 },
        current,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_shift_version_conflict' },
    });
    expect(
      decideUpdateShiftState({
        command,
        current: { ...current, status: 'closed' },
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_shift_closed' },
    });
    expect(
      decideUpdateShiftEligibility({
        command: {
          ...command,
          startsAt: current.startsAt,
          endsAt: current.endsAt,
          effectiveFolderCount: current.effectiveFolderCount,
        },
        current,
        productionRunExists: true,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_shift_already_started' },
    });
  });

  it('distinguishes no-op from a material update only after all guards pass', () => {
    expect(
      decideUpdateShiftEligibility({
        command: {
          ...command,
          startsAt: current.startsAt,
          endsAt: current.endsAt,
          effectiveFolderCount: current.effectiveFolderCount,
        },
        current,
        productionRunExists: false,
      }),
    ).toEqual({ kind: 'ready', changedFields: [] });
    expect(
      decideUpdateShiftEligibility({
        command,
        current,
        productionRunExists: false,
      }),
    ).toEqual({
      kind: 'ready',
      changedFields: ['startsAt', 'endsAt', 'effectiveFolderCount'],
    });
  });

  it.each(['draft', 'accepted'] as const)(
    'derives an exact supersession from a %s current revision',
    (status) => {
      expect(
        decideUpdateShiftSupersession({
          currentSchedule: { scheduleRunId: 'schedule-1', status },
          policy: productionRules,
        }),
      ).toEqual({
        kind: 'ready',
        supersession: {
          scheduleRunId: 'schedule-1',
          lifecycle: { from: status, state: 'superseded' },
        },
      });
    },
  );

  it('does not invent a supersession and rejects an invalid lifecycle result', () => {
    expect(
      decideUpdateShiftSupersession({
        currentSchedule: null,
        policy: productionRules,
      }),
    ).toEqual({ kind: 'ready', supersession: null });

    const invalidPolicy: UpdateShiftPolicy = {
      evaluateScheduleRevisionTransition: () =>
        result.ok({ from: 'draft', state: 'accepted' }),
    };
    expect(
      decideUpdateShiftSupersession({
        currentSchedule: { scheduleRunId: 'schedule-1', status: 'draft' },
        policy: invalidPolicy,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'schedule_current_plan_state_invalid' },
    });
  });
});
