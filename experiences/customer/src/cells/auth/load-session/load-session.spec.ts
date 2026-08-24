import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  customerLoadSessionCellDeclaration,
  makeCustomerLoadSessionCell,
} from './cell.ts';
import { customerLoadSessionContract } from './contract.ts';

proveOperation({
  operationId: 'customer.load-auth-session.v1',
  declaration: customerLoadSessionCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'projects explicit Customer audience and expiry from the Access session',
      proves: ['contract', 'protocol', 'executor-success'],
      run: async () => {
        const input = { bearerToken: 'bearer-token' };
        expect(customerLoadSessionContract.input.decode(input).kind).toBe(
          'valid',
        );
        expect(customerLoadSessionCellDeclaration).toMatchObject({
          id: 'customer.load-auth-session.v1',
          kind: 'query',
          surfaces: [{ kind: 'http', method: 'GET', path: '/auth/session' }],
        });
        const expiresAt = new Date('2026-08-23T16:00:00.000Z');
        const execute = vi.fn().mockResolvedValue({
          kind: 'success',
          value: {
            principal: {
              identityId: '10000000-0000-4000-8000-000000000001',
              kind: 'human',
              audience: 'customer',
              customerId: '20000000-0000-4000-8000-000000000001',
              displayName: 'Ada Customer',
              email: 'ada@example.com',
              sessionExpiresAt: expiresAt,
            },
            principalAttributes: { assignments: [] },
          },
        });

        await expect(
          makeCustomerLoadSessionCell({ execute } as never).execute(input),
        ).resolves.toEqual({
          kind: 'success',
          value: {
            principal: {
              identityId: '10000000-0000-4000-8000-000000000001',
              customerId: '20000000-0000-4000-8000-000000000001',
              audience: 'customer',
              displayName: 'Ada Customer',
              email: 'ada@example.com',
            },
            expiresAt,
          },
        });
      },
    },
    {
      name: 'rejects a valid Access session outside the Customer audience',
      proves: ['executor-success'],
      run: async () => {
        const input = { bearerToken: 'workforce-bearer-token' };
        const execute = vi.fn().mockResolvedValue({
          kind: 'success',
          value: {
            principal: {
              identityId: '30000000-0000-4000-8000-000000000001',
              kind: 'human',
              displayName: 'Workforce Owner',
              sessionExpiresAt: new Date('2026-08-23T16:00:00.000Z'),
            },
            principalAttributes: { assignments: [] },
          },
        });

        await expect(
          makeCustomerLoadSessionCell({ execute } as never).execute(input),
        ).resolves.toEqual({
          kind: 'failure',
          failure: {
            kind: 'authentication',
            code: 'invalid_session',
            message: 'Authentication is required.',
          },
        });
      },
    },
  ],
});

proveOperation({
  operationId: 'customer.load-auth-session.v1',
  declaration: customerLoadSessionCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'preserves invalid_session without projecting browser session state',
      proves: ['contract', 'executor-success'],
      run: async () => {
        const input = { bearerToken: 'bearer-token' };
        const failure = {
          kind: 'authentication' as const,
          code: 'invalid_session' as const,
          message: 'The session is invalid.',
        };
        expect(customerLoadSessionContract.failure.decode(failure)).toEqual({
          kind: 'valid',
          value: failure,
        });
        const execute = vi.fn().mockResolvedValue({ kind: 'failure', failure });

        await expect(
          makeCustomerLoadSessionCell({ execute } as never).execute(input),
        ).resolves.toEqual({ kind: 'failure', failure });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
    {
      name: 'preserves session_expired without projecting browser session state',
      proves: ['executor-success'],
      run: async () => {
        const input = { bearerToken: 'bearer-token' };
        const failure = {
          kind: 'authentication' as const,
          code: 'session_expired' as const,
          message: 'The session expired.',
        };
        const execute = vi.fn().mockResolvedValue({ kind: 'failure', failure });

        await expect(
          makeCustomerLoadSessionCell({ execute } as never).execute(input),
        ).resolves.toEqual({ kind: 'failure', failure });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
  ],
});
