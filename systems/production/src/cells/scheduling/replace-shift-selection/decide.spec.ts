import { proveOperation } from '@pressly/testkit/operation-proof';
import { replaceShiftSelectionCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import {
  canonicalizeSelectedOrderIds,
  decideShiftSelectionAccess,
  decideShiftSelectionChange,
  replaceShiftSelectionOperationId,
} from './decide.ts';
import type { AvailableShiftSelection } from './types.ts';

const ids = {
  shift: '10000000-0000-4000-8000-000000000001',
  order1: '10000000-0000-4000-8000-000000000002',
  order2: '10000000-0000-4000-8000-000000000003',
  schedule: '10000000-0000-4000-8000-000000000004',
} as const;

const current = (
  overrides: Partial<AvailableShiftSelection> = {},
): AvailableShiftSelection => ({
  state: 'available',
  version: 2,
  selectedOrderIds: [ids.order1],
  currentSchedule: null,
  ...overrides,
});

describe('replace shift selection decisions', () => {
  proveOperation({
    operationId: 'production.replace-shift-selection.v1',
    declaration: replaceShiftSelectionCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'owns the stable operation identity and canonical sorted unique input',
        proves: ['decision'],
        run: () => {
          expect(replaceShiftSelectionOperationId).toBe(
            'production.replace-shift-selection.v1',
          );
          expect(
            canonicalizeSelectedOrderIds([ids.order2, ids.order1, ids.order2]),
          ).toEqual([ids.order1, ids.order2]);
        },
      },
    ],
  });

  it.each([
    {
      current: { state: 'not_found' as const },
      code: 'production_shift_not_found',
    },
    {
      current: { state: 'run_exists' as const },
      code: 'production_shift_already_started',
    },
    {
      current: current({ version: 3 }),
      code: 'production_shift_selection_version_conflict',
    },
  ])(
    'rejects unavailable or stale locked state: $code',
    ({ current, code }) => {
      expect(
        decideShiftSelectionAccess({ current, expectedVersion: 2 }),
      ).toMatchObject({ kind: 'reject', failure: { code } });
    },
  );

  it('admits the exact locked selection version for readiness inspection', () => {
    const available = current();
    expect(
      decideShiftSelectionAccess({ current: available, expectedVersion: 2 }),
    ).toEqual({ kind: 'inspect', current: available });
  });

  it('rejects readiness drift before treating an identical selection as a no-op', () => {
    expect(
      decideShiftSelectionChange({
        productionShiftId: ids.shift,
        current: current(),
        selectedOrderIds: [ids.order1],
        selectedOrdersAreReady: false,
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_shift_selection_not_ready' },
    });
  });

  it('preserves version and current plan for an identical canonical selection', () => {
    expect(
      decideShiftSelectionChange({
        productionShiftId: ids.shift,
        current: current({
          selectedOrderIds: [ids.order2, ids.order1],
          currentSchedule: { scheduleRunId: ids.schedule, status: 'draft' },
        }),
        selectedOrderIds: [ids.order1, ids.order2],
        selectedOrdersAreReady: true,
        policy: productionRules,
      }),
    ).toEqual({
      kind: 'no_change',
      result: {
        selection: {
          productionShiftId: ids.shift,
          version: 2,
          selectedOrderIds: [ids.order1, ids.order2],
        },
        supersededScheduleRunId: null,
        replayed: false,
      },
    });
  });

  it('replaces without supersession when no current schedule exists', () => {
    expect(
      decideShiftSelectionChange({
        productionShiftId: ids.shift,
        current: current(),
        selectedOrderIds: [ids.order2],
        selectedOrdersAreReady: true,
        policy: productionRules,
      }),
    ).toEqual({ kind: 'replace', supersede: null });
  });

  it.each(['draft', 'accepted'] as const)(
    'uses the shared lifecycle to supersede a %s current schedule',
    (status) => {
      expect(
        decideShiftSelectionChange({
          productionShiftId: ids.shift,
          current: current({
            currentSchedule: { scheduleRunId: ids.schedule, status },
          }),
          selectedOrderIds: [ids.order2],
          selectedOrdersAreReady: true,
          policy: productionRules,
        }),
      ).toEqual({
        kind: 'replace',
        supersede: {
          scheduleRunId: ids.schedule,
          lifecycle: { from: status, state: 'superseded' },
        },
      });
    },
  );

  it('rejects a current schedule outside the shared supersession graph', () => {
    expect(
      decideShiftSelectionChange({
        productionShiftId: ids.shift,
        current: current({
          currentSchedule: {
            scheduleRunId: ids.schedule,
            status: 'superseded',
          },
        }),
        selectedOrderIds: [ids.order2],
        selectedOrdersAreReady: true,
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'schedule_current_plan_state_invalid' },
    });
  });
});
