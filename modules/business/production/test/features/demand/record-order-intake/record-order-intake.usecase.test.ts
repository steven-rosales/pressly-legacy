import type { ProductionRules } from '../../../../src/foundations/language/rules/production-rules.factory.ts';
import type {
  LockedIntakeOrder,
  RecordOrderIntakeRepository,
} from '../../../../src/features/demand/record-order-intake/record-order-intake.port.ts';
import type { StoredWorkEvent } from '../../../../src/foundations/language/commands/production-command.model.ts';
import { defineWorkEventCommand } from '../../../../src/foundations/language/commands/production-idempotency.policy.ts';
import { makeRecordOrderIntake } from '../../../../src/features/demand/record-order-intake/record-order-intake.usecase.ts';
import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import { allowPolicy } from '../../../support/production.fake.ts';

const locationId = 'location-1';
const orderId = '00000000-0000-4000-8000-000000000101';
const actorId = '00000000-0000-4000-8000-000000000201';
const now = new Date('2026-07-12T16:00:00.000Z');

const command = {
  locationId,
  orderId,
  bagCount: 3,
  expectedVersion: 1,
  idempotencyKey: 'intake-command-1',
  actorId,
} as const;

const replayEvent = (bagCount: number = command.bagCount): StoredWorkEvent => ({
  command: defineWorkEventCommand({
    operation: 'production_order_intake_recorded',
    locationId,
    actorId,
    entityType: 'production_order',
    entityId: orderId,
    expectedVersion: command.expectedVersion,
    payload: { bagCount },
  }),
  result: {
    locationId,
    orderId,
    bagCount,
    bagCountProvenance: 'operator_intake',
    intakeVersion: 1,
    version: 2,
    replayed: false,
  },
  valid: true,
});

const makeHarness = (
  input: {
    order?: LockedIntakeOrder | null;
    replay?: StoredWorkEvent;
    policyError?: Readonly<{ code: string; message: string }>;
    appendFails?: boolean;
    recordConflict?: boolean;
  } = {},
) => {
  let order: LockedIntakeOrder | null =
    input.order === undefined
      ? {
          orderId,
          locationId,
          productionStatus: 'release_pending',
          productionVersion: 1,
          intakeVersion: 0,
          derivedWeightLbs: 42,
          demandPhase: 'expected',
          admissionOverride: null,
          executionStatus: 'unassigned',
          resolutionState: 'open',
        }
      : input.order;
  let bagCount: number | null = null;
  let bagCountProvenance: 'operator_intake' | null = null;
  let bagIndexes: number[] = [];
  let appendedEvents: Array<{
    locationId: string;
    eventType: string;
    entityType: string;
    entityId: string;
    actorId: string;
    expectedVersion?: number;
    idempotencyKey: string;
    payload?: Readonly<Record<string, unknown>>;
  }> = [];
  const workEvents = new Map<string, StoredWorkEvent>();
  if (input.replay !== undefined)
    workEvents.set(command.idempotencyKey, input.replay);

  const findWorkEvent = vi.fn(
    async (key: string) => workEvents.get(key) ?? null,
  );
  const lockLocationScheduling = vi.fn(async () => undefined);
  const lockOrder = vi.fn(async (scope: string, id: string) =>
    order !== null && order.locationId === scope && order.orderId === id
      ? order
      : null,
  );
  const recordIntake = vi.fn(
    async (record: {
      locationId: string;
      orderId: string;
      bagCount: number;
      expectedVersion: number;
      currentIntakeVersion: number;
      nextStatus: 'release_pending' | 'eligible';
      now: Date;
    }) => {
      if (
        input.recordConflict ||
        order === null ||
        order.locationId !== record.locationId ||
        order.orderId !== record.orderId ||
        order.productionVersion !== record.expectedVersion
      )
        return null;

      order = {
        ...order,
        productionStatus: record.nextStatus,
        productionVersion: record.expectedVersion + 1,
        intakeVersion: record.currentIntakeVersion + 1,
      };
      bagCount = record.bagCount;
      bagCountProvenance = 'operator_intake';
      bagIndexes = Array.from({ length: record.bagCount }, (_, index) => index);
      return {
        locationId: record.locationId,
        orderId: record.orderId,
        bagCount: record.bagCount,
        bagCountProvenance: 'operator_intake' as const,
        intakeVersion: order.intakeVersion,
        version: order.productionVersion,
        replayed: false,
      };
    },
  );
  const appendWorkEvent = vi.fn(async (event) => {
    if (input.appendFails) throw new Error('audit append failed');
    appendedEvents.push(event);
    workEvents.set(event.idempotencyKey, {
      command: structuredClone(event.idempotency.command),
      result: structuredClone(event.idempotency.result),
      valid: true,
    });
  });
  const operations = {
    findWorkEvent,
    lockLocationScheduling,
    lockOrder,
    recordIntake,
    appendWorkEvent,
  };
  const repo: RecordOrderIntakeRepository = {
    transaction: async (work) => {
      const snapshot = {
        order: order === null ? null : { ...order },
        bagCount,
        bagCountProvenance,
        bagIndexes: [...bagIndexes],
        appendedEvents: [...appendedEvents],
        workEvents: new Map(workEvents),
      };
      try {
        return await work(operations);
      } catch (error) {
        order = snapshot.order;
        bagCount = snapshot.bagCount;
        bagCountProvenance = snapshot.bagCountProvenance;
        bagIndexes = snapshot.bagIndexes;
        appendedEvents = snapshot.appendedEvents;
        workEvents.clear();
        for (const [key, value] of snapshot.workEvents)
          workEvents.set(key, value);
        throw error;
      }
    },
  };
  const evaluateIntakeAdmission = vi.fn(
    (admission: { phase: LockedIntakeOrder['demandPhase'] }) =>
      input.policyError === undefined
        ? result.ok({
            status:
              admission.phase === 'production_released'
                ? ('eligible' as const)
                : ('release_pending' as const),
          })
        : result.err(input.policyError),
  );
  const policy = {
    ...allowPolicy,
    evaluateIntakeAdmission,
  } satisfies ProductionRules;
  const intake = makeRecordOrderIntake({
    repo,
    policy,
    clock: { now: () => now },
  });

  return {
    intake,
    findWorkEvent,
    lockLocationScheduling,
    lockOrder,
    recordIntake,
    appendWorkEvent,
    evaluateIntakeAdmission,
    inspect: () => ({
      order,
      bagCount,
      bagCountProvenance,
      bagIndexes,
      appendedEvents,
    }),
  };
};

describe('record order intake', () => {
  it('records operator provenance, exact bag indexes, versions, and an audit event', async () => {
    const harness = makeHarness();

    await expect(harness.intake(command)).resolves.toEqual({
      tag: 'ok',
      value: {
        locationId,
        orderId,
        bagCount: 3,
        bagCountProvenance: 'operator_intake',
        intakeVersion: 1,
        version: 2,
        replayed: false,
      },
    });
    expect(harness.lockLocationScheduling).toHaveBeenCalledWith(locationId);
    expect(
      harness.lockLocationScheduling.mock.invocationCallOrder[0],
    ).toBeLessThan(harness.lockOrder.mock.invocationCallOrder[0]!);
    expect(harness.evaluateIntakeAdmission).toHaveBeenCalledWith({
      phase: 'expected',
      derivedWeightLbs: 42,
      bagCount: 3,
    });
    expect(harness.inspect()).toMatchObject({
      order: {
        productionStatus: 'release_pending',
        productionVersion: 2,
        intakeVersion: 1,
      },
      bagCount: 3,
      bagCountProvenance: 'operator_intake',
      bagIndexes: [0, 1, 2],
      appendedEvents: [
        {
          locationId,
          eventType: 'production_order_intake_recorded',
          entityType: 'production_order',
          entityId: orderId,
          actorId,
          expectedVersion: 1,
          idempotencyKey: 'intake-command-1',
          payload: {
            bagCount: 3,
            bagCountProvenance: 'operator_intake',
            intakeVersion: 1,
            version: 2,
          },
        },
      ],
    });
  });

  it('supports an authoritative zero count and increments both versions on correction', async () => {
    const harness = makeHarness({
      order: {
        orderId,
        locationId,
        productionStatus: 'eligible',
        productionVersion: 4,
        intakeVersion: 1,
        derivedWeightLbs: 42,
        demandPhase: 'production_released' as const,
        admissionOverride: null,
        executionStatus: 'unassigned',
        resolutionState: 'open',
      },
    });

    const response = await harness.intake({
      ...command,
      bagCount: 0,
      expectedVersion: 4,
    });

    expect(response).toMatchObject({
      tag: 'ok',
      value: { bagCount: 0, intakeVersion: 2, version: 5 },
    });
    expect(harness.inspect().bagIndexes).toEqual([]);
  });

  it('replays only the same location-scoped command without touching order state', async () => {
    const harness = makeHarness({
      replay: replayEvent(),
    });

    await expect(harness.intake(command)).resolves.toMatchObject({
      tag: 'ok',
      value: { orderId, bagCount: 3, version: 2, replayed: true },
    });
    expect(harness.lockLocationScheduling).not.toHaveBeenCalled();
    expect(harness.lockOrder).not.toHaveBeenCalled();
    expect(harness.evaluateIntakeAdmission).not.toHaveBeenCalled();
    expect(harness.recordIntake).not.toHaveBeenCalled();
    expect(harness.appendWorkEvent).not.toHaveBeenCalled();
  });

  it('rejects reuse of an intake idempotency key for a different command', async () => {
    const harness = makeHarness({
      replay: replayEvent(2),
    });

    await expect(harness.intake(command)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict', kind: 'conflict' },
    });
    expect(harness.lockOrder).not.toHaveBeenCalled();
  });

  it.each([
    ['missing order', locationId, null],
    [
      'cross-location order',
      'location-2',
      {
        orderId,
        locationId,
        productionStatus: 'release_pending',
        productionVersion: 1,
        intakeVersion: 0,
        derivedWeightLbs: 42,
        demandPhase: 'production_released' as const,
        admissionOverride: null,
        executionStatus: 'unassigned',
        resolutionState: 'open',
      },
    ],
  ])('fails closed for a %s', async (_name, scope, order) => {
    const harness = makeHarness({ order });

    await expect(
      harness.intake({ ...command, locationId: scope }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_order_not_found', kind: 'not_found' },
    });
    expect(harness.evaluateIntakeAdmission).not.toHaveBeenCalled();
    expect(harness.recordIntake).not.toHaveBeenCalled();
  });

  it('rejects stale versions and orders that have entered production', async () => {
    const stale = makeHarness();
    await expect(
      stale.intake({ ...command, expectedVersion: 2 }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_order_version_conflict' },
    });
    expect(stale.evaluateIntakeAdmission).not.toHaveBeenCalled();

    const scheduled = makeHarness({
      order: {
        orderId,
        locationId,
        productionStatus: 'scheduled',
        productionVersion: 1,
        intakeVersion: 0,
        derivedWeightLbs: 42,
        demandPhase: 'production_released',
        admissionOverride: null,
        executionStatus: 'scheduled',
        resolutionState: 'open',
      },
    });
    await expect(scheduled.intake(command)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_order_intake_state_invalid' },
    });
    expect(scheduled.evaluateIntakeAdmission).not.toHaveBeenCalled();
  });

  it('rejects intake after the order is archived from active work', async () => {
    const harness = makeHarness({
      order: {
        orderId,
        locationId,
        productionStatus: 'intake_pending',
        productionVersion: 1,
        intakeVersion: 0,
        derivedWeightLbs: 42,
        demandPhase: 'production_released',
        admissionOverride: null,
        executionStatus: 'unassigned',
        resolutionState: 'resolved_without_production',
      },
    });

    await expect(harness.intake(command)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_order_resolved', kind: 'conflict' },
    });
    expect(harness.evaluateIntakeAdmission).not.toHaveBeenCalled();
    expect(harness.recordIntake).not.toHaveBeenCalled();
    expect(harness.appendWorkEvent).not.toHaveBeenCalled();
  });

  it('honors demand lifecycle policy rejection before any write', async () => {
    const harness = makeHarness({
      order: {
        orderId,
        locationId,
        productionStatus: 'intake_pending',
        productionVersion: 1,
        intakeVersion: 0,
        derivedWeightLbs: 42,
        demandPhase: 'post_production',
        admissionOverride: null,
        executionStatus: 'unassigned',
        resolutionState: 'open',
      },
      policyError: {
        code: 'ORDER_SOURCE_ALREADY_POST_PRODUCTION',
        message: 'Review the source mismatch before recording intake.',
      },
    });

    await expect(harness.intake(command)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'order_source_already_post_production', kind: 'conflict' },
    });
    expect(harness.recordIntake).not.toHaveBeenCalled();
    expect(harness.appendWorkEvent).not.toHaveBeenCalled();
  });

  it('rolls back intake mutation when the audit append fails', async () => {
    const harness = makeHarness({ appendFails: true });

    await expect(harness.intake(command)).rejects.toMatchObject({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'production_intake_failed',
      status: 503,
      cause: expect.any(Error),
    });
    expect(harness.inspect()).toMatchObject({
      order: {
        productionStatus: 'release_pending',
        productionVersion: 1,
        intakeVersion: 0,
      },
      bagCount: null,
      bagCountProvenance: null,
      bagIndexes: [],
      appendedEvents: [],
    });
  });
});
