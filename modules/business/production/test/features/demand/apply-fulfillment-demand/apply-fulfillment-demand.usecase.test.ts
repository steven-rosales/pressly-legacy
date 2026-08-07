import { describe, expect, it } from 'vitest';
import { makeProductionApplication } from '../../../../src/composition/production.composition.ts';
import { makeMemoryProductionRepositories } from '../../../support/memory-production-repositories.ts';
import { makeClock, makeIds } from '../../../support/production.fake.ts';

const command = (overrides: Record<string, unknown> = {}) => ({
  fulfillmentId: '00000000-0000-4000-8000-000000001001',
  fulfillmentVersion: 2,
  displayReference: '1001',
  locationId: 'location-1',
  observedAt: '2026-07-10T13:59:00.000Z',
  projectionHash: 'a'.repeat(64),
  admissionState: 'unreleased' as const,
  commercialState: 'open' as const,
  dueAt: '2026-07-10T20:00:00.000Z',
  estimatedWeightLbs: 74,
  estimatedWeightSource: 'external_estimate' as const,
  bagCount: null,
  idempotencyKey: 'demand-command-1',
  ...overrides,
});

const setup = () => {
  const ids = makeIds();
  const memory = makeMemoryProductionRepositories({ ids });
  return {
    memory,
    application: makeProductionApplication({
      repositories: memory.repositories,
      clock: makeClock('2026-07-10T14:00:00.000Z').clock,
      ids,
    }),
  };
};

describe('canonical fulfillment demand', () => {
  it('creates a release-pending production order without source concepts', async () => {
    const { application, memory } = setup();
    await expect(
      application.applyFulfillmentDemand(command()),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { outcome: 'applied', replayed: false },
    });
    expect([...memory.inspect().orders.values()]).toMatchObject([
      {
        externalOrderId: '1001',
        status: 'release_pending',
        derivedWeightLbs: 74,
        bagCount: null,
      },
    ]);
  });

  it('stores unweighed demand without fabricating production work', async () => {
    const { application, memory } = setup();
    await expect(
      application.applyFulfillmentDemand(
        command({
          estimatedWeightLbs: null,
          estimatedWeightSource: null,
        }),
      ),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { outcome: 'applied', productionOrderId: null },
    });
    expect([...memory.inspect().orders.values()]).toEqual([]);
    expect([...memory.inspect().demands.values()]).toMatchObject([
      {
        commercialState: 'open',
        estimatedWeightLbs: null,
        estimatedWeightSource: null,
        productionOrderId: null,
      },
    ]);
  });

  it('admits a previously unweighed demand when a newer estimate arrives', async () => {
    const { application, memory } = setup();
    await application.applyFulfillmentDemand(
      command({
        estimatedWeightLbs: null,
        estimatedWeightSource: null,
      }),
    );
    await expect(
      application.applyFulfillmentDemand(
        command({
          fulfillmentVersion: 3,
          observedAt: '2026-07-10T14:01:00.000Z',
          projectionHash: 'b'.repeat(64),
          idempotencyKey: 'demand-command-weighed',
        }),
      ),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        outcome: 'applied',
        productionOrderId: expect.any(String),
      },
    });
    expect([...memory.inspect().orders.values()]).toMatchObject([
      { status: 'release_pending', derivedWeightLbs: 74 },
    ]);
  });

  it('replays one idempotency key only for the exact canonical command', async () => {
    const { application } = setup();
    await application.applyFulfillmentDemand(command());
    await expect(
      application.applyFulfillmentDemand(command()),
    ).resolves.toMatchObject({ tag: 'ok', value: { replayed: true } });
    await expect(
      application.applyFulfillmentDemand(
        command({ displayReference: 'changed-reference' }),
      ),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict' },
    });
    await expect(
      application.applyFulfillmentDemand(command({ bagCount: 9 })),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict' },
    });
  });

  it('ignores older revisions and accepts an equal identical revision unchanged', async () => {
    const { application } = setup();
    await application.applyFulfillmentDemand(command());
    await expect(
      application.applyFulfillmentDemand(
        command({
          fulfillmentVersion: 1,
          observedAt: '2026-07-10T13:58:00.000Z',
          projectionHash: 'b'.repeat(64),
          idempotencyKey: 'demand-command-older',
        }),
      ),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { outcome: 'ignored_older' },
    });
    await expect(
      application.applyFulfillmentDemand(
        command({ idempotencyKey: 'demand-command-equal' }),
      ),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { outcome: 'unchanged' },
    });
  });

  it('rejects divergent data at the same source revision', async () => {
    const { application } = setup();
    await application.applyFulfillmentDemand(command());
    await expect(
      application.applyFulfillmentDemand(
        command({
          projectionHash: 'c'.repeat(64),
          idempotencyKey: 'demand-command-diverged',
        }),
      ),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'fulfillment_demand_diverged' },
    });
  });

  it('fails closed for an unavailable production location', async () => {
    const { application } = setup();
    await expect(
      application.applyFulfillmentDemand(
        command({
          locationId: 'unknown-location',
          idempotencyKey: 'demand-command-unmapped',
        }),
      ),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_location_unavailable' },
    });
  });

  it('ignores a legacy external bag count and keeps released demand intake pending', async () => {
    const { application, memory } = setup();
    const legacyPayload = command({
      admissionState: 'released',
      bagCount: 2,
      idempotencyKey: 'eligible-demand-command',
    });

    await expect(
      application.applyFulfillmentDemand(legacyPayload),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { outcome: 'applied', replayed: false },
    });
    const [order] = [...memory.inspect().orders.values()];
    expect(order).toMatchObject({ status: 'intake_pending', bagCount: null });
    expect(memory.inspect().intakeVersions.get(order!.id)).toBeUndefined();
    expect(memory.inspect().bagStatuses.get(order!.id)).toBeUndefined();
  });

  it('preserves a manual Pressly release across lagging source updates and lets source withdrawal win', async () => {
    const { application, memory } = setup();
    await application.applyFulfillmentDemand(command({ bagCount: 2 }));
    const created = [...memory.inspect().orders.values()][0]!;
    const intake = await application.recordOrderIntake({
      locationId: 'location-1',
      orderId: created.id,
      bagCount: 2,
      expectedVersion: created.version,
      idempotencyKey: 'operator-intake-before-manual-release',
      actorId: '00000000-0000-4000-8000-000000009001',
    });
    if (intake.tag === 'err') throw intake.error;

    await expect(
      application.changeProductionAdmission({
        locationId: 'location-1',
        orderId: created.id,
        target: 'released',
        expectedVersion: intake.value.version,
        idempotencyKey: 'manual-admission-release',
        actorId: '00000000-0000-4000-8000-000000009001',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { admissionOverride: 'released', status: 'eligible' },
    });

    await application.applyFulfillmentDemand(
      command({
        fulfillmentVersion: 3,
        observedAt: '2026-07-10T14:01:00.000Z',
        projectionHash: 'b'.repeat(64),
        bagCount: 2,
        idempotencyKey: 'lagging-unreleased-source-update',
      }),
    );
    expect([...memory.inspect().orders.values()]).toMatchObject([
      {
        status: 'eligible',
        admissionOverride: 'released',
        bagCount: 2,
      },
    ]);

    await application.applyFulfillmentDemand(
      command({
        fulfillmentVersion: 4,
        observedAt: '2026-07-10T14:02:00.000Z',
        projectionHash: 'c'.repeat(64),
        admissionState: 'withdrawn',
        bagCount: 2,
        idempotencyKey: 'source-withdrawal',
      }),
    );
    expect([...memory.inspect().orders.values()]).toMatchObject([
      {
        status: 'ineligible',
        admissionOverride: null,
      },
    ]);
  });

  it('keeps commercial completion separate from unfinished floor work', async () => {
    const { application, memory } = setup();
    const applied = await application.applyFulfillmentDemand(
      command({ admissionState: 'released', bagCount: 2 }),
    );
    if (applied.tag === 'err' || applied.value.productionOrderId === null)
      throw new Error('Expected Production work.');
    const order = memory.inspect().orders.get(applied.value.productionOrderId);
    if (order === undefined) throw new Error('Expected Production order.');
    const intake = await application.recordOrderIntake({
      locationId: 'location-1',
      orderId: order.id,
      bagCount: 2,
      expectedVersion: order.version,
      idempotencyKey: 'operator-intake-before-commercial-completion',
      actorId: '00000000-0000-4000-8000-000000009001',
    });
    if (intake.tag === 'err') throw intake.error;
    await application.applyFulfillmentDemand(
      command({
        fulfillmentVersion: 3,
        projectionHash: 'd'.repeat(64),
        observedAt: '2026-07-10T14:02:00.000Z',
        admissionState: 'released',
        commercialState: 'completed',
        bagCount: 2,
        idempotencyKey: 'commercial-completion',
      }),
    );

    expect([...memory.inspect().orders.values()]).toMatchObject([
      { status: 'eligible', finishedAt: null },
    ]);
    expect([...memory.inspect().demands.values()]).toMatchObject([
      { commercialState: 'completed', admissionState: 'released' },
    ]);
  });

  it('retains newer source truth without reopening resolved Production work', async () => {
    const { application, memory } = setup();
    await application.applyFulfillmentDemand(command());
    const created = [...memory.inspect().orders.values()][0]!;

    await expect(
      application.changeProductionOrderResolution({
        locationId: 'location-1',
        orderId: created.id,
        action: 'resolve_without_production',
        reason: 'processor_not_in_use',
        note: null,
        confirmReviewedFacts: false,
        expectedVersion: created.version,
        idempotencyKey: 'resolve-before-source-update',
        actorId: '00000000-0000-4000-8000-000000009001',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { resolutionState: 'resolved_without_production' },
    });
    const resolved = memory.inspect().orders.get(created.id)!;

    await expect(
      application.applyFulfillmentDemand(
        command({
          fulfillmentVersion: 3,
          observedAt: '2026-07-10T14:01:00.000Z',
          projectionHash: 'b'.repeat(64),
          admissionState: 'released',
          commercialState: 'completed',
          bagCount: 2,
          idempotencyKey: 'newer-source-after-resolution',
        }),
      ),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { outcome: 'applied' },
    });

    expect(memory.inspect().orders.get(created.id)).toEqual(resolved);
    expect([...memory.inspect().demands.values()]).toMatchObject([
      {
        fulfillmentVersion: 3,
        admissionState: 'released',
        commercialState: 'completed',
        productionResolutionState: 'resolved_without_production',
      },
    ]);
  });
});
