import type { Database } from '@pressly/db';
import { controlCookieNames } from './control-cookie.adapter.ts';
import { makeControlAccessResolver } from './control-access.query.ts';
import { makeControlSessionAuthentication } from './control-session.middleware.ts';
import type {
  ControlAuthApplication,
  ControlBrowserBoundary,
  ControlSessionOptions,
} from './control-session.port.ts';
import { makeControlSessionRoutes } from './control-session.route.ts';
import { requireControlOrigin } from './control-csrf.policy.ts';

export const makeControlBrowserBoundary = (input: {
  db: Database;
  application: ControlAuthApplication;
  options: ControlSessionOptions;
}): ControlBrowserBoundary => {
  const names = controlCookieNames(input.options.secureCookies);
  const resolveAccess = makeControlAccessResolver({
    db: input.db,
    controlOrigin: input.options.origin,
    processorOrigin: input.options.processorOrigin,
  });
  const authentication = makeControlSessionAuthentication({
    application: input.application,
    resolveAccess,
    names,
    options: input.options,
  });

  return {
    routes: makeControlSessionRoutes({
      application: input.application,
      loadCookieSession: authentication.loadCookieSession,
      resolveAccess,
      names,
      options: input.options,
    }),
    authenticate: authentication.authenticate,
    requireOrigin: (request, _response, next) => {
      try {
        requireControlOrigin(request, input.options);
        next();
      } catch (error) {
        next(error);
      }
    },
    requireCapability: authentication.requireCapability,
    readAccess: authentication.readAccess,
    invitationBootstrap: {
      names,
      options: input.options,
      resolveAccess,
    },
  };
};
