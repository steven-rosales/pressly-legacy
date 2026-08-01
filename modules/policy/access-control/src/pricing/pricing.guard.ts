import type { Request, RequestHandler, Response } from 'express';
import type { PricingChangeRequest } from '@pressly/contracts';
import type { AccessControlAuthPort } from '../http/auth.port.ts';
import { pricingCatalogResourceFromRequest } from './pricing.resource.ts';
import {
  makePricingPolicies,
  type PricingPolicyOptions,
} from './pricing.policy.ts';

type PricingChangeAuthor = Readonly<{
  id: string;
  kind: 'human' | 'service';
  displayName: string;
}>;

export type PricingAccessControl = Readonly<{
  authenticate: RequestHandler;
  planPricingChange: RequestHandler;
  publishPricingChange: RequestHandler;
  readAuthor: ReadPricingChangeAuthor;
}>;

export type ReadPricingChangeAuthor = (res: Response) => PricingChangeAuthor;

const readPricingCatalogResource = (req: Request) => {
  const body = req.body as PricingChangeRequest;
  return pricingCatalogResourceFromRequest(body);
};

export const makePricingAccessControl = (input: {
  auth: AccessControlAuthPort;
  policies: PricingPolicyOptions;
}): PricingAccessControl => {
  const readAuthenticatedPricingChangeAuthor: ReadPricingChangeAuthor = (
    res,
  ) => {
    const principal = input.auth.readPrincipal(res);

    return {
      id: principal.identityId,
      kind: principal.kind,
      displayName: principal.displayName,
    };
  };

  return {
    authenticate: input.auth.authenticate,

    planPricingChange: input.auth.authorize({
      action: 'pricing:plan',
      policies: makePricingPolicies(input.policies),
      readResource: readPricingCatalogResource,
    }),

    publishPricingChange: input.auth.authorize({
      action: 'pricing:publish',
      policies: makePricingPolicies(input.policies),
      readResource: readPricingCatalogResource,
    }),

    readAuthor: readAuthenticatedPricingChangeAuthor,
  };
};
