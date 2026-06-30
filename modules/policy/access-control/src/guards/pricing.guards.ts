import type {
  Action,
  AuthResource,
  PolicyRule,
} from '@pressly/auth/authorization';
import type { Request, RequestHandler, Response } from 'express';
import type { PricingChangeRequest } from '@pressly/contracts';
import { readAuthLocals } from './auth-locals.ts';
import { pricingCatalogResourceFromRequest } from '../resources/pricing.resources.ts';
import {
  makePricingPolicies,
  type PricingPolicyOptions,
} from '../policies/pricing.policy.ts';

type PricingChangeAuthor = Readonly<{
  id: string;
  kind: 'human' | 'service';
  displayName: string;
}>;

export type AccessControlAuthorize = <R extends AuthResource>(
  input: Readonly<{
    action: Action;
    policies: readonly PolicyRule<R>[];
    readResource: (req: Request, res: Response) => R;
  }>,
) => RequestHandler;

export type PricingAccessControl = Readonly<{
  authenticate: RequestHandler;
  planPricingChange: RequestHandler;
  publishPricingChange: RequestHandler;
  readAuthor: ReadPricingChangeAuthor;
}>;

export type ReadPricingChangeAuthor = (res: Response) => PricingChangeAuthor;

const readAuthenticatedPricingChangeAuthor: ReadPricingChangeAuthor = (res) => {
  const { principal } = readAuthLocals(res);

  return {
    id: principal.identityId,
    kind: principal.kind,
    displayName: principal.displayName,
  };
};

const readPricingCatalogResource = (req: Request) => {
  const body = req.body as PricingChangeRequest;
  return pricingCatalogResourceFromRequest(body);
};

export const makePricingAccessControl = (input: {
  authenticate: RequestHandler;
  authorize: AccessControlAuthorize;
  policies: PricingPolicyOptions;
}): PricingAccessControl => ({
  authenticate: input.authenticate,

  planPricingChange: input.authorize({
    action: 'pricing:plan',
    policies: makePricingPolicies(input.policies),
    readResource: readPricingCatalogResource,
  }),

  publishPricingChange: input.authorize({
    action: 'pricing:publish',
    policies: makePricingPolicies(input.policies),
    readResource: readPricingCatalogResource,
  }),

  readAuthor: readAuthenticatedPricingChangeAuthor,
});
