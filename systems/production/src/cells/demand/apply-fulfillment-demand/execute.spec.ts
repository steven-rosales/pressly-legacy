import { proveOperation } from '@pressly/testkit/operation-proof';
import { applyFulfillmentDemandCellDeclaration } from './cell.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import { productionRules } from '../../../model/public.ts';
import { describe, expect, it, vi } from 'vitest';
import {
  applyFulfillmentDemandWorkEventCommand,
  makeExecuteApplyFulfillmentDemand,
  type ApplyFulfillmentDemandTransactionRepository,
} from './execute.ts';
import {
  resolveApplyFulfillmentDemandReplay,
  serializeApplyFulfillmentDemandWorkEventCommand,
  type StoredApplyFulfillmentDemandWorkEvent,
} from './idempotency.ts';
import type {
  ApplyFulfillmentDemandCommand,
  StoredFulfillmentDemand,
} from './types.ts';

const command = (
  overrides: Partial<ApplyFulfillmentDemandCommand> = {},
): ApplyFulfillmentDemandCommand => ({
  fulfillmentId: 'fulfillment-1',
  fulfillmentVersion: 2,
  projectionHash: 'a'.repeat(64),
  displayReference: 'ORDER-1',
  locationId: 'location-1',
  admissionState: 'unreleased',
  commercialState: 'open',
  dueAt: '2026-08-22T20:00:00.000Z',
  observedAt: '2026-08-22T15:00:00.000Z',
  estimatedWeightLbs: 24,
  estimatedWeightSource: 'external_estimate',
  idempotencyKey: 'order-outbox:event-1',
  ...overrides,
});

const storedDemand = (
  overrides: Partial<StoredFulfillmentDemand> = {},
): StoredFulfillmentDemand => ({
  orderDemandId: 'demand-existing',
  productionOrderId: 'order-existing',
  fulfillmentId: 'fulfillment-1',
  fulfillmentVersion: 1,
  projectionHash: 'b'.repeat(64),
  locationId: 'location-1',
  admissionState: 'unreleased',
  commercialState: 'open',
  dueAt: '2026-08-21T20:00:00.000Z',
  estimatedWeightLbs: 20,
  estimatedWeightSource: 'external_estimate',
  bagCount: null,
  admissionOverride: null,
  productionExecutionStatus: 'unassigned',
  productionResolutionState: 'open',
  productionStatus: 'release_pending',
  ...overrides,
});

const makeHarness = (
  overrides: {
    storedWorkEvent?: StoredApplyFulfillmentDemandWorkEvent | null;
    active?: boolean;
    existing?: StoredFulfillmentDemand | null;
    mutation?:
      | Readonly<{ kind: 'version_conflict' }>
      | Readonly<{ kind: 'stored'; demand: StoredFulfillmentDemand }>;
  } = {},
) => {
  const trace: string[] = [];
  const appended: unknown[] = [];
  const now = new Date('2026-08-22T16:00:00.000Z');
  const transactionRepository: ApplyFulfillmentDemandTransactionRepository<StoredApplyFulfillmentDemandWorkEvent> =
    {
      findWorkEvent: async () => {
        trace.push('find-work-event');
        return overrides.storedWorkEvent ?? null;
      },
      locationIsActive: async () => {
        trace.push('location-active');
        return overrides.active ?? true;
      },
      lockLocationScheduling: async () => {
        trace.push('lock-location');
      },
      lockFulfillment: async () => {
        trace.push('lock-fulfillment');
      },
      loadDemand: async () => {
        trace.push('load-demand');
        return overrides.existing ?? null;
      },
      applyDemand: async (input) => {
        trace.push('apply-demand');
        return (
          overrides.mutation ?? {
            kind: 'stored',
            demand: storedDemand({
              orderDemandId: input.orderDemandId,
              productionOrderId: 'order-created',
              fulfillmentVersion: input.command.fulfillmentVersion,
              projectionHash: input.command.projectionHash,
            }),
          }
        );
      },
      appendWorkEvent: async (event) => {
        trace.push('append-work-event');
        appended.push(event);
      },
    };
  const next = vi.fn(() => {
    trace.push('next-id');
    return 'demand-created';
  });
  const clock = vi.fn(() => {
    trace.push('clock');
    return now;
  });
  const execute = makeExecuteApplyFulfillmentDemand({
    repo: {
      transaction: async (work) => {
        trace.push('transaction');
        return work(transactionRepository);
      },
    },
    idempotency: { resolveReplay: resolveApplyFulfillmentDemandReplay },
    policy: productionRules,
    clock: { now: clock },
    ids: { next },
  });
  return { execute, trace, appended, next, clock, now };
};

describe('apply fulfillment demand executor', () => {
  proveOperation({
    operationId: 'production.apply-fulfillment-demand.v1',
    declaration: applyFulfillmentDemandCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'preserves replay, validation, read, lock, ID, clock, mutation, and event order',
        proves: ['executor-success'],
        run: async () => {
          const harness = makeHarness();
          await expect(harness.execute(command())).resolves.toEqual({
            kind: 'success',
            value: {
              orderDemandId: 'demand-created',
              productionOrderId: 'order-created',
              outcome: 'applied',
              replayed: false,
            },
          });
          expect(harness.trace).toEqual([
            'transaction',
            'find-work-event',
            'location-active',
            'lock-location',
            'lock-fulfillment',
            'find-work-event',
            'load-demand',
            'next-id',
            'clock',
            'apply-demand',
            'append-work-event',
          ]);
          expect(harness.appended).toEqual([
            expect.objectContaining({
              actorId: '00000000-0000-4000-8000-000000000000',
              entityType: 'order_demand',
              entityId: 'demand-created',
              idempotencyKey: 'order-outbox:event-1',
              payload: { outcome: 'applied' },
            }),
          ]);
        },
      },
    ],
  });

  it('replays an exact receipt before semantic validation, reads, IDs, or clock', async () => {
    const invalid = command({
      fulfillmentVersion: 0,
      projectionHash: 'invalid',
      dueAt: 'invalid',
    });
    const identity = applyFulfillmentDemandWorkEventCommand(invalid);
    const harness = makeHarness({
      storedWorkEvent: {
        valid: true,
        command: serializeApplyFulfillmentDemandWorkEventCommand(identity),
        result: {
          orderDemandId: 'demand-replayed',
          productionOrderId: null,
          outcome: 'applied',
          replayed: false,
        },
      },
    });
    await expect(harness.execute(invalid)).resolves.toEqual({
      kind: 'success',
      value: {
        orderDemandId: 'demand-replayed',
        productionOrderId: null,
        outcome: 'applied',
        replayed: true,
      },
    });
    expect(harness.trace).toEqual(['transaction', 'find-work-event']);
    expect(harness.next).not.toHaveBeenCalled();
    expect(harness.clock).not.toHaveBeenCalled();
  });

  it('stops invalid input and unavailable locations before locks', async () => {
    const invalid = makeHarness();
    await expect(
      invalid.execute(command({ projectionHash: 'invalid' })),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'fulfillment_demand_invalid' },
    });
    expect(invalid.trace).toEqual(['transaction', 'find-work-event']);

    const unavailable = makeHarness({ active: false });
    await expect(unavailable.execute(command())).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_location_unavailable' },
    });
    expect(unavailable.trace).toEqual([
      'transaction',
      'find-work-event',
      'location-active',
    ]);
  });

  it.each([
    {
      name: 'older',
      existing: storedDemand({ fulfillmentVersion: 3 }),
      input: command({ fulfillmentVersion: 2 }),
      outcome: 'ignored_older',
    },
    {
      name: 'equal',
      existing: storedDemand({
        fulfillmentVersion: 2,
        projectionHash: 'a'.repeat(64),
      }),
      input: command(),
      outcome: 'unchanged',
    },
  ] as const)(
    'audits a fresh-key $name revision without IDs or clock',
    async (test) => {
      const harness = makeHarness({ existing: test.existing });
      await expect(harness.execute(test.input)).resolves.toMatchObject({
        kind: 'success',
        value: { outcome: test.outcome, replayed: false },
      });
      expect(harness.trace).toEqual([
        'transaction',
        'find-work-event',
        'location-active',
        'lock-location',
        'lock-fulfillment',
        'find-work-event',
        'load-demand',
        'append-work-event',
      ]);
      expect(harness.next).not.toHaveBeenCalled();
      expect(harness.clock).not.toHaveBeenCalled();
    },
  );

  it('rejects same-version divergence after locks without audit, IDs, or clock', async () => {
    const harness = makeHarness({
      existing: storedDemand({
        fulfillmentVersion: 2,
        projectionHash: 'b'.repeat(64),
      }),
    });
    await expect(harness.execute(command())).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'fulfillment_demand_diverged' },
    });
    expect(harness.trace.at(-1)).toBe('load-demand');
    expect(harness.appended).toEqual([]);
    expect(harness.next).not.toHaveBeenCalled();
    expect(harness.clock).not.toHaveBeenCalled();
  });

  it('returns the typed late CAS conflict after one clock and no event', async () => {
    const harness = makeHarness({
      existing: storedDemand(),
      mutation: { kind: 'version_conflict' },
    });
    await expect(harness.execute(command())).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'conflict',
        code: 'production_fulfillment_demand_order_version_conflict',
        message: 'Production order changed during demand application.',
        safeMessage: 'Production state changed. Refresh and try again.',
      },
    });
    expect(harness.clock).toHaveBeenCalledOnce();
    expect(harness.appended).toEqual([]);
  });

  it('preserves typed rollback failures, AppErrors, and unknown wrapping', async () => {
    const taggedFailure = {
      tag: 'ProductionFailure',
      kind: 'conflict',
      code: 'fixture_conflict',
      message: 'fixture',
      safeMessage: 'fixture',
    } as const;
    const expected = makeExecuteApplyFulfillmentDemand({
      repo: { transaction: async () => Promise.reject(taggedFailure) },
      idempotency: { resolveReplay: () => ({ kind: 'miss' }) },
      policy: productionRules,
      clock: { now: () => new Date() },
      ids: { next: () => 'unused' },
    });
    await expect(expected(command())).resolves.toEqual({
      kind: 'failure',
      failure: {
        kind: 'conflict',
        code: 'fixture_conflict',
        message: 'fixture',
        safeMessage: 'fixture',
      },
    });

    for (const tagged of [
      {
        tag: 'ProductionFailure',
        kind: 'validation',
        classification: 'malformed',
        code: 'fixture_validation',
        message: 'fixture validation',
        safeMessage: 'fixture validation',
      },
      {
        tag: 'ProductionFailure',
        kind: 'not_found',
        code: 'fixture_not_found',
        message: 'fixture missing',
        safeMessage: 'fixture missing',
      },
    ] as const) {
      const execute = makeExecuteApplyFulfillmentDemand({
        repo: { transaction: async () => Promise.reject(tagged) },
        idempotency: { resolveReplay: () => ({ kind: 'miss' }) },
        policy: productionRules,
        clock: { now: () => new Date() },
        ids: { next: () => 'unused' },
      });
      await expect(execute(command())).resolves.toMatchObject({
        kind: 'failure',
        failure: {
          kind: tagged.kind,
          code: tagged.code,
          ...(tagged.kind === 'validation'
            ? { classification: 'malformed' }
            : {}),
        },
      });
    }

    const appError = invariantViolationError({
      code: 'fixture_invariant',
      message: 'fixture',
      safeMessage: 'fixture',
    });
    const passThrough = makeExecuteApplyFulfillmentDemand({
      repo: { transaction: async () => Promise.reject(appError) },
      idempotency: { resolveReplay: () => ({ kind: 'miss' }) },
      policy: productionRules,
      clock: { now: () => new Date() },
      ids: { next: () => 'unused' },
    });
    await expect(passThrough(command())).rejects.toBe(appError);

    const unknown = Object.freeze({ fixture: 'unknown' });
    const wrapped = makeExecuteApplyFulfillmentDemand({
      repo: { transaction: async () => Promise.reject(unknown) },
      idempotency: { resolveReplay: () => ({ kind: 'miss' }) },
      policy: productionRules,
      clock: { now: () => new Date() },
      ids: { next: () => 'unused' },
    });
    await expect(wrapped(command())).rejects.toMatchObject({
      code: 'fulfillment_demand_application_failed',
      status: 503,
      cause: unknown,
    });
  });
});
