import { describe, expect, it, vi } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { loadWorkspaceCellDeclaration, makeLoadWorkspaceCell } from './cell.ts';
import { loadWorkspaceContract } from './contract.ts';
import type { LoadWorkspaceRepository } from './execute.ts';
import type { WorkspaceScheduler } from './types.ts';

const scheduler: WorkspaceScheduler = {
  forecastDemand: () => ({
    algorithmVersion: 'fixed-pulse-demand-outlook-v1',
    startsAt: '2026-08-21T16:00:00.000Z',
    completesAt: '2026-08-21T16:00:00.000Z',
    pulseMinutes: 60,
    pulseCapacityLbs: 0,
    batchCount: 0,
    makespanMinutes: 0,
    batches: [],
    unplacedDemandIds: [],
  }),
  proposeOnlinePlacement: () => ({
    kind: 'rejected',
    algorithmVersion: 'online-stable-insertion-v1',
    inputSnapshotHash: 'a'.repeat(64),
    reason: { code: 'NO_MUTABLE_POSITION', message: 'No placement.' },
  }),
};

describe('production.load-workspace.v1 cell', () => {
  it('declares the exact authenticated headless capability', () => {
    expect(loadWorkspaceCellDeclaration).toMatchObject({
      id: 'production.load-workspace.v1',
      kind: 'query',
      authentication: 'required',
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: { transaction: 'required', concurrency: 'none' },
      idempotency: { required: false },
      surfaces: [],
      emits: [],
      consumes: [],
      retry: null,
      timeoutMs: null,
      observability: { operation: 'production.load_workspace' },
    });
    expect(loadWorkspaceCellDeclaration.contract).toBe(loadWorkspaceContract);
    expect(
      loadWorkspaceCellDeclaration.authorization?.timing === 'after-input'
        ? loadWorkspaceCellDeclaration.authorization.scope({
            locationId: 'location-1',
          })
        : null,
    ).toBe('location-1');
  });

  it('binds repository, clock, canonical rules, and scheduler only', async () => {
    const load = vi.fn<LoadWorkspaceRepository['load']>(async () => null);
    const cell = makeLoadWorkspaceCell({
      repo: { load },
      clock: { now: () => new Date('2026-08-21T16:00:00.000Z') },
      policy: productionRules,
      scheduler,
    });
    await expect(
      cell.execute({ locationId: 'location-1' }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_location_not_found' },
    });
    expect(load).toHaveBeenCalledOnce();
  });
});
