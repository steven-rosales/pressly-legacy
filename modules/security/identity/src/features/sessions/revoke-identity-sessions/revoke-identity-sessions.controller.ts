import {
  defineValidatedController,
  sendValidatedApiValue,
} from '@pressly/http/express';
import type { Response } from 'express';
import {
  revokeIdentitySessionsContract,
  toRevokeIdentitySessionsResult,
} from './revoke-identity-sessions.contract.mapper.ts';
import type { RevokeIdentitySessions } from './revoke-identity-sessions.usecase.ts';

export type ReadPrincipalIdentityId = (response: Response) => string;

const requestMetadata = (response: Response) => {
  const requestId = response.locals?.['requestId'] as string | undefined;
  return requestId === undefined ? {} : { requestId };
};

export const makeRevokeAllIdentitySessionsController = (input: {
  revokeIdentitySessions: RevokeIdentitySessions;
  readPrincipalIdentityId: ReadPrincipalIdentityId;
}) =>
  defineValidatedController({
    request: { params: revokeIdentitySessionsContract.allParams },
    handle: async ({ params }, { response }) => {
      const revoked = await input.revokeIdentitySessions({
        principalIdentityId: input.readPrincipalIdentityId(response),
        identityId: params.identityId,
        ...requestMetadata(response),
      });

      sendValidatedApiValue(response, revoked, {
        schema: revokeIdentitySessionsContract.response,
        present: toRevokeIdentitySessionsResult,
      });
    },
  });

export const makeRevokeIdentitySessionController = (input: {
  revokeIdentitySessions: RevokeIdentitySessions;
  readPrincipalIdentityId: ReadPrincipalIdentityId;
}) =>
  defineValidatedController({
    request: { params: revokeIdentitySessionsContract.oneParams },
    handle: async ({ params }, { response }) => {
      const revoked = await input.revokeIdentitySessions({
        principalIdentityId: input.readPrincipalIdentityId(response),
        identityId: params.identityId,
        sessionId: params.sessionId,
        ...requestMetadata(response),
      });

      sendValidatedApiValue(response, revoked, {
        schema: revokeIdentitySessionsContract.response,
        present: toRevokeIdentitySessionsResult,
      });
    },
  });
