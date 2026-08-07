import { describe, expect, it } from 'vitest';
import { toRevokeIdentitySessionsResult } from '../../../../src/features/sessions/revoke-identity-sessions/revoke-identity-sessions.contract.mapper.ts';

describe('revoke identity sessions response mapping', () => {
  it('maps revocation counts explicitly', () => {
    expect(toRevokeIdentitySessionsResult({ revokedCount: 2 })).toEqual({
      revokedCount: 2,
    });
  });
});
