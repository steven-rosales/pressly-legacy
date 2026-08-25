import { schedulingProductionSystemDependencies } from './support/production-system-dependencies.ts';
import type { IdSource } from '@pressly/cells/id-source';
import {
  makeProductionSystem,
  type ProductionSystemUnitOfWorkObserver,
} from '@pressly/production-system/testing/assembly';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createShiftConformanceIds as ids,
  createShiftConformanceLocationId as locationId,
  createShiftConformanceScenarios,
  createShiftOutcomeCode,
  runCreateShiftConformanceScenario,
  type CreateShiftConformanceVariant,
  type CreateShiftTransactionObservation,
} from '../src/public.ts';
import {
  createCreateShiftConformanceDatabase,
  readCreateShiftConformanceState,
  seedCreateShiftConformance,
} from './support/create-shift-fixture.ts';

const database = createCreateShiftConformanceDatabase();

beforeAll(database.check);
afterAll(database.close);

const generatedIds = (): IdSource => {
  const values = [ids.shift, ids.event] as const;
  let index = 0;
  return {
    next: () =>
      values[index++] ??
      `34000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  };
};

const trackedClock = () => {
  let reads = 0;
  return {
    clock: {
      now: () => {
        reads += 1;
        return new Date('2026-08-22T12:00:00.000Z');
      },
    },
    reads: () => reads,
  };
};

const makeTarget = (): CreateShiftConformanceVariant => {
  const clock = trackedClock();
  const transactionOutcomes: CreateShiftTransactionObservation[] = [];
  const observeCellUnitOfWork: ProductionSystemUnitOfWorkObserver = (
    operation,
    unitOfWork,
  ) => {
    if (operation !== 'production.create_shift') return unitOfWork;
    return {
      transaction: async (work) => {
        try {
          const outcome = await unitOfWork.transaction(work);
          transactionOutcomes.push(outcome.tag);
          return outcome;
        } catch (error) {
          transactionOutcomes.push('threw');
          throw error;
        }
      },
    };
  };
  const system = makeProductionSystem({
    ...schedulingProductionSystemDependencies(),

    db: database.db,
    ids: generatedIds(),
    clock: clock.clock,
    observeCellUnitOfWork,
  });
  return {
    execute: system.cells.createShift.execute,
    clockReads: clock.reads,
    transactionOutcomes: () => transactionOutcomes,
  };
};

const exactCreatedShift = {
  id: ids.shift,
  locationId,
  startsAt: '2026-08-22T13:00:00.000Z',
  endsAt: '2026-08-22T21:00:00.000Z',
  timezone: 'America/New_York',
  effectiveFolderCount: 4,
  status: 'open',
  version: 1,
} as const;

const exactCreatedWorkEvent = {
  id: ids.event,
  locationId,
  eventType: 'production_shift_created',
  entityType: 'production_shift',
  entityId: ids.shift,
  actorId: ids.actor,
  expectedVersion: null,
  idempotencyKey: 'create-shift-conformance-1',
  payload: {
    startsAt: '2026-08-22T13:00:00.000Z',
    endsAt: '2026-08-22T21:00:00.000Z',
    _idempotency: {
      version: 1,
      command: {
        operation: 'production_shift_created',
        locationId,
        actorId: ids.actor,
        target: { entityType: 'production_shift', entityId: null },
        expectedVersion: null,
        payload: {
          startsAt: '2026-08-22T13:00:00.000Z',
          endsAt: '2026-08-22T21:00:00.000Z',
          timezone: 'America/New_York',
          effectiveFolderCount: 4,
        },
      },
      result: exactCreatedShift,
    },
  },
} as const;

describe('production.create-shift.v1 target conformance', () => {
  it.each(createShiftConformanceScenarios)('$name', async (scenario) => {
    const observation = await runCreateShiftConformanceScenario({
      scenario,
      reset: database.reset,
      seed: (fixture) => seedCreateShiftConformance(database.db, fixture),
      readState: () => readCreateShiftConformanceState(database.db),
      makeTarget,
    });

    expect(observation.outcomes.map(createShiftOutcomeCode)).toEqual(
      scenario.expectedOutcomeCodes,
    );
    expect(
      observation.after.shifts.length - observation.before.shifts.length,
    ).toBe(scenario.expectedShiftDelta);
    expect(
      observation.after.workEvents.length -
        observation.before.workEvents.length,
    ).toBe(scenario.expectedWorkEventDelta);
    expect(observation.clockReads).toBe(0);
    expect(observation.transactionOutcomes).toEqual(
      scenario.expectedTransactions,
    );
    expect(observation.after.liveRevision).toBe(
      observation.before.liveRevision + scenario.expectedWorkEventDelta,
    );
    if (scenario.expectedWorkEventDelta === 1) {
      expect(observation.after.shifts).toEqual([exactCreatedShift]);
      expect(observation.after.workEvents).toEqual([exactCreatedWorkEvent]);
    } else {
      expect(observation.after).toEqual(observation.before);
    }

    if (scenario.commands.length === 2) {
      const first = observation.outcomes[0];
      const second = observation.outcomes[1];
      if (scenario.expectedOutcomeCodes[1] === 'success')
        expect(second).toEqual(first);
    }
  });
});
