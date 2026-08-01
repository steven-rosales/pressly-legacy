import type { AuthModule } from '@pressly/auth-module';
import type {
  ControlAuthenticatedSession,
  ControlCapability,
  PresslyApplication,
} from '@pressly/contracts';
import type { Response, Router, RequestHandler } from 'express';
import type { ControlCookieNames } from './control-cookie.adapter.ts';

export type ControlAuthApplication = AuthModule['application'];

type ResultValue<T> = T extends { tag: 'ok'; value: infer Value }
  ? Value
  : never;

export type LoadedControlSession = ResultValue<
  Awaited<ReturnType<ControlAuthApplication['loadSession']>>
>;

export type ControlLocationAccess = Readonly<{
  id: string;
  name: string;
  timezone: string;
}>;

export type ControlAccess = Readonly<{
  business: Readonly<{ id: string; name: string }>;
  locations: readonly ControlLocationAccess[];
  selectedLocationId: string | null;
  capabilities: readonly ControlCapability[];
  applications: readonly PresslyApplication[];
}>;

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

export type ControlBrowserSession = ControlAuthenticatedSession;

export type ResultLike<Value, Error> =
  | Readonly<{ tag: 'ok'; value: Value }>
  | Readonly<{ tag: 'err'; error: Error }>;

export const isControlResultError = <Value, Error>(
  value: ResultLike<Value, Error>,
): value is Readonly<{ tag: 'err'; error: Error }> => value.tag === 'err';
