import { eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeChangeProductionAdmissionRepository } from '../../../../src/features/demand/change-admission/change-production-admission.repo.ts';
import { makeChangeProductionAdmission } from '../../../../src/features/demand/change-admission/change-production-admission.usecase.ts';
import {
  createProductionTestDatabase,
  seedProductionDemands,
} from '../../../support/database.ts';
import { allowPolicy, makeIds } from '../../../support/production.fake.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const ids = {
  demand: '10000000-0000-4000-8000-000000000101',
  order: '20000000-0000-4000-8000-000000000101',
  shift: '30000000-0000-4000-8000-000000000101',
  actor: '40000000-0000-4000-8000-000000000101',
} as const;

describe('production admission Postgres workflow', () => {
  it('persists a manual release and refuses reversal after open-shift selection', async () => {
    const now = new Date('2026-07-22T15:00:00.000Z');
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: 'location-1',
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'Admission Test Facility',
      timezone: 'America/New_York',
    });
    await seedProductionDemands(testDb.db, {
      id: ids.demand,
      demandKey: 'test:admission-override',
      displayReference: 'ADMISSION-101',
      locationId: 'location-1',
      revisionHash: 'admission-override',
      revisionAt: now,
      phase: 'expected',
      estimatedWeightLbs: 24,
      estimatedWeightSource: 'external_price',
      dueAt: new Date('2026-07-23T20:00:00.000Z'),
    });
    await testDb.db.insert(laundryProduction.productionOrders).values({
      id: ids.order,
      orderDemandId: ids.demand,
      locationId: 'location-1',
      dueAt: new Date('2026-07-23T20:00:00.000Z'),
      operationalStatus: 'release_pending',
      executionStatus: 'unassigned',
      derivedWeightLbs: 24,
      bagCount: 2,
      bagCountSource: 'operator_intake',
      intakeRecordedAt: now,
      intakeVersion: 1,
    });

    const change = makeChangeProductionAdmission({
      repo: makeChangeProductionAdmissionRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
      policy: allowPolicy,
      clock: { now: () => now },
    });

    await expect(
      change({
        locationId: 'location-1',
        orderId: ids.order,
        target: 'released',
        expectedVersion: 1,
        idempotencyKey: 'release-admission-101',
        actorId: ids.actor,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        admissionOverride: 'released',
        status: 'eligible',
        version: 2,
      },
    });
    const [released] = await testDb.db
      .select({
        admissionOverride: laundryProduction.productionOrders.admissionOverride,
        status: laundryProduction.productionOrders.operationalStatus,
        version: laundryProduction.productionOrders.version,
      })
      .from(laundryProduction.productionOrders)
      .where(eq(laundryProduction.productionOrders.id, ids.order));
    expect(released).toEqual({
      admissionOverride: 'released',
      status: 'eligible',
      version: 2,
    });

    await testDb.db.insert(laundryProduction.productionShifts).values({
      id: ids.shift,
      locationId: 'location-1',
      startsAt: now,
      endsAt: new Date('2026-07-22T22:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 2,
    });
    await testDb.db.insert(laundryProduction.productionShiftSelections).values({
      productionShiftId: ids.shift,
      locationId: 'location-1',
      version: 1,
      selectedBy: ids.actor,
      selectedAt: now,
      updatedAt: now,
    });
    await testDb.db
      .insert(laundryProduction.productionShiftSelectedOrders)
      .values({
        productionShiftId: ids.shift,
        locationId: 'location-1',
        productionOrderId: ids.order,
        selectedBy: ids.actor,
        selectedAt: now,
      });

    await expect(
      change({
        locationId: 'location-1',
        orderId: ids.order,
        target: 'source',
        expectedVersion: 2,
        idempotencyKey: 'reverse-admission-101',
        actorId: ids.actor,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: {
        code: 'production_admission_already_committed',
        kind: 'conflict',
      },
    });
  });
});
