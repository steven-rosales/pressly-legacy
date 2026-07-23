import type { ChangeProductionAdmissionResult } from '@pressly/contracts';
import { describe, expect, it, vi } from 'vitest';
import type {
  ChangeProductionAdmissionRepository,
  LockedProductionAdmission,
} from '../../src/change-production-admission/change-production-admission.port.ts';
import { makeChangeProductionAdmission } from '../../src/change-production-admission/change-production-admission.usecase.ts';
import { allowPolicy } from '../support/production.fake.ts';

const ids = {
  order: '11111111-1111-4111-8111-111111111111',
  actor: '22222222-2222-4222-8222-222222222222',
} as const;

const lockedOrder = (
  overrides: Partial<LockedProductionAdmission> = {},
): LockedProductionAdmission => ({
  orderId: ids.order,
  locationId: 'location-1',
  sourceAdmissionState: 'unreleased',
  productionStatus: 'release_pending',
  productionVersion: 4,
  admissionOverride: null,
  bagCount: null,
  selectedForShift: false,
  hasActivePlacement: false,
  ...overrides,
});

const makeRepository = (order: LockedProductionAdmission) => {
  const changed: ChangeProductionAdmissionResult = {
    locationId: order.locationId,
    orderId: order.orderId,
    admissionOverride: 'released',
    status: order.bagCount === null ? 'intake_pending' : 'eligible',
    version: order.productionVersion + 1,
    replayed: false,
  };
  const lockLocationScheduling = vi.fn(async () => undefined);
  const changeAdmission = vi.fn(async () => changed);
  const appendWorkEvent = vi.fn(async () => undefined);
  const operations = {
    findWorkEvent: vi.fn(async () => null),
    lockLocationScheduling,
    lockOrder: vi.fn(async () => order),
    changeAdmission,
    appendWorkEvent,
  };
  const repo: ChangeProductionAdmissionRepository = {
    transaction: async (work) => work(operations),
  };

  return {
    repo,
    lockLocationScheduling,
    changeAdmission,
    appendWorkEvent,
  };
};

const command = {
  locationId: 'location-1',
  orderId: ids.order,
  target: 'released' as const,
  expectedVersion: 4,
  idempotencyKey: 'release-order-1',
  actorId: ids.actor,
};

describe('change production admission', () => {
  it('manually releases forecast-only demand and records an audited version change', async () => {
    const repository = makeRepository(lockedOrder({ bagCount: 2 }));
    const change = makeChangeProductionAdmission({
      repo: repository.repo,
      policy: allowPolicy,
      clock: { now: () => new Date('2026-07-22T15:00:00.000Z') },
    });

    await expect(change(command)).resolves.toMatchObject({
      tag: 'ok',
      value: {
        admissionOverride: 'released',
        status: 'eligible',
        version: 5,
      },
    });
    expect(repository.lockLocationScheduling).toHaveBeenCalledWith(
      'location-1',
    );
    expect(repository.changeAdmission).toHaveBeenCalledWith({
      locationId: 'location-1',
      orderId: ids.order,
      actorId: ids.actor,
      expectedVersion: 4,
      admissionOverride: 'released',
      nextStatus: 'eligible',
      now: new Date('2026-07-22T15:00:00.000Z'),
    });
    expect(repository.appendWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'production_admission_changed',
        entityType: 'production_order',
        entityId: ids.order,
        actorId: ids.actor,
      }),
    );
  });

  it('returns a manually released order to source control before scheduling', async () => {
    const repository = makeRepository(
      lockedOrder({
        productionStatus: 'eligible',
        admissionOverride: 'released',
        bagCount: 2,
      }),
    );
    repository.changeAdmission.mockResolvedValue({
      locationId: 'location-1',
      orderId: ids.order,
      admissionOverride: null,
      status: 'release_pending',
      version: 5,
      replayed: false,
    });
    const change = makeChangeProductionAdmission({
      repo: repository.repo,
      policy: allowPolicy,
      clock: { now: () => new Date('2026-07-22T15:00:00.000Z') },
    });

    await expect(
      change({ ...command, target: 'source' }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        admissionOverride: null,
        status: 'release_pending',
      },
    });
    expect(repository.changeAdmission).toHaveBeenCalledWith(
      expect.objectContaining({
        admissionOverride: null,
        nextStatus: 'release_pending',
      }),
    );
  });

  it('blocks reversal once the order is selected for a shift', async () => {
    const repository = makeRepository(
      lockedOrder({
        productionStatus: 'eligible',
        admissionOverride: 'released',
        bagCount: 2,
        selectedForShift: true,
      }),
    );
    const change = makeChangeProductionAdmission({
      repo: repository.repo,
      policy: allowPolicy,
      clock: { now: () => new Date('2026-07-22T15:00:00.000Z') },
    });

    await expect(
      change({ ...command, target: 'source' }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: {
        code: 'production_admission_already_committed',
        status: 409,
      },
    });
    expect(repository.changeAdmission).not.toHaveBeenCalled();
    expect(repository.appendWorkEvent).not.toHaveBeenCalled();
  });
});
