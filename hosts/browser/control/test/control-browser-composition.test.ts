import { describe, expect, it, vi } from 'vitest';
import {
  controlBrowserOperationBindings,
  makeControlBrowserClients,
} from '@pressly/topology/browser';
import { makeControlHttpClient } from '../src/runtime/control-http-client.ts';

describe('Control browser topology composition', () => {
  it('binds exactly 38 explicit operations', () => {
    const operationIds = Object.values(controlBrowserOperationBindings).flatMap(
      (group) => Object.values(group).map((operation) => operation.operationId),
    );

    expect(operationIds).toHaveLength(38);
    expect(new Set(operationIds).size).toBe(38);
  });

  it('composes the six UI ports with Security MFA delegation', () => {
    const clients = makeControlBrowserClients({
      client: makeControlHttpClient({
        fetchImplementation: vi.fn(),
        apiBaseUrl: '/api',
      }),
      idempotencyKey: () => 'test-key',
      operations: controlBrowserOperationBindings,
    });

    expect(Object.keys(clients).sort()).toEqual([
      'authentication',
      'customers',
      'invitations',
      'orders',
      'security',
      'team',
    ]);
    expect(clients.security.beginMfaEnrollment).toBe(
      clients.authentication.beginMfaEnrollment,
    );
    expect(clients.security.confirmMfaEnrollment).toBe(
      clients.authentication.confirmMfaEnrollment,
    );
    expect(clients.security.regenerateRecoveryCodes).toBe(
      clients.authentication.regenerateRecoveryCodes,
    );
    expect(clients.security.removeMfa).toBe(clients.authentication.removeMfa);
  });
});
