import { proveOperation } from '@pressly/testkit/operation-proof';
import { recordOrderIntakeCellDeclaration } from './cell.ts';
import { describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { decideRecordOrderIntake } from './decide.ts';
import type {
  RecordOrderIntakeCommand,
  RecordOrderIntakeFacts,
} from './types.ts';

const command: RecordOrderIntakeCommand = {
  locationId: 'location-1',
  productionOrderId: '10000000-0000-4000-8000-000000000001',
  actorId: '10000000-0000-4000-8000-000000000002',
  bagCount: 2,
  expectedVersion: 3,
  idempotencyKey: 'record-intake-command-1',
};

const facts: RecordOrderIntakeFacts = {
  productionOrderId: command.productionOrderId,
  productionStatus: 'intake_pending',
  productionVersion: 3,
  intakeVersion: 1,
  derivedWeightLbs: 20,
  demandPhase: 'production_released',
  admissionOverride: null,
  executionStatus: 'unassigned',
  resolutionState: 'open',
};

describe('decide record order intake', () => {
  proveOperation({
    operationId: 'production.record-order-intake.v1',
    declaration: recordOrderIntakeCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'derives an eligible state from released positive demand and intake',
        proves: ['decision'],
        run: () => {
          expect(
            decideRecordOrderIntake({
              command,
              facts,
              policy: productionRules,
            }),
          ).toEqual({ kind: 'commit', nextStatus: 'eligible' });
        },
      },
    ],
  });

  it('keeps unreleased intake pending unless an explicit override admits it', () => {
    expect(
      decideRecordOrderIntake({
        command,
        facts: { ...facts, demandPhase: 'expected' },
        policy: productionRules,
      }),
    ).toEqual({ kind: 'commit', nextStatus: 'release_pending' });
    expect(
      decideRecordOrderIntake({
        command: { ...command, bagCount: 0 },
        facts: {
          ...facts,
          demandPhase: 'expected',
          admissionOverride: 'released',
        },
        policy: productionRules,
      }),
    ).toEqual({ kind: 'commit', nextStatus: 'eligible' });
  });

  it('distinguishes missing and stale orders', () => {
    expect(
      decideRecordOrderIntake({
        command,
        facts: null,
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { kind: 'not_found', code: 'production_order_not_found' },
    });
    expect(
      decideRecordOrderIntake({
        command,
        facts: { ...facts, productionVersion: 4 },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_version_conflict' },
    });
  });

  it('keeps operational and intake policy rejections as typed data', () => {
    expect(
      decideRecordOrderIntake({
        command,
        facts: { ...facts, resolutionState: 'resolved_without_production' },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_resolved' },
    });
    expect(
      decideRecordOrderIntake({
        command,
        facts: { ...facts, demandPhase: 'withdrawn' },
        policy: productionRules,
      }),
    ).toMatchObject({ kind: 'reject', failure: { kind: 'conflict' } });
  });

  it('rejects intake after execution has started', () => {
    expect(
      decideRecordOrderIntake({
        command,
        facts: {
          ...facts,
          productionStatus: 'scheduled',
          executionStatus: 'scheduled',
        },
        policy: productionRules,
      }),
    ).toMatchObject({
      kind: 'reject',
      failure: { code: 'production_order_intake_state_invalid' },
    });
  });

  it.each([
    {
      name: 'withdrawn demand',
      command,
      facts: { ...facts, demandPhase: 'withdrawn' as const },
      code: 'order_demand_withdrawn',
    },
    {
      name: 'post-production demand',
      command,
      facts: { ...facts, demandPhase: 'post_production' as const },
      code: 'order_source_already_post_production',
    },
    {
      name: 'invalid weight',
      command,
      facts: { ...facts, derivedWeightLbs: 0 },
      code: 'order_weight_invalid',
    },
    {
      name: 'invalid bag count',
      command: { ...command, bagCount: -1 },
      facts,
      code: 'order_bag_count_invalid',
    },
    {
      name: 'ineligible state',
      command,
      facts: { ...facts, productionStatus: 'ineligible' },
      code: 'production_order_intake_state_invalid',
    },
    {
      name: 'committed execution',
      command,
      facts: { ...facts, executionStatus: 'scheduled' },
      code: 'production_order_intake_state_invalid',
    },
    {
      name: 'unknown execution state',
      command,
      facts: { ...facts, executionStatus: 'unknown' },
      code: 'production_order_execution_state_invalid',
    },
  ])(
    'rejects $name as $code',
    ({ command: nextCommand, facts: nextFacts, code }) => {
      expect(
        decideRecordOrderIntake({
          command: nextCommand,
          facts: nextFacts,
          policy: productionRules,
        }),
      ).toMatchObject({ kind: 'reject', failure: { code } });
    },
  );
});
