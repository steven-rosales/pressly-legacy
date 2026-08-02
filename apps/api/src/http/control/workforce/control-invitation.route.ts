import type { WorkforceApplication } from '@pressly/auth-module';
import {
  acceptWorkforceInvitationRequestSchema,
  controlExistingInvitationMfaRequestSchema,
  controlExistingInvitationPasswordRequestSchema,
  controlInvitationPreviewRequestSchema,
} from '@pressly/contracts';
import { invariantViolationError, validationError } from '@pressly/errors';
import { apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler, type Response } from 'express';
import {
  clearControlCookie,
  readControlCookie,
  setControlCookie,
  type ControlCookieNames,
} from '../session/control-cookie.adapter.ts';
import { controlUnauthorized } from '../session/control-session.error.ts';
import {
  controlBrowserSession,
  controlRequestId,
  controlRequestMetadata,
} from '../session/control-session.mapper.ts';
import {
  isControlResultError,
  type ControlAuthApplication,
  type ControlSessionOptions,
  type LoadedControlSession,
  type ResolveControlAccess,
} from '../session/control-session.port.ts';
import { controlInvitationPreview } from './control-workforce.mapper.ts';

const resultValue = <Value>(
  outcome:
    | Readonly<{ tag: 'ok'; value: Value }>
    | Readonly<{ tag: 'err'; error: unknown }>,
): Value => {
  if (outcome.tag === 'err') throw outcome.error;
  return outcome.value;
};

const existingActor = (response: Response) => {
  const auth = response.locals['auth'] as LoadedControlSession;
  if (auth.principal.sessionId === undefined)
    throw invariantViolationError({
      code: 'control_session_id_missing',
      message: 'Authenticated Control principal is missing a session ID.',
      safeMessage: 'Session could not be loaded.',
    });
  return {
    authenticatedIdentityId: auth.principal.identityId,
    authenticatedSessionId: auth.principal.sessionId,
  };
};

const acceptanceSummary = (accepted: {
  invitation: Readonly<{ id: string }>;
  membershipId: string;
  identityId: string;
  identityCreated: boolean;
  privilegedAccessEffective: boolean;
  replayed: boolean;
}) => ({
  invitationId: accepted.invitation.id,
  membershipId: accepted.membershipId,
  identityId: accepted.identityId,
  identityCreated: accepted.identityCreated,
  privilegedAccessEffective: accepted.privilegedAccessEffective,
  replayed: accepted.replayed,
});

export const makeControlInvitationAcceptanceRoutes = (input: {
  application: WorkforceApplication;
  authApplication: ControlAuthApplication;
  authenticateExisting: RequestHandler;
  limitExistingIdentity: RequestHandler;
  requireOrigin: RequestHandler;
  names: ControlCookieNames;
  sessionOptions: ControlSessionOptions;
  resolveAccess: ResolveControlAccess;
}): Router => {
  const routes = Router();

  const revokeBootstrapSession = async (
    response: Response,
    accessToken: string,
  ): Promise<void> => {
    await input.authApplication.revokeSession({
      bearerToken: accessToken,
      ...(controlRequestId(response) === undefined
        ? {}
        : { requestId: controlRequestId(response)! }),
    });
    clearControlCookie(response, input.names.session, input.sessionOptions);
  };

  const acceptAndEstablish = async (
    response: Response,
    command: {
      acceptanceToken: string;
      idempotencyKey: string;
      accessToken: string;
      expiresAt: string;
    },
  ) => {
    const loaded = await input.authApplication.loadSession({
      bearerToken: command.accessToken,
    });
    if (isControlResultError(loaded)) {
      await revokeBootstrapSession(response, command.accessToken);
      throw loaded.error;
    }
    if (loaded.value.principal.sessionId === undefined) {
      await revokeBootstrapSession(response, command.accessToken);
      throw invariantViolationError({
        code: 'invitation_bootstrap_session_id_missing',
        message: 'Invitation bootstrap session has no session identifier.',
        safeMessage: 'Invitation could not be accepted.',
      });
    }

    const accepted = await input.application.acceptInvitation({
      rawToken: command.acceptanceToken,
      idempotencyKey: command.idempotencyKey,
      acceptance: {
        kind: 'existing_identity',
        authenticatedIdentityId: loaded.value.principal.identityId,
        authenticatedSessionId: loaded.value.principal.sessionId,
      },
    });
    if (isControlResultError(accepted)) {
      await revokeBootstrapSession(response, command.accessToken);
      throw accepted.error;
    }

    const postAcceptanceAccess = await input.resolveAccess(loaded.value);
    const destination =
      accepted.value.invitation.intendedRole === 'operator'
        ? {
            id: 'processor' as const,
            label: 'Pressly Processor',
            description:
              'Run intake, scheduling, and laundry-floor production.',
            href: input.sessionOptions.processorOrigin,
          }
        : {
            id: 'control' as const,
            label: 'Pressly Control',
            description:
              'Manage people, customers, orders, and account security.',
            href: input.sessionOptions.origin,
          };
    if (postAcceptanceAccess === null) {
      await revokeBootstrapSession(response, command.accessToken);
      clearControlCookie(response, input.names.mfa, input.sessionOptions);
      return {
        status: 'accepted' as const,
        acceptance: acceptanceSummary(accepted.value),
        session: null,
        destination,
      };
    }

    setControlCookie(
      response,
      input.names.session,
      command.accessToken,
      command.expiresAt,
      input.sessionOptions,
    );
    const session = controlBrowserSession(
      loaded.value,
      postAcceptanceAccess,
      command.accessToken,
      input.sessionOptions,
    );
    clearControlCookie(response, input.names.mfa, input.sessionOptions);

    return {
      status: 'accepted' as const,
      acceptance: acceptanceSummary(accepted.value),
      session,
      destination,
    };
  };

  routes.post(
    '/preview',
    input.requireOrigin,
    validateRequest({ body: controlInvitationPreviewRequestSchema }),
    catchAsync(async (request, response) => {
      const preview = resultValue(
        await input.application.previewInvitation(request.body.acceptanceToken),
      );
      response.json(apiSuccess(controlInvitationPreview(preview)));
    }),
  );

  routes.post(
    '/accept/new',
    input.requireOrigin,
    validateRequest({ body: acceptWorkforceInvitationRequestSchema }),
    catchAsync(async (request, response) => {
      if (request.body.identityMode !== 'new_identity')
        throw validationError({
          code: 'invitation_identity_mode_invalid',
          message: 'New identity acceptance requires new_identity mode.',
          safeMessage: 'Choose the correct invitation acceptance option.',
          status: 422,
        });
      const accepted = resultValue(
        await input.application.acceptInvitation({
          rawToken: request.body.acceptanceToken,
          idempotencyKey: request.body.idempotencyKey,
          acceptance: {
            kind: 'new_identity',
            password: request.body.password,
          },
        }),
      );
      response.status(201).json(apiSuccess(acceptanceSummary(accepted)));
    }),
  );

  routes.post(
    '/accept/existing/password',
    input.requireOrigin,
    validateRequest({
      body: controlExistingInvitationPasswordRequestSchema,
    }),
    catchAsync(async (request, response) => {
      const preview = resultValue(
        await input.application.previewInvitation(request.body.acceptanceToken),
      );
      if (!preview.existingIdentity)
        throw validationError({
          code: 'invitation_existing_identity_required',
          message:
            'Credential bootstrap was requested for a new invitation identity.',
          safeMessage: 'Choose the new account option for this invitation.',
          status: 422,
        });

      const authenticated = await input.authApplication.login({
        email: preview.emailNormalized,
        password: request.body.password,
        ...controlRequestMetadata(request, response),
      });
      if (isControlResultError(authenticated)) throw authenticated.error;

      if ('challengeToken' in authenticated.value) {
        clearControlCookie(response, input.names.session, input.sessionOptions);
        setControlCookie(
          response,
          input.names.mfa,
          authenticated.value.challengeToken,
          authenticated.value.expiresAt,
          input.sessionOptions,
        );
        response.status(200).json(
          apiSuccess({
            status: 'mfa_required' as const,
            methods: ['totp', 'recovery'] as const,
          }),
        );
        return;
      }

      response.status(200).json(
        apiSuccess(
          await acceptAndEstablish(response, {
            acceptanceToken: request.body.acceptanceToken,
            idempotencyKey: request.body.idempotencyKey,
            accessToken: authenticated.value.accessToken,
            expiresAt: authenticated.value.expiresAt,
          }),
        ),
      );
    }),
  );

  routes.post(
    '/accept/existing/mfa',
    input.requireOrigin,
    validateRequest({ body: controlExistingInvitationMfaRequestSchema }),
    catchAsync(async (request, response) => {
      const challengeToken = readControlCookie(
        request.header('cookie'),
        input.names.mfa,
      );
      if (challengeToken === null)
        throw controlUnauthorized({
          code: 'invitation_mfa_challenge_missing',
          message: 'Invitation MFA challenge cookie is missing.',
        });

      const completed = await input.authApplication.completeMfaChallenge({
        method: request.body.method,
        code: request.body.code,
        challengeToken,
        ...(controlRequestId(response) === undefined
          ? {}
          : { requestId: controlRequestId(response)! }),
      });
      if (isControlResultError(completed)) throw completed.error;

      response.status(200).json(
        apiSuccess(
          await acceptAndEstablish(response, {
            acceptanceToken: request.body.acceptanceToken,
            idempotencyKey: request.body.idempotencyKey,
            accessToken: completed.value.accessToken,
            expiresAt: completed.value.expiresAt,
          }),
        ),
      );
    }),
  );

  routes.post(
    '/accept/existing',
    input.authenticateExisting,
    input.limitExistingIdentity,
    validateRequest({ body: acceptWorkforceInvitationRequestSchema }),
    catchAsync(async (request, response) => {
      if (request.body.identityMode !== 'existing_identity')
        throw validationError({
          code: 'invitation_identity_mode_invalid',
          message:
            'Existing identity acceptance requires existing_identity mode.',
          safeMessage: 'Choose the correct invitation acceptance option.',
          status: 422,
        });
      const accepted = resultValue(
        await input.application.acceptInvitation({
          rawToken: request.body.acceptanceToken,
          idempotencyKey: request.body.idempotencyKey,
          acceptance: {
            kind: 'existing_identity',
            ...existingActor(response),
          },
        }),
      );
      response.json(apiSuccess(acceptanceSummary(accepted)));
    }),
  );

  return routes;
};
