import type { Request } from 'express';

export const unmatchedApiRoute = '/unmatched';

const canonicalRouteTemplate = (baseUrl: string, routePath: string): string => {
  const joined = `/${baseUrl}/${routePath}`.replace(/\/{2,}/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
};

export const normalizedApiRoute = (request: Request): string => {
  const routePath: unknown = request.route?.path;
  if (typeof routePath === 'string')
    return canonicalRouteTemplate(request.baseUrl, routePath);

  // Middleware may terminate a request before Express selects a route, and
  // unmatched paths are caller-controlled. A stable sentinel prevents those
  // paths or identifiers from becoming unbounded metric/Sentry dimensions.
  return unmatchedApiRoute;
};
