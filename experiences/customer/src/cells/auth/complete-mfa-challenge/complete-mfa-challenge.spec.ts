import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  customerCompleteMfaChallengeCellDeclaration,
  makeCustomerCompleteMfaChallengeCell,
} from './cell.ts';
import { customerCompleteMfaChallengeContract } from './contract.ts';

const subject = (execute: ReturnType<typeof vi.fn>, revoke = vi.fn()) =>
  makeCustomerCompleteMfaChallengeCell({
    completeMfaChallenge: { execute } as never,
    revokeSession: { execute: revoke } as never,
  });

proveOperation({
  operationId: 'customer.complete-mfa-challenge.v1',
  declaration: customerCompleteMfaChallengeCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'owns the challenge contract and projects the authenticated principal',
      proves: ['contract', 'protocol', 'executor-success'],
      run: async () => {
        const input = {
          challengeToken: 'x'.repeat(32),
          method: 'totp' as const,
          code: '123456',
          requestId: 'request-1',
        };
        expect(
          customerCompleteMfaChallengeContract.input.decode(input).kind,
        ).toBe('valid');
        expect(customerCompleteMfaChallengeCellDeclaration).toMatchObject({
          id: 'customer.complete-mfa-challenge.v1',
          surfaces: [
            { kind: 'http', method: 'POST', path: '/auth/mfa/challenge' },
          ],
        });
        const execute = vi.fn().mockResolvedValue({
          kind: 'success',
          value: {
            accessToken: 'a'.repeat(32),
            expiresAt: new Date('2026-08-23T16:00:00.000Z'),
            principal: {
              identityId: '10000000-0000-4000-8000-000000000001',
              kind: 'human',
              audience: 'customer',
              customerId: '20000000-0000-4000-8000-000000000001',
              displayName: 'Ada Customer',
              email: 'ada@example.com',
              roles: [],
            },
          },
        });

        await expect(subject(execute).execute(input)).resolves.toMatchObject({
          kind: 'success',
          value: {
            principal: {
              audience: 'customer',
              customerId: '20000000-0000-4000-8000-000000000001',
            },
          },
        });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
  ],
});

proveOperation({
  operationId: 'customer.complete-mfa-challenge.v1',
  declaration: customerCompleteMfaChallengeCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'preserves invalid_mfa_challenge without projecting a principal',
      proves: ['contract', 'executor-success'],
      run: async () => {
        const input = {
          challengeToken: 'x'.repeat(32),
          method: 'totp' as const,
          code: '123456',
        };
        const failure = {
          kind: 'authentication' as const,
          code: 'invalid_mfa_challenge' as const,
          message: 'The MFA challenge is invalid.',
        };
        expect(
          customerCompleteMfaChallengeContract.failure.decode(failure),
        ).toEqual({ kind: 'valid', value: failure });
        const execute = vi.fn().mockResolvedValue({ kind: 'failure', failure });

        await expect(subject(execute).execute(input)).resolves.toEqual({
          kind: 'failure',
          failure,
        });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
    {
      name: 'preserves expired_mfa_challenge without projecting a principal',
      proves: ['executor-success'],
      run: async () => {
        const input = {
          challengeToken: 'x'.repeat(32),
          method: 'totp' as const,
          code: '123456',
        };
        const failure = {
          kind: 'authentication' as const,
          code: 'expired_mfa_challenge' as const,
          message: 'The MFA challenge expired.',
        };
        const execute = vi.fn().mockResolvedValue({ kind: 'failure', failure });

        await expect(subject(execute).execute(input)).resolves.toEqual({
          kind: 'failure',
          failure,
        });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
    {
      name: 'preserves invalid_mfa_code without projecting a principal',
      proves: ['executor-success'],
      run: async () => {
        const input = {
          challengeToken: 'x'.repeat(32),
          method: 'totp' as const,
          code: '123456',
        };
        const failure = {
          kind: 'authentication' as const,
          code: 'invalid_mfa_code' as const,
          message: 'The MFA code is invalid.',
        };
        const execute = vi.fn().mockResolvedValue({ kind: 'failure', failure });

        await expect(subject(execute).execute(input)).resolves.toEqual({
          kind: 'failure',
          failure,
        });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
    {
      name: 'rejects a completed non-Customer challenge and revokes its session',
      proves: ['executor-success'],
      run: async () => {
        const input = {
          challengeToken: 'x'.repeat(32),
          method: 'totp' as const,
          code: '123456',
          requestId: 'request-2',
        };
        const execute = vi.fn().mockResolvedValue({
          kind: 'success',
          value: {
            accessToken: 'a'.repeat(32),
            expiresAt: new Date('2026-08-23T16:00:00.000Z'),
            principal: {
              identityId: '30000000-0000-4000-8000-000000000001',
              kind: 'human',
              displayName: 'Workforce Owner',
              roles: ['owner'],
            },
          },
        });
        const revoke = vi.fn().mockResolvedValue({
          kind: 'success',
          value: { revoked: true },
        });

        await expect(subject(execute, revoke).execute(input)).resolves.toEqual({
          kind: 'failure',
          failure: {
            kind: 'authentication',
            code: 'invalid_mfa_challenge',
            message: 'The MFA challenge is invalid. Sign in again.',
          },
        });
        expect(revoke).toHaveBeenCalledWith({
          bearerToken: 'a'.repeat(32),
          requestId: 'request-2',
        });
      },
    },
  ],
});
