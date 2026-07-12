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
  state: 'ready_for_production' as const,
  dueAt: '2026-07-10T20:00:00.000Z',
  estimatedWeightLbs: 74,
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
  it('creates an intake-pending production order without source concepts', async () => {
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
        status: 'intake_pending',
        derivedWeightLbs: 74,
        bagCount: null,
      },
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
});
