import * as result from '@pressly/cells/result';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { issueWorkforceInvitationCellDeclaration } from './cell.ts';
import { makeIssueWorkforceInvitation } from './issue-workforce-invitation.usecase.ts';
import {
  makeInvitationTokenServiceFake,
  makeWorkforceInvitationStoreFake,
  workforceActor,
  workforceInvitation,
  workforceInvitationNow,
} from '../../../../testing/workforce-invitation-store.spec-support.ts';

const captureError = (action: () => unknown): unknown => {
  try {
    action();
    return null;
  } catch (error) {
    return error;
  }
};

describe('issue workforce invitation', () => {
  it('rejects invalid invitation TTL configuration', () => {
    expect(
      captureError(() =>
        makeIssueWorkforceInvitation({
          store: makeWorkforceInvitationStoreFake(),
          tokenService: makeInvitationTokenServiceFake(),
          clock: { now: () => workforceInvitationNow },
          invitationTtlMinutes: 0,
        }),
      ),
    ).toMatchObject({
      tag: 'AppError',
      kind: 'ConfigError',
      code: 'workforce_invitation_ttl_invalid',
      status: 500,
    });
  });

  proveOperation({
    operationId: 'access.issue-workforce-invitation.v1',
    declaration: issueWorkforceInvitationCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'normalizes email stores only the keyed hash and returns the token once',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = {
            actor: workforceActor,
            businessId: 'business-id',
            email: ' Operator@Example.COM ',
            displayName: ' Operator One ',
            intendedRole: 'operator' as const,
            intendedLocationId: 'location-id',
            idempotencyKey: 'issue-1',
          };
          expect(
            issueWorkforceInvitationCellDeclaration.contract.input.decode(input)
              .kind,
          ).toBe('valid');
          const store = makeWorkforceInvitationStoreFake();
          const issue = makeIssueWorkforceInvitation({
            store,
            tokenService: makeInvitationTokenServiceFake(),
            clock: { now: () => workforceInvitationNow },
            invitationTtlMinutes: 60,
          });

          const response = await issue(input);

          expect(response).toEqual(
            result.ok({
              status: 'issued',
              invitation: workforceInvitation,
              token: 'raw-invitation-token',
            }),
          );
          expect(store.issue).toHaveBeenCalledWith(
            expect.objectContaining({
              emailNormalized: 'operator@example.com',
              displayName: 'Operator One',
              tokenHash: 'hashed:raw-invitation-token',
            }),
          );
          expect(
            JSON.stringify(vi.mocked(store.issue).mock.calls),
          ).not.toContain('"token":"raw-invitation-token"');
        },
      },
    ],
  });

  it('does not disclose a newly generated token on idempotent replay', async () => {
    const store = makeWorkforceInvitationStoreFake({
      issue: vi.fn(async () => ({
        status: 'replayed' as const,
        value: workforceInvitation,
      })),
    });
    const issue = makeIssueWorkforceInvitation({
      store,
      tokenService: makeInvitationTokenServiceFake(),
      clock: { now: () => workforceInvitationNow },
      invitationTtlMinutes: 60,
    });
    const response = await issue({
      actor: workforceActor,
      businessId: 'business-id',
      email: workforceInvitation.emailNormalized,
      displayName: workforceInvitation.displayName,
      intendedRole: 'operator',
      intendedLocationId: 'location-id',
      idempotencyKey: 'issue-1',
    });

    expect(response).toEqual(
      result.ok({ status: 'replayed', invitation: workforceInvitation }),
    );
    expect(JSON.stringify(response)).not.toContain('raw-invitation-token');
  });

  it('returns validation without touching the invitation store', async () => {
    const store = makeWorkforceInvitationStoreFake();
    const issue = makeIssueWorkforceInvitation({
      store,
      tokenService: makeInvitationTokenServiceFake(),
      clock: { now: () => workforceInvitationNow },
      invitationTtlMinutes: 60,
    });

    const response = await issue({
      actor: workforceActor,
      businessId: ' ',
      email: workforceInvitation.emailNormalized,
      displayName: workforceInvitation.displayName,
      intendedRole: 'operator',
      intendedLocationId: 'location-id',
      idempotencyKey: 'issue-invalid',
    });

    expect(response).toMatchObject({
      tag: 'err',
      error: { kind: 'validation' },
    });
    expect(store.issue).not.toHaveBeenCalled();
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
  ])('returns a typed $name store rejection', async (testCase) => {
    const store = makeWorkforceInvitationStoreFake({
      issue: vi.fn(async () => ({
        status: 'rejected' as const,
        reason: testCase.reason,
      })),
    });
    const issue = makeIssueWorkforceInvitation({
      store,
      tokenService: makeInvitationTokenServiceFake(),
      clock: { now: () => workforceInvitationNow },
      invitationTtlMinutes: 60,
    });

    const response = await issue({
      actor: workforceActor,
      businessId: 'business-id',
      email: workforceInvitation.emailNormalized,
      displayName: workforceInvitation.displayName,
      intendedRole: 'operator',
      intendedLocationId: 'location-id',
      idempotencyKey: `issue-${testCase.name}`,
    });

    expect(response).toMatchObject({
      tag: 'err',
      error: { kind: testCase.expectedKind },
    });
    expect(store.issue).toHaveBeenCalledOnce();
  });
});
