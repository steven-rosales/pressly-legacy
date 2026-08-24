import { describe, expect, it, vi } from 'vitest';
import {
  controlBrowserOperationBindings,
  makeControlBrowserClients,
} from '@pressly/generated-runtime/browser/control';
import source from '../../../../generated/runtime/src/browser/control.ts?raw';
import { makeControlHttpClient } from '../src/runtime/control-http-client.ts';

describe('Control generated browser-client composition', () => {
  it('binds exactly 38 generated operations without handwritten routes', () => {
    const operationIds = [
      ...source.matchAll(/operations\[["'](control\.[^"']+\.v1)["']\]/g),
    ].map((match) => match[1]);

    expect(operationIds).toHaveLength(38);
    expect(new Set(operationIds).size).toBe(38);
    expect(source).not.toMatch(/['"`]\/control\//);
    for (const forbiddenDirectFactory of [
      'makeControlAuthenticationApi',
      'makeControlTeamApi',
      'makeControlSecurityApi',
      'makeControlInvitationApi',
      'makeControlCustomerApi',
      'makeControlOrderApi',
    ])
      expect(source).not.toContain(forbiddenDirectFactory);
  });

  it('composes the unchanged six UI ports with Security MFA delegation', () => {
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
