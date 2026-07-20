import { describe, expect, it } from 'vitest';
import { makeProductionApplication } from '../../src/main.ts';
import { makeMemoryProductionRepositories } from '../support/memory-production-repositories.ts';
import {
  allowPolicy,
  makeClock,
  makeIds,
  simpleScheduler,
} from '../support/production.fake.ts';

const command = (overrides: Record<string, unknown> = {}) => ({
  demandKey: 'source:order:1001',
  displayReference: '1001',
  locationId: 'location-1',
  revisionAt: '2026-07-10T13:59:00.000Z',
  revisionHash: 'a'.repeat(64),
  phase: 'expected' as const,
  sourceStatusCode: 'SUBMITTED',
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
      policy: allowPolicy,
      scheduler: simpleScheduler,
      clock: makeClock('2026-07-10T14:00:00.000Z').clock,
      ids,
    }),
  };
};

describe('source-neutral order demand', () => {
  it('creates a release-pending production order without source concepts', async () => {
    const { application, memory } = setup();
    await expect(
      application.applyOrderDemand(command()),
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
      application.applyOrderDemand(
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
        sourceStatusCode: 'SUBMITTED',
        estimatedWeightLbs: null,
        estimatedWeightSource: null,
        productionOrderId: null,
      },
    ]);
  });

  it('admits a previously unweighed demand when a newer estimate arrives', async () => {
    const { application, memory } = setup();
    await application.applyOrderDemand(
      command({
        estimatedWeightLbs: null,
        estimatedWeightSource: null,
      }),
    );
    await expect(
      application.applyOrderDemand(
        command({
          revisionAt: '2026-07-10T14:01:00.000Z',
          revisionHash: 'b'.repeat(64),
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
    await application.applyOrderDemand(command());
    await expect(
      application.applyOrderDemand(command()),
    ).resolves.toMatchObject({ tag: 'ok', value: { replayed: true } });
    await expect(
      application.applyOrderDemand(
        command({ displayReference: 'changed-reference' }),
      ),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_idempotency_conflict' },
    });
  });

  it('ignores older revisions and accepts an equal identical revision unchanged', async () => {
    const { application } = setup();
    await application.applyOrderDemand(command());
    await expect(
      application.applyOrderDemand(
        command({
          revisionAt: '2026-07-10T13:58:00.000Z',
          revisionHash: 'b'.repeat(64),
          idempotencyKey: 'demand-command-older',
        }),
      ),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { outcome: 'ignored_older' },
    });
    await expect(
      application.applyOrderDemand(
        command({ idempotencyKey: 'demand-command-equal' }),
      ),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { outcome: 'unchanged' },
    });
  });

  it('rejects divergent data at the same source revision', async () => {
    const { application } = setup();
    await application.applyOrderDemand(command());
    await expect(
      application.applyOrderDemand(
        command({
          revisionHash: 'c'.repeat(64),
          idempotencyKey: 'demand-command-diverged',
        }),
      ),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'order_demand_revision_diverged' },
    });
  });

  it('fails closed for an unavailable production location', async () => {
    const { application } = setup();
    await expect(
      application.applyOrderDemand(
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

  it('admits released demand with physical intake without automatic run placement', async () => {
    const { application, memory } = setup();
    const eligible = command({
      phase: 'production_released',
      sourceStatusCode: 'IN_PROGRESS',
      bagCount: 2,
      idempotencyKey: 'eligible-demand-command',
    });

    await expect(application.applyOrderDemand(eligible)).resolves.toMatchObject(
      {
        tag: 'ok',
        value: { outcome: 'applied', replayed: false },
      },
    );
    expect([...memory.inspect().orders.values()]).toMatchObject([
      { status: 'eligible', bagCount: 2 },
    ]);
  });
});
