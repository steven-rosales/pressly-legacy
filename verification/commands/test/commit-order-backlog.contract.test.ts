import { commitOrderBacklogCellDeclaration } from '@pressly/production-system/operations/demand/commit-order-backlog/cell';
import { commitOrderBacklogContract } from '@pressly/production-system/operations/demand/commit-order-backlog/contract';
import { describe, expect, it } from 'vitest';

const params = { locationId: 'location-1' };
const actorId = '10000000-0000-4000-8000-000000000001';
const body = {
  filter: 'all_due_before_cutoff',
  cutoff: '2026-08-01T00:00:00.000Z',
  reason: 'processor_not_in_use',
  cursor: null,
  maxOrders: 250,
  note: null,
  previewHash: 'a'.repeat(64),
  idempotencyKey: 'commit-order-backlog-1',
};

describe('commit order backlog public contract conformance', () => {
  it('decodes strict body before params and binds the authenticated actor', () => {
    expect(
      commitOrderBacklogContract.input.decode({ body, params, actorId }),
    ).toEqual({
      kind: 'valid',
      value: { locationId: 'location-1', actorId, ...body },
    });

    const invalid = commitOrderBacklogContract.input.decode({
      body: { filter: 'browser-owned-filter' },
      params: { locationId: '' },
      actorId: '',
    });
    expect(invalid).toMatchObject({ kind: 'invalid' });
    if (invalid.kind === 'invalid') {
      expect(invalid.issues[0]?.path[0]).toBe('body');
      expect(
        invalid.issues.findIndex((issue) => issue.path[0] === 'params'),
      ).toBeGreaterThan(0);
      expect(invalid.issues.at(-1)?.path).toEqual(['actorId']);
    }
  });

  it('declares the exact staged override HTTP boundary', () => {
    const surface = commitOrderBacklogCellDeclaration.surfaces[0];
    expect(commitOrderBacklogCellDeclaration).toMatchObject({
      id: 'production.commit-order-backlog.v1',
      authorization: {
        capability: 'production:override',
        timing: 'after-input',
      },
    });
    expect(surface).toMatchObject({
      kind: 'http',
      method: 'POST',
      path: '/production/locations/:locationId/order-backlog',
      authorization: 'staged',
      contextRequirements: ['authenticated-actor'],
    });
    expect(surface).toBeDefined();
    if (
      surface === undefined ||
      surface.kind !== 'http' ||
      surface.validateRequest === null
    )
      return;
    const validateRequest = surface.validateRequest;
    expect(() =>
      validateRequest({
        body: { filter: 'browser-owned-filter' },
        params: { locationId: '' },
        query: {},
        headers: {},
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'invalid_body_type',
        publicDetails: expect.objectContaining({ location: 'body' }),
      }),
    );
  });
});
