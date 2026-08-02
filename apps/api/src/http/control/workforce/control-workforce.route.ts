import type { WorkforceApplication } from '@pressly/auth-module';
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
} from '@pressly/contracts';
import { apiSuccess } from '@pressly/http';
import { invariantViolationError, validationError } from '@pressly/errors';
import { catchAsync, validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler, type Response } from 'express';
import type {
  ControlAccess,
  LoadedControlSession,
} from '../session/control-session.port.ts';
import {
  controlGrant,
  controlInvitation,
  controlMember,
  controlMemberDetail,
} from './control-workforce.mapper.ts';

type ControlAuthContext = Readonly<{
  principal: LoadedControlSession['principal'];
}>;

const actor = (response: Response) => {
  const auth = response.locals['auth'] as ControlAuthContext;
  if (auth.principal.sessionId === undefined)
    throw invariantViolationError({
      code: 'control_session_id_missing',
      message: 'Authenticated Control principal is missing a session ID.',
      safeMessage: 'Session could not be loaded.',
    });
  return {
    identityId: auth.principal.identityId,
    sessionId: auth.principal.sessionId,
  };
};

const access = (response: Response): ControlAccess =>
  response.locals['controlAccess'] as ControlAccess;

const resultValue = <Value>(
  outcome:
    | Readonly<{ tag: 'ok'; value: Value }>
    | Readonly<{ tag: 'err'; error: unknown }>,
): Value => {
  if (outcome.tag === 'err') throw outcome.error;
  return outcome.value;
};

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
  application: WorkforceApplication;
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
      const page = resultValue(
        await input.application.listWorkforce({
          actor: actor(response),
          businessId: access(response).business.id,
          ...(states === undefined ? {} : { states }),
          ...(query.query === undefined ? {} : { query: query.query }),
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          limit: query.limit,
        }),
      );
      response.json(
        apiSuccess({
          members: page.members.map(controlMember),
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
      const member = resultValue(
        await input.application.getWorkforceMember({
          actor: actor(response),
          businessId: access(response).business.id,
          membershipId: params.membershipId,
        }),
      );
      response.json(apiSuccess(controlMemberDetail(member)));
    }),
  );

  routes.get(
    '/team/:membershipId/sessions',
    ...readSecurity,
    catchAsync(async (request, response) => {
      const params = routeParams(controlMembershipParamsSchema, request.params);
      const sessions = resultValue(
        await input.application.listMemberSessions({
          actor: actor(response),
          businessId: access(response).business.id,
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
      const revoked = resultValue(
        await input.application.revokeMemberSessions({
          actor: actor(response),
          businessId: access(response).business.id,
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
      const page = resultValue(
        await input.application.listInvitations({
          actor: actor(response),
          businessId: access(response).business.id,
          includeTerminal: query.includeTerminal,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
          limit: query.limit,
        }),
      );
      response.json(
        apiSuccess({
          invitations: page.invitations.map(controlInvitation),
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
      const outcome = resultValue(
        await input.application.issueInvitation({
          actor: actor(response),
          businessId: access(response).business.id,
          ...request.body,
        }),
      );
      response.status(outcome.status === 'issued' ? 201 : 200).json(
        apiSuccess({
          status: outcome.status,
          invitation: controlInvitation(outcome.invitation),
          ...(outcome.status === 'issued'
            ? { acceptanceToken: outcome.token }
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
      const outcome = resultValue(
        await input.application.reissueInvitation({
          actor: actor(response),
          businessId: access(response).business.id,
          invitationId: params.invitationId,
          expectedVersion: body.expectedVersion,
          idempotencyKey: body.idempotencyKey,
        }),
      );
      response.json(
        apiSuccess({
          status: outcome.status,
          invitation: controlInvitation(outcome.invitation),
          ...(outcome.status === 'issued'
            ? { acceptanceToken: outcome.token }
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
      const invitation = resultValue(
        await input.application.revokeInvitation({
          actor: actor(response),
          businessId: access(response).business.id,
          invitationId: params.invitationId,
          expectedVersion: body.expectedVersion,
          idempotencyKey: body.idempotencyKey,
          ...(body.reason === undefined ? {} : { reason: body.reason }),
        }),
      );
      response.json(apiSuccess(controlInvitation(invitation)));
    }),
  );

  const transition = (
    path: string,
    command:
      | WorkforceApplication['suspendMembership']
      | WorkforceApplication['reactivateMembership']
      | WorkforceApplication['endMembership'],
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
        const outcome = resultValue(
          await command({
            actor: actor(response),
            businessId: access(response).business.id,
            membershipId: params.membershipId,
            expectedVersion: body.expectedVersion,
            idempotencyKey: body.idempotencyKey,
            ...(body.reason === undefined ? {} : { reason: body.reason }),
          }),
        );
        response.json(
          apiSuccess({
            member: controlMemberDetail(outcome.member),
            revokedSessionCount: outcome.revokedSessionCount,
          }),
        );
      }),
    );
  };

  transition(
    '/team/:membershipId/suspend',
    input.application.suspendMembership,
  );
  transition(
    '/team/:membershipId/reactivate',
    input.application.reactivateMembership,
  );
  transition('/team/:membershipId/end', input.application.endMembership);

  routes.post(
    '/team/:membershipId/grants',
    ...writeSecurity,
    validateRequest({ body: controlGrantAccessRequestSchema }),
    catchAsync(async (request, response) => {
      const body = request.body;
      const params = routeParams(controlMembershipParamsSchema, request.params);
      const granted = resultValue(
        await input.application.grantAccess({
          actor: actor(response),
          businessId: access(response).business.id,
          membershipId: params.membershipId,
          identityId: body.identityId,
          role: body.role,
          scope: body.scope,
          ...(body.startsAt === undefined
            ? {}
            : { startsAt: new Date(body.startsAt) }),
          ...(body.endsAt === undefined
            ? {}
            : { endsAt: new Date(body.endsAt) }),
          idempotencyKey: body.idempotencyKey,
        }),
      );
      response.status(201).json(apiSuccess(controlGrant(granted)));
    }),
  );

  routes.post(
    '/grants/:grantId/revoke',
    ...writeSecurity,
    validateRequest({ body: controlGrantRevokeRequestSchema }),
    catchAsync(async (request, response) => {
      const body = request.body;
      const params = routeParams(controlGrantParamsSchema, request.params);
      const revoked = resultValue(
        await input.application.revokeAccess({
          actor: actor(response),
          businessId: access(response).business.id,
          grantId: params.grantId,
          expectedVersion: body.expectedVersion,
          idempotencyKey: body.idempotencyKey,
          ...(body.reason === undefined ? {} : { reason: body.reason }),
        }),
      );
      response.json(
        apiSuccess({
          grant: controlGrant(revoked.grant),
          revokedSessionCount: revoked.revokedSessionCount,
        }),
      );
    }),
  );

  return routes;
};
