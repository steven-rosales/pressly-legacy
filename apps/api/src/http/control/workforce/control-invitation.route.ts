import type {
  ControlExperience,
  ControlInvitationAcceptance,
} from '@pressly/control-experience';
import {
  acceptWorkforceInvitationRequestSchema,
  controlExistingInvitationMfaRequestSchema,
  controlExistingInvitationPasswordRequestSchema,
  controlInvitationPreviewRequestSchema,
} from '@pressly/contracts/auth';
import {
  invariantViolationError,
  validationError,
} from '@pressly/errors/factories';
import { apiSuccess } from '@pressly/http';
import { defineValidatedController } from '@pressly/http/express';
import { Router, type RequestHandler, type Response } from 'express';
import {
  clearControlCookie,
  readControlCookie,
  setControlCookie,
  type ControlCookieNames,
} from '../session/control-cookie.adapter.ts';
import { deriveControlCsrfToken } from '../session/control-csrf.adapter.ts';
import { controlUnauthorized } from '../session/control-session.error.ts';
import {
  controlRequestId,
  controlRequestMetadata,
} from '../session/control-request-metadata.adapter.ts';
import { controlBrowserSession } from '../session/control-session.contract.mapper.ts';
import {
  isControlResultError,
  type ControlAuthApplication,
  type ControlSessionOptions,
  type ResolveControlAccess,
} from '../session/control-session.port.ts';
import {
  controlFailureToAppError,
  controlResultValue,
} from '../control-experience.error.ts';
import { readControlRequestContext } from '../control-request-context.adapter.ts';

const existingActor = (response: Response) => {
  const actor = readControlRequestContext(response).actor;
  return {
    authenticatedIdentityId: actor.identityId,
    authenticatedSessionId: actor.sessionId,
  };
};

const acceptanceSummary = (accepted: ControlInvitationAcceptance) => ({
  invitationId: accepted.invitationId,
  membershipId: accepted.membershipId,
  identityId: accepted.identityId,
  identityCreated: accepted.identityCreated,
  privilegedAccessEffective: accepted.privilegedAccessEffective,
  replayed: accepted.replayed,
});

export const makeControlInvitationAcceptanceRoutes = (input: {
  application: ControlExperience['invitations'];
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
      expiresAt: Date;
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

    const accepted = await input.application.accept({
      acceptanceToken: command.acceptanceToken,
      idempotencyKey: command.idempotencyKey,
      acceptance: {
        kind: 'existing_identity',
        authenticatedIdentityId: loaded.value.principal.identityId,
        authenticatedSessionId: loaded.value.principal.sessionId,
      },
    });
    if (isControlResultError(accepted)) {
      await revokeBootstrapSession(response, command.accessToken);
      throw controlFailureToAppError(accepted.error);
    }

    const postAcceptanceAccess = await input.resolveAccess(loaded.value);
    const destination =
      accepted.value.destination === 'processor'
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
      deriveControlCsrfToken(
        command.accessToken,
        input.sessionOptions.csrfSecret,
      ),
    );
    clearControlCookie(response, input.names.mfa, input.sessionOptions);

    return {
      status: 'accepted' as const,
      acceptance: acceptanceSummary(accepted.value),
      session,
      destination,
    };
  };
  const previewController = defineValidatedController({
    request: { body: controlInvitationPreviewRequestSchema },
    handle: async ({ body }, { response }) => {
      const preview = controlResultValue(
        await input.application.preview(body.acceptanceToken),
      );
      response.json(apiSuccess(preview));
    },
  });
  const acceptNewController = defineValidatedController({
    request: { body: acceptWorkforceInvitationRequestSchema },
    handle: async ({ body }, { response }) => {
      if (body.identityMode !== 'new_identity')
        throw validationError({
          code: 'invitation_identity_mode_invalid',
          message: 'New identity acceptance requires new_identity mode.',
          safeMessage: 'Choose the correct invitation acceptance option.',
          status: 422,
        });

      const accepted = controlResultValue(
        await input.application.accept({
          acceptanceToken: body.acceptanceToken,
          idempotencyKey: body.idempotencyKey,
          acceptance: {
            kind: 'new_identity',
            password: body.password,
          },
        }),
      );

      response.status(201).json(apiSuccess(acceptanceSummary(accepted)));
    },
  });
  const acceptExistingPasswordController = defineValidatedController({
    request: { body: controlExistingInvitationPasswordRequestSchema },
    handle: async ({ body }, { request, response }) => {
      const preview = controlResultValue(
        await input.application.preview(body.acceptanceToken),
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
        email: preview.email,
        password: body.password,
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
            acceptanceToken: body.acceptanceToken,
            idempotencyKey: body.idempotencyKey,
            accessToken: authenticated.value.accessToken,
            expiresAt: authenticated.value.expiresAt,
          }),
        ),
      );
    },
  });
  const acceptExistingMfaController = defineValidatedController({
    request: { body: controlExistingInvitationMfaRequestSchema },
    handle: async ({ body }, { request, response }) => {
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
        method: body.method,
        code: body.code,
        challengeToken,
        ...(controlRequestId(response) === undefined
          ? {}
          : { requestId: controlRequestId(response)! }),
      });
      if (isControlResultError(completed)) throw completed.error;

      response.status(200).json(
        apiSuccess(
          await acceptAndEstablish(response, {
            acceptanceToken: body.acceptanceToken,
            idempotencyKey: body.idempotencyKey,
            accessToken: completed.value.accessToken,
            expiresAt: completed.value.expiresAt,
          }),
        ),
      );
    },
  });
  const acceptExistingController = defineValidatedController({
    request: { body: acceptWorkforceInvitationRequestSchema },
    handle: async ({ body }, { response }) => {
      if (body.identityMode !== 'existing_identity')
        throw validationError({
          code: 'invitation_identity_mode_invalid',
          message:
            'Existing identity acceptance requires existing_identity mode.',
          safeMessage: 'Choose the correct invitation acceptance option.',
          status: 422,
        });

      const accepted = controlResultValue(
        await input.application.accept({
          acceptanceToken: body.acceptanceToken,
          idempotencyKey: body.idempotencyKey,
          acceptance: {
            kind: 'existing_identity',
            ...existingActor(response),
          },
        }),
      );

      response.json(apiSuccess(acceptanceSummary(accepted)));
    },
  });

  routes.post(
    '/preview',
    input.requireOrigin,
    previewController.validate,
    previewController.handle,
  );

  routes.post(
    '/accept/new',
    input.requireOrigin,
    acceptNewController.validate,
    acceptNewController.handle,
  );

  routes.post(
    '/accept/existing/password',
    input.requireOrigin,
    acceptExistingPasswordController.validate,
    acceptExistingPasswordController.handle,
  );

  routes.post(
    '/accept/existing/mfa',
    input.requireOrigin,
    acceptExistingMfaController.validate,
    acceptExistingMfaController.handle,
  );

  routes.post(
    '/accept/existing',
    input.authenticateExisting,
    input.limitExistingIdentity,
    acceptExistingController.validate,
    acceptExistingController.handle,
  );

  return routes;
};
