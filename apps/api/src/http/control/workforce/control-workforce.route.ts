import type { ControlExperience } from '@pressly/control-experience';
import {
  controlGrantAccessRequestSchema,
  controlGrantParamsSchema,
  controlGrantRevokeRequestSchema,
  controlInvitationListQuerySchema,
  controlInvitationMutationRequestSchema,
  controlInvitationParamsSchema,
  controlMembershipParamsSchema,
  controlMembershipMutationRequestSchema,
  controlWorkforceSessionRevokeRequestSchema,
  controlWorkforceListQuerySchema,
  issueWorkforceInvitationRequestSchema,
} from '@pressly/contracts/auth';
import { apiSuccess } from '@pressly/http';
import { defineValidatedController } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import { controlResultValue } from '../control-experience.error.ts';
import { readControlRequestContext } from '../control-request-context.adapter.ts';

const controlWorkforcePathInvalidRequest = Object.freeze({
  params: Object.freeze({
    code: 'control_workforce_path_invalid',
    message: 'Control workforce route parameters are invalid.',
    safeMessage: 'The requested workforce resource identifier is invalid.',
    status: 422,
  }),
} as const);

export const makeControlWorkforceRoutes = (input: {
  application: Pick<ControlExperience, 'workforce' | 'invitations'>;
  authenticate: RequestHandler;
  limitIdentity: RequestHandler;
  requireRead: RequestHandler;
  requireWrite: RequestHandler;
}): Router => {
  const routes = Router();
  const readSecurity = [
    input.authenticate,
    input.limitIdentity,
    input.requireRead,
  ] as const;
  const writeSecurity = [
    input.authenticate,
    input.limitIdentity,
    input.requireWrite,
  ] as const;
  const listMembersController = defineValidatedController({
    request: { query: controlWorkforceListQuerySchema },
    handle: async ({ query }, { response }) => {
      const states =
        query.state === undefined
          ? undefined
          : Array.isArray(query.state)
            ? query.state
            : [query.state];

      const page = controlResultValue(
        await input.application.workforce.listMembers({
          context: readControlRequestContext(response),
          ...(states === undefined ? {} : { states }),
          ...(query.query === undefined ? {} : { query: query.query }),
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          limit: query.limit,
        }),
      );

      response.json(
        apiSuccess({
          members: page.members,
          nextCursor: page.nextCursor,
        }),
      );
    },
  });
  const getMemberController = defineValidatedController({
    request: { params: controlMembershipParamsSchema },
    invalidRequest: controlWorkforcePathInvalidRequest,
    handle: async ({ params }, { response }) => {
      const member = controlResultValue(
        await input.application.workforce.getMember({
          context: readControlRequestContext(response),
          membershipId: params.membershipId,
        }),
      );
      response.json(apiSuccess(member));
    },
  });
  const listMemberSessionsController = defineValidatedController({
    request: { params: controlMembershipParamsSchema },
    invalidRequest: controlWorkforcePathInvalidRequest,
    handle: async ({ params }, { response }) => {
      const sessions = controlResultValue(
        await input.application.workforce.listMemberSessions({
          context: readControlRequestContext(response),
          membershipId: params.membershipId,
        }),
      );
      response.json(apiSuccess(sessions));
    },
  });
  const revokeMemberSessionsController = defineValidatedController({
    request: {
      params: controlMembershipParamsSchema,
      body: controlWorkforceSessionRevokeRequestSchema,
    },
    invalidRequest: controlWorkforcePathInvalidRequest,
    handle: async ({ params, body }, { response }) => {
      const revoked = controlResultValue(
        await input.application.workforce.revokeMemberSessions({
          context: readControlRequestContext(response),
          membershipId: params.membershipId,
          idempotencyKey: body.idempotencyKey,
          ...(body.sessionId === undefined
            ? {}
            : { sessionId: body.sessionId }),
        }),
      );
      response.json(apiSuccess(revoked));
    },
  });
  const listInvitationsController = defineValidatedController({
    request: { query: controlInvitationListQuerySchema },
    handle: async ({ query }, { response }) => {
      const page = controlResultValue(
        await input.application.invitations.list({
          context: readControlRequestContext(response),
          includeTerminal: query.includeTerminal,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          limit: query.limit,
        }),
      );
      response.json(
        apiSuccess({
          invitations: page.invitations,
          nextCursor: page.nextCursor,
        }),
      );
    },
  });
  const issueInvitationController = defineValidatedController({
    request: { body: issueWorkforceInvitationRequestSchema },
    handle: async ({ body }, { response }) => {
      const outcome = controlResultValue(
        await input.application.invitations.issue({
          context: readControlRequestContext(response),
          ...body,
        }),
      );
      response.status(outcome.status === 'issued' ? 201 : 200).json(
        apiSuccess({
          status: outcome.status,
          invitation: outcome.invitation,
          ...(outcome.status === 'issued'
            ? { acceptanceToken: outcome.acceptanceToken }
            : {}),
        }),
      );
    },
  });
  const reissueInvitationController = defineValidatedController({
    request: {
      params: controlInvitationParamsSchema,
      body: controlInvitationMutationRequestSchema,
    },
    invalidRequest: controlWorkforcePathInvalidRequest,
    handle: async ({ params, body }, { response }) => {
      const outcome = controlResultValue(
        await input.application.invitations.reissue({
          context: readControlRequestContext(response),
          invitationId: params.invitationId,
          expectedVersion: body.expectedVersion,
          idempotencyKey: body.idempotencyKey,
        }),
      );
      response.json(
        apiSuccess({
          status: outcome.status,
          invitation: outcome.invitation,
          ...(outcome.status === 'issued'
            ? { acceptanceToken: outcome.acceptanceToken }
            : {}),
        }),
      );
    },
  });
  const revokeInvitationController = defineValidatedController({
    request: {
      params: controlInvitationParamsSchema,
      body: controlInvitationMutationRequestSchema,
    },
    invalidRequest: controlWorkforcePathInvalidRequest,
    handle: async ({ params, body }, { response }) => {
      const invitation = controlResultValue(
        await input.application.invitations.revoke({
          context: readControlRequestContext(response),
          invitationId: params.invitationId,
          expectedVersion: body.expectedVersion,
          idempotencyKey: body.idempotencyKey,
          ...(body.reason === undefined ? {} : { reason: body.reason }),
        }),
      );
      response.json(apiSuccess(invitation));
    },
  });
  const makeTransitionController = (
    transition: 'suspend' | 'reactivate' | 'end',
  ) =>
    defineValidatedController({
      request: {
        params: controlMembershipParamsSchema,
        body: controlMembershipMutationRequestSchema,
      },
      invalidRequest: controlWorkforcePathInvalidRequest,
      handle: async ({ params, body }, { response }) => {
        const outcome = controlResultValue(
          await input.application.workforce.transitionMembership({
            transition,
            context: readControlRequestContext(response),
            membershipId: params.membershipId,
            expectedVersion: body.expectedVersion,
            idempotencyKey: body.idempotencyKey,
            ...(body.reason === undefined ? {} : { reason: body.reason }),
          }),
        );
        response.json(
          apiSuccess({
            member: outcome.member,
            revokedSessionCount: outcome.revokedSessionCount,
          }),
        );
      },
    });
  const grantAccessController = defineValidatedController({
    request: {
      params: controlMembershipParamsSchema,
      body: controlGrantAccessRequestSchema,
    },
    invalidRequest: controlWorkforcePathInvalidRequest,
    handle: async ({ params, body }, { response }) => {
      const granted = controlResultValue(
        await input.application.workforce.grantAccess({
          context: readControlRequestContext(response),
          membershipId: params.membershipId,
          identityId: body.identityId,
          role: body.role,
          scope: body.scope,
          ...(body.startsAt === undefined ? {} : { startsAt: body.startsAt }),
          ...(body.endsAt === undefined ? {} : { endsAt: body.endsAt }),
          idempotencyKey: body.idempotencyKey,
        }),
      );
      response.status(201).json(apiSuccess(granted));
    },
  });
  const revokeAccessController = defineValidatedController({
    request: {
      params: controlGrantParamsSchema,
      body: controlGrantRevokeRequestSchema,
    },
    invalidRequest: controlWorkforcePathInvalidRequest,
    handle: async ({ params, body }, { response }) => {
      const revoked = controlResultValue(
        await input.application.workforce.revokeAccess({
          context: readControlRequestContext(response),
          grantId: params.grantId,
          expectedVersion: body.expectedVersion,
          idempotencyKey: body.idempotencyKey,
          ...(body.reason === undefined ? {} : { reason: body.reason }),
        }),
      );
      response.json(
        apiSuccess({
          grant: revoked.grant,
          revokedSessionCount: revoked.revokedSessionCount,
        }),
      );
    },
  });

  routes.get(
    '/team',
    ...readSecurity,
    listMembersController.validate,
    listMembersController.handle,
  );

  routes.get(
    '/team/:membershipId',
    ...readSecurity,
    getMemberController.validate,
    getMemberController.handle,
  );

  routes.get(
    '/team/:membershipId/sessions',
    ...readSecurity,
    listMemberSessionsController.validate,
    listMemberSessionsController.handle,
  );

  routes.post(
    '/team/:membershipId/sessions/revoke',
    ...writeSecurity,
    revokeMemberSessionsController.validate,
    revokeMemberSessionsController.handle,
  );

  routes.get(
    '/invitations',
    ...readSecurity,
    listInvitationsController.validate,
    listInvitationsController.handle,
  );

  routes.post(
    '/invitations',
    ...writeSecurity,
    issueInvitationController.validate,
    issueInvitationController.handle,
  );

  routes.post(
    '/invitations/:invitationId/reissue',
    ...writeSecurity,
    reissueInvitationController.validate,
    reissueInvitationController.handle,
  );

  routes.post(
    '/invitations/:invitationId/revoke',
    ...writeSecurity,
    revokeInvitationController.validate,
    revokeInvitationController.handle,
  );

  const transition = (
    path: string,
    transition: 'suspend' | 'reactivate' | 'end',
  ) => {
    const controller = makeTransitionController(transition);
    routes.post(path, ...writeSecurity, controller.validate, controller.handle);
  };

  transition('/team/:membershipId/suspend', 'suspend');
  transition('/team/:membershipId/reactivate', 'reactivate');
  transition('/team/:membershipId/end', 'end');

  routes.post(
    '/team/:membershipId/grants',
    ...writeSecurity,
    grantAccessController.validate,
    grantAccessController.handle,
  );

  routes.post(
    '/grants/:grantId/revoke',
    ...writeSecurity,
    revokeAccessController.validate,
    revokeAccessController.handle,
  );

  return routes;
};
