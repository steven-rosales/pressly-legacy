import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { customerLoginCellDeclaration, makeCustomerLoginCell } from './cell.ts';
import { customerLoginContract } from './contract.ts';

const customerPrincipal = {
  identityId: '10000000-0000-4000-8000-000000000001',
  kind: 'human' as const,
  audience: 'customer' as const,
  customerId: '20000000-0000-4000-8000-000000000001',
  displayName: 'Ada Customer',
  email: 'ada@example.com',
  roles: [],
};

const subject = (execute: ReturnType<typeof vi.fn>, revoke = vi.fn()) =>
  makeCustomerLoginCell({
    login: { execute } as never,
    revokeSession: { execute: revoke } as never,
  });

proveOperation({
  operationId: 'customer.auth-login.v1',
  declaration: customerLoginCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'owns its strict contract, public route, and Access login mapping',
      proves: ['contract', 'protocol', 'executor-success'],
      run: async () => {
        const input = {
          email: 'customer@example.com',
          password: 'correct horse battery staple',
          ipAddress: '203.0.113.10',
          requestId: 'request-1',
        };
        expect(customerLoginContract.input.decode(input)).toEqual({
          kind: 'valid',
          value: input,
        });
        expect(customerLoginCellDeclaration).toMatchObject({
          id: 'customer.auth-login.v1',
          kind: 'command',
          authentication: 'none',
          surfaces: [{ kind: 'http', method: 'POST', path: '/auth/login' }],
        });
        const execute = vi.fn().mockResolvedValue({
          kind: 'success',
          value: {
            status: 'mfa_required',
            challengeToken: 'x'.repeat(32),
            expiresAt: new Date('2026-08-23T16:00:00.000Z'),
            principal: customerPrincipal,
          },
        });

        await expect(subject(execute).execute(input)).resolves.toMatchObject({
          kind: 'success',
          value: {
            status: 'mfa_required',
            challengeToken: 'x'.repeat(32),
            principal: {
              audience: 'customer',
              customerId: customerPrincipal.customerId,
            },
          },
        });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
  ],
});

proveOperation({
  operationId: 'customer.auth-login.v1',
  declaration: customerLoginCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'preserves invalid_credentials as typed Access rejection data',
      proves: ['executor-success'],
      run: async () => {
        const input = {
          email: 'customer@example.com',
          password: 'wrong password',
        };
        const failure = {
          kind: 'authentication' as const,
          code: 'invalid_credentials' as const,
          message: 'Invalid email or password.',
        };
        expect(customerLoginContract.failure.decode(failure)).toEqual({
          kind: 'valid',
          value: failure,
        });
        const execute = vi.fn().mockResolvedValue({ kind: 'failure', failure });

        await expect(subject(execute).execute(input)).resolves.toEqual({
          kind: 'failure',
          failure,
        });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
    {
      name: 'preserves login_rate_limited as typed Access rejection data',
      proves: ['executor-success'],
      run: async () => {
        const input = {
          email: 'customer@example.com',
          password: 'correct horse battery staple',
        };
        const failure = {
          kind: 'rate_limit' as const,
          code: 'login_rate_limited' as const,
          message: 'Too many sign-in attempts.',
        };
        expect(customerLoginContract.failure.decode(failure)).toEqual({
          kind: 'valid',
          value: failure,
        });
        const execute = vi.fn().mockResolvedValue({ kind: 'failure', failure });

        await expect(subject(execute).execute(input)).resolves.toEqual({
          kind: 'failure',
          failure,
        });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
    {
      name: 'rejects a non-Customer identity and revokes its created session',
      proves: ['executor-success'],
      run: async () => {
        const input = {
          email: 'owner@example.com',
          password: 'correct horse battery staple',
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
            code: 'invalid_credentials',
            message: 'Invalid email or password.',
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
