import { proveOperation } from '@pressly/testkit/operation-proof';
import { createScheduleCellDeclaration } from './cell.ts';
import * as result from '@pressly/cells/result';
import { describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import type { SchedulingInput } from '../../../model/production-schedule/model.ts';
import {
  createScheduleOperationId,
  decideCurrentPlanSupersession,
  decidePlanningState,
  decidePlanningWindow,
  decideSchedulingInput,
} from './decide.ts';
import type { CreateSchedulePolicy } from './types.ts';

const input: SchedulingInput = {
  orders: [],
  machines: [],
  shift: {
    id: 'shift',
    startsAt: '2026-08-22T13:00:00.000Z',
    endsAt: '2026-08-22T21:00:00.000Z',
    timezone: 'America/New_York',
    effectiveFolderCount: 2,
    version: 1,
  },
  config: {
    id: 'config',
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
  },
};
describe('create schedule decisions', () => {
  proveOperation({
    operationId: 'production.create-schedule.v1',
    declaration: createScheduleCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'owns identity and planning/input failure precedence',
        proves: ['decision'],
        run: () => {
          expect(createScheduleOperationId).toBe(
            'production.create-schedule.v1',
          );
          expect(decidePlanningState('not_found')).toMatchObject({
            code: 'production_shift_not_found',
          });
          expect(decidePlanningState('run_exists')).toMatchObject({
            code: 'production_shift_already_started',
          });
          expect(decidePlanningState('available')).toBeNull();
          expect(decideSchedulingInput(null)).toMatchObject({
            failure: { code: 'scheduling_input_not_found' },
          });
          expect(decideSchedulingInput('selection_empty')).toMatchObject({
            failure: { code: 'schedule_selection_empty' },
          });
          expect(decideSchedulingInput('selection_invalid')).toMatchObject({
            failure: { code: 'schedule_selection_not_ready' },
          });
          expect(decideSchedulingInput(input)).toEqual({
            kind: 'ready',
            input,
          });
        },
      },
    ],
  });
  it('enforces compute before shift end', () => {
    expect(
      decidePlanningWindow({
        schedulingInput: input,
        now: new Date('2026-08-22T20:59:59.000Z'),
        policy: productionRules,
      }),
    ).toBeNull();
    expect(
      decidePlanningWindow({
        schedulingInput: input,
        now: new Date(input.shift.endsAt),
        policy: productionRules,
      }),
    ).toMatchObject({ code: 'production_shift_expired' });
  });
  it.each(['draft', 'accepted'] as const)(
    'supersedes %s and rejects invalid lifecycle',
    (status) => {
      expect(
        decideCurrentPlanSupersession({
          current: { scheduleRunId: 'plan', status },
          policy: productionRules,
        }),
      ).toMatchObject({
        kind: 'ready',
        supersession: { lifecycle: { from: status, state: 'superseded' } },
      });
      const policy: CreateSchedulePolicy = {
        ...productionRules,
        evaluateScheduleRevisionTransition: () =>
          result.ok({ from: 'draft', state: 'accepted' }),
      };
      expect(
        decideCurrentPlanSupersession({
          current: { scheduleRunId: 'plan', status },
          policy,
        }),
      ).toMatchObject({
        failure: { code: 'schedule_current_plan_state_invalid' },
      });
    },
  );
});
