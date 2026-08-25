import * as result from '@pressly/cells/result';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import {
  makeWorkforceInvitationStoreFake,
  workforceActor,
  workforceInvitation,
  workforceInvitationNow,
} from '../../../../testing/workforce-invitation-store.spec-support.ts';
import { makeListWorkforceInvitations } from './list-workforce-invitations.usecase.ts';
import { listWorkforceInvitationsCellDeclaration } from './cell.ts';

describe('list workforce invitations', () => {
  proveOperation({
    operationId: 'access.list-workforce-invitations.v1',
    declaration: listWorkforceInvitationsCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'clamps pagination and preserves the invitation projection',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = {
            actor: workforceActor,
            businessId: 'business-id',
            includeTerminal: true,
            limit: 500,
          };
          expect(
            listWorkforceInvitationsCellDeclaration.contract.input.decode(input)
              .kind,
          ).toBe('valid');
          const store = makeWorkforceInvitationStoreFake();
          const list = makeListWorkforceInvitations({
            store,
            clock: { now: () => workforceInvitationNow },
          });

          const actual = await list(input);

          expect(actual).toEqual(
            result.ok({ invitations: [workforceInvitation], nextCursor: null }),
          );
          expect(store.list).toHaveBeenCalledWith({
            ...input,
            limit: 100,
            now: workforceInvitationNow,
          });
        },
      },
    ],
  });

  it('rejects malformed cursors before executing the query', async () => {
    const store = makeWorkforceInvitationStoreFake();
    const list = makeListWorkforceInvitations({
      store,
      clock: { now: () => workforceInvitationNow },
    });

    const actual = await list({
      actor: workforceActor,
      businessId: 'business-id',
      cursor: 'not-a-workforce-cursor',
    });

    expect(actual).toMatchObject({
      tag: 'err',
      error: { kind: 'validation', code: 'invalid_workforce_cursor' },
    });
    expect(store.list).not.toHaveBeenCalled();
  });

  it('preserves authorization rejection as typed expected data', async () => {
    const list = makeListWorkforceInvitations({
      store: makeWorkforceInvitationStoreFake({
        list: vi.fn(async () => ({
          status: 'rejected' as const,
          reason: 'outside_business' as const,
        })),
      }),
      clock: { now: () => workforceInvitationNow },
    });

    await expect(
      list({ actor: workforceActor, businessId: 'business-id' }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: 'permission', code: 'workforce_outside_business' },
    });
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
  ])('returns a typed $name query rejection', async (testCase) => {
    const store = makeWorkforceInvitationStoreFake({
      list: vi.fn(async () => ({
        status: 'rejected' as const,
        reason: testCase.reason,
      })),
    });
    const list = makeListWorkforceInvitations({
      store,
      clock: { now: () => workforceInvitationNow },
    });

    await expect(
      list({ actor: workforceActor, businessId: 'business-id' }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: testCase.expectedKind },
    });
    expect(store.list).toHaveBeenCalledOnce();
  });
});
