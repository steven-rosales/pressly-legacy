import type { Principal } from '@pressly/auth/authentication';
import type {
  Action,
  AuthResource,
  PolicyRule,
  PrincipalAttributes,
} from '@pressly/auth/authorization';
import type { Request, RequestHandler, Response } from 'express';

export type AccessControlAuthorize = <R extends AuthResource>(
  input: Readonly<{
    action: Action;
    policies: readonly PolicyRule<R>[];
    readResource: (req: Request, res: Response) => R;
  }>,
) => RequestHandler;

export type AccessControlAuthPort = Readonly<{
  authenticate: RequestHandler;
  authorize: AccessControlAuthorize;
  readPrincipal: (res: Response) => Principal;
  readPrincipalAttributes?: (res: Response) => PrincipalAttributes;
}>;
