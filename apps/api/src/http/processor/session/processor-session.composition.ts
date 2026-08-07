import type { ResolveProcessorAccess } from '@pressly/processor-experience';
import type { RequestHandler } from 'express';
import { processorCookieNames } from './processor-cookie.adapter.ts';
import { makeProcessorSessionAuthentication } from './processor-session.middleware.ts';
import type {
  ProcessorAuthApplication,
  ProcessorBrowserBoundary,
  ProcessorSessionOptions,
} from './processor-session.port.ts';
import { makeProcessorSessionRoutes } from './processor-session.route.ts';

export const makeProcessorBrowserBoundary = (input: {
  application: ProcessorAuthApplication;
  resolveAccess: ResolveProcessorAccess;
  bearerAuthenticate: RequestHandler;
  options: ProcessorSessionOptions;
}): ProcessorBrowserBoundary => {
  const names = processorCookieNames(input.options.secureCookies);

  const authentication = makeProcessorSessionAuthentication({
    application: input.application,
    resolveAccess: input.resolveAccess,
    bearerAuthenticate: input.bearerAuthenticate,
    names,
    options: input.options,
  });

  return {
    routes: makeProcessorSessionRoutes({
      application: input.application,
      loadCookieSession: authentication.loadCookieSession,
      resolveAccess: input.resolveAccess,
      names,
      options: input.options,
    }),
    authenticate: authentication.authenticate,
  };
};
