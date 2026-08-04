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
import { validationError } from '@pressly/errors/factories';
import { catchAsync, validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import { controlResultValue } from '../control-experience.error.ts';
import { readControlRequestContext } from '../control-request-context.adapter.ts';

type ParamsSchema<Value> = Readonly<{
  safeParse(input: unknown):
    | Readonly<{ success: true; data: Value }>
    | Readonly<{
        success: false;
        error: Readonly<{
          issues: readonly Readonly<{
            path: readonly PropertyKey[];
            message: string;
          }>[];
        }>;
      }>;
}>;

const routeParams = <Value>(
  schema: ParamsSchema<Value>,
  input: unknown,
): Value => {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;

  throw validationError({
    code: 'control_workforce_path_invalid',
    message: 'Control workforce route parameters are invalid.',
    safeMessage: 'The requested workforce resource identifier is invalid.',
    status: 422,
    publicDetails: {
      location: 'params',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    },
  });
};

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

  routes.get(
    '/team',
    ...readSecurity,
    validateRequest({ query: controlWorkforceListQuerySchema }),
    catchAsync(async (request, response) => {
      const query = request.query as unknown as {
        state?:
          | 'active'
          | 'suspended'
          | 'ended'
          | readonly ('active' | 'suspended' | 'ended')[];
        query?: string;
        cursor?: string;
        limit: number;
      };

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
    }),
  );

  routes.get(
    '/team/:membershipId',
    ...readSecurity,
    catchAsync(async (request, response) => {
      const params = routeParams(controlMembershipParamsSchema, request.params);
      const member = controlResultValue(
        await input.application.workforce.getMember({
          context: readControlRequestContext(response),
          membershipId: params.membershipId,
        }),
      );
      response.json(apiSuccess(member));
    }),
  );

  routes.get(
    '/team/:membershipId/sessions',
    ...readSecurity,
    catchAsync(async (request, response) => {
      const params = routeParams(controlMembershipParamsSchema, request.params);
      const sessions = controlResultValue(
        await input.application.workforce.listMemberSessions({
          context: readControlRequestContext(response),
          membershipId: params.membershipId,
        }),
      );
      response.json(apiSuccess(sessions));
    }),
  );

  routes.post(
    '/team/:membershipId/sessions/revoke',
    ...writeSecurity,
    validateRequest({
      body: controlWorkforceSessionRevokeRequestSchema,
    }),
    catchAsync(async (request, response) => {
      const body = request.body;
      const params = routeParams(controlMembershipParamsSchema, request.params);
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
    }),
  );

  routes.get(
    '/invitations',
    ...readSecurity,
    validateRequest({ query: controlInvitationListQuerySchema }),
    catchAsync(async (request, response) => {
      const query = request.query as unknown as {
        includeTerminal: boolean;
        cursor?: string;
        limit: number;
      };
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
    }),
  );

  routes.post(
    '/invitations',
    ...writeSecurity,
    validateRequest({ body: issueWorkforceInvitationRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = controlResultValue(
        await input.application.invitations.issue({
          context: readControlRequestContext(response),
          ...request.body,
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
    }),
  );

  routes.post(
    '/invitations/:invitationId/reissue',
    ...writeSecurity,
    validateRequest({ body: controlInvitationMutationRequestSchema }),
    catchAsync(async (request, response) => {
      const body = request.body;
      const params = routeParams(controlInvitationParamsSchema, request.params);
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
    }),
  );

  routes.post(
    '/invitations/:invitationId/revoke',
    ...writeSecurity,
    validateRequest({ body: controlInvitationMutationRequestSchema }),
    catchAsync(async (request, response) => {
      const body = request.body;
      const params = routeParams(controlInvitationParamsSchema, request.params);
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
    }),
  );

  const transition = (
    path: string,
    transition: 'suspend' | 'reactivate' | 'end',
  ) => {
    routes.post(
      path,
      ...writeSecurity,
      validateRequest({ body: controlMembershipMutationRequestSchema }),
      catchAsync(async (request, response) => {
        const body = request.body;
        const params = routeParams(
          controlMembershipParamsSchema,
          request.params,
        );
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
      }),
    );
  };

  transition('/team/:membershipId/suspend', 'suspend');
  transition('/team/:membershipId/reactivate', 'reactivate');
  transition('/team/:membershipId/end', 'end');

  routes.post(
    '/team/:membershipId/grants',
    ...writeSecurity,
    validateRequest({ body: controlGrantAccessRequestSchema }),
    catchAsync(async (request, response) => {
      const body = request.body;
      const params = routeParams(controlMembershipParamsSchema, request.params);
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
    }),
  );

  routes.post(
    '/grants/:grantId/revoke',
    ...writeSecurity,
    validateRequest({ body: controlGrantRevokeRequestSchema }),
    catchAsync(async (request, response) => {
      const body = request.body;
      const params = routeParams(controlGrantParamsSchema, request.params);
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
    }),
  );

  return routes;
};
