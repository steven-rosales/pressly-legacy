import type { IdentityModule } from '@pressly/identity';
import type {
  ControlAccess,
  ControlCapability,
} from '@pressly/control-experience';
import type { Response, Router, RequestHandler } from 'express';
import type { ControlCookieNames } from './control-cookie.adapter.ts';

export type ControlAuthApplication = IdentityModule['application'];

type ResultValue<T> = T extends { tag: 'ok'; value: infer Value }
  ? Value
  : never;

export type LoadedControlSession = ResultValue<
  Awaited<ReturnType<ControlAuthApplication['loadSession']>>
>;

export type ResolveControlAccess = (
  session: LoadedControlSession,
) => Promise<ControlAccess | null>;

export type ControlSessionOptions = Readonly<{
  origin: string;
  csrfSecret: string;
  secureCookies: boolean;
  processorOrigin: string;
}>;

export type ControlBrowserBoundary = Readonly<{
  routes: Router;
  authenticate: RequestHandler;
  requireOrigin: RequestHandler;
  requireCapability: (capability: ControlCapability) => RequestHandler;
  readAccess: (response: Response) => ControlAccess;
  invitationBootstrap: Readonly<{
    names: ControlCookieNames;
    options: ControlSessionOptions;
    resolveAccess: ResolveControlAccess;
  }>;
}>;

export type ResultLike<Value, Error> =
  | Readonly<{ tag: 'ok'; value: Value }>
  | Readonly<{ tag: 'err'; error: Error }>;

export const isControlResultError = <Value, Error>(
  value: ResultLike<Value, Error>,
): value is Readonly<{ tag: 'err'; error: Error }> => value.tag === 'err';
