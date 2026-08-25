import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, it, vi } from 'vitest';
import { listWorkforceSecurityEventsCellDeclaration } from './cell.ts';
import { makeListWorkforceSecurityEvents } from './list-workforce-security-events.usecase.ts';
import { makeWorkforceSecurityStoreFake } from '../../../../testing/workforce-security-store.spec-support.ts';

proveOperation({
  operationId: 'access.list-workforce-security-events.v1',
  declaration: listWorkforceSecurityEventsCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'returns only the redacted audit projection',
      proves: ['contract', 'executor-success'],
      run: async () => {
        const input = {
          actor: {
            identityId: '00000000-0000-4000-8000-000000000001',
            sessionId: '00000000-0000-4000-8000-000000000002',
          },
          businessId: '00000000-0000-4000-8000-000000000100',
          limit: 25,
        };
        expect(
          listWorkforceSecurityEventsCellDeclaration.contract.input.decode(
            input,
          ).kind,
        ).toBe('valid');
        const usecase = makeListWorkforceSecurityEvents({
          store: makeWorkforceSecurityStoreFake(),
          clock: { now: () => new Date('2026-08-01T16:00:00.000Z') },
        });

        const actual = await usecase(input);

        expect(actual).toMatchObject({
          tag: 'ok',
          value: {
            events: [
              {
                id: '00000000-0000-4000-8000-000000000201',
                createdAt: '2026-08-01T15:00:00.000Z',
              },
            ],
            nextCursor: null,
          },
        });
        expect(JSON.stringify(actual)).not.toMatch(
          /metadata|resourceId|ipAddress/,
        );
      },
    },
  ],
});

it('returns validation without reading workforce security events', async () => {
  const store = {
    ...makeWorkforceSecurityStoreFake(),
    listSecurityEvents: vi.fn(),
  };
  const usecase = makeListWorkforceSecurityEvents({
    store,
    clock: { now: () => new Date('2026-08-01T16:00:00.000Z') },
  });

  await expect(
    usecase({
      actor: { identityId: 'owner-id', sessionId: 'session-id' },
      businessId: ' ',
    }),
  ).resolves.toMatchObject({
    tag: 'err',
    error: { kind: 'validation' },
  });
  expect(store.listSecurityEvents).not.toHaveBeenCalled();
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
])('returns a typed $name security-event rejection', async (testCase) => {
  const store = {
    ...makeWorkforceSecurityStoreFake(),
    listSecurityEvents: vi.fn(async () => ({
      status: 'rejected' as const,
      reason: testCase.reason,
    })),
  };
  const usecase = makeListWorkforceSecurityEvents({
    store,
    clock: { now: () => new Date('2026-08-01T16:00:00.000Z') },
  });

  await expect(
    usecase({
      actor: { identityId: 'owner-id', sessionId: 'session-id' },
      businessId: 'business-id',
    }),
  ).resolves.toMatchObject({
    tag: 'err',
    error: { kind: testCase.expectedKind },
  });
  expect(store.listSecurityEvents).toHaveBeenCalledOnce();
});
