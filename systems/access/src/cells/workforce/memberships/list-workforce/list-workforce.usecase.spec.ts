import * as result from '@pressly/cells/result';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, it, vi } from 'vitest';
import { listWorkforceCellDeclaration } from './cell.ts';
import { makeListWorkforce } from './list-workforce.usecase.ts';

const now = new Date('2026-08-22T19:30:00.000Z');
const actor = { identityId: 'owner-id', sessionId: 'owner-session' };
const page = { members: [], nextCursor: null };

proveOperation({
  operationId: 'access.list-workforce.v1',
  declaration: listWorkforceCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'normalizes the query and returns the owner-local workforce page',
      proves: ['contract', 'executor-success'],
      run: async () => {
        const input = {
          actor,
          businessId: 'business-id',
          states: ['active' as const],
          query: '  Operator  ',
          limit: 500,
        };
        expect(
          listWorkforceCellDeclaration.contract.input.decode(input).kind,
        ).toBe('valid');
        const list = vi.fn(async () => ({ status: 'found' as const, page }));
        const execute = makeListWorkforce({
          store: { list },
          clock: { now: () => now },
        });

        await expect(execute(input)).resolves.toEqual(result.ok(page));
        expect(list).toHaveBeenCalledWith({
          actor,
          businessId: 'business-id',
          states: ['active'],
          query: 'Operator',
          limit: 100,
          now,
        });
      },
    },
  ],
});

it('returns validation without executing the workforce query', async () => {
  const list = vi.fn();
  const execute = makeListWorkforce({
    store: { list },
    clock: { now: () => now },
  });

  await expect(execute({ actor, businessId: ' ' })).resolves.toMatchObject({
    tag: 'err',
    error: { kind: 'validation' },
  });
  expect(list).not.toHaveBeenCalled();
});

it.each([
  {
    name: 'authentication',
    reason: 'authentication_required' as const,
    expectedKind: 'authentication' as const,
  },
  {
    name: 'conflict',
    reason: 'idempotency_conflict' as const,
    expectedKind: 'conflict' as const,
  },
  {
    name: 'not found',
    reason: 'not_found' as const,
    expectedKind: 'not_found' as const,
  },
  {
    name: 'permission denial',
    reason: 'outside_business' as const,
    expectedKind: 'permission' as const,
  },
])('returns a typed $name list rejection', async (testCase) => {
  const list = vi.fn(async () => ({
    status: 'rejected' as const,
    reason: testCase.reason,
  }));
  const execute = makeListWorkforce({
    store: { list },
    clock: { now: () => now },
  });

  await expect(
    execute({ actor, businessId: 'business-id' }),
  ).resolves.toMatchObject({
    tag: 'err',
    error: { kind: testCase.expectedKind },
  });
  expect(list).toHaveBeenCalledOnce();
});
