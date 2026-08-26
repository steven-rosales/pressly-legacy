import { toolingError } from '@pressly/errors/tooling-error';

export type HttpRouteManifestEntry = Readonly<{
  operationId: string;
  method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  path: string;
}>;

export type HttpRouteCensusRequest = Readonly<{
  operationId: string;
  method: HttpRouteManifestEntry['method'];
  declaredPath: string;
  requestPath: string;
  headers: Readonly<Record<string, string>>;
  body: string | undefined;
}>;

export type HttpRouteCensusResponse = Readonly<{
  status: number;
}>;

export type HttpRouteCensusRequester = (
  url: URL,
  request: Readonly<{
    method: HttpRouteCensusRequest['method'];
    headers: Readonly<Record<string, string>>;
    body: string | undefined;
  }>,
) => Promise<HttpRouteCensusResponse>;

export type HttpRouteCensusResult = Readonly<{
  operationId: string;
  method: HttpRouteManifestEntry['method'];
  declaredPath: string;
  requestPath: string;
  status: number | null;
  outcome: 'boundary-rejection' | 'failure' | 'reachable-success';
  failure:
    | 'method-not-mounted'
    | 'network-failure'
    | 'not-found'
    | 'server-failure'
    | null;
}>;

export type HttpRouteMountCensusReport = Readonly<{
  proof: 'handwritten-http-route-mount-census';
  catalogSource: '@pressly/topology/http:httpRouteManifest';
  scope: 'mounted HTTP dispatch reachability only';
  origin: string;
  routeCount: number;
  reachableSuccessCount: number;
  boundaryRejectionCount: number;
  failureCount: number;
  passed: boolean;
  routes: readonly HttpRouteCensusResult[];
  limitations: readonly string[];
}>;

const deterministicUuid = '00000000-0000-4000-8000-000000000999';
const pathParameterPattern = /:([A-Za-z][A-Za-z0-9]*)/gu;

const censusInvariant = (message: string) =>
  toolingError({ code: 'http_route_census_invariant', message });

const substitutePathParameter = (name: string): string => {
  if (name === 'serviceSlug') return 'wash-fold';
  if (name.endsWith('Id')) return deterministicUuid;

  throw censusInvariant(
    `Generated HTTP route parameter :${name} has no deterministic valid-shaped census value.`,
  );
};

export const substituteHttpRoutePathParameters = (path: string): string => {
  if (!path.startsWith('/'))
    throw censusInvariant(
      `Generated HTTP route path must start with "/": ${path}`,
    );

  const resolved = path.replace(
    pathParameterPattern,
    (_parameter, name: string) =>
      encodeURIComponent(substitutePathParameter(name)),
  );
  if (resolved.includes(':'))
    throw censusInvariant(
      `Generated HTTP route path contains an unsupported parameter expression: ${path}`,
    );

  return resolved;
};

export const makeHttpRouteCensusRequests = (
  manifest: readonly HttpRouteManifestEntry[],
): readonly HttpRouteCensusRequest[] => {
  if (manifest.length === 0)
    throw censusInvariant('Generated HTTP route manifest must not be empty.');

  const routeKeys = new Set<string>();
  const requests = manifest.map((route) => {
    const routeKey = `${route.method} ${route.path}`;
    if (routeKeys.has(routeKey))
      throw censusInvariant(
        `Generated HTTP route manifest repeats ${routeKey}.`,
      );
    routeKeys.add(routeKey);

    const hasJsonBody = route.method !== 'GET';
    return Object.freeze({
      operationId: route.operationId,
      method: route.method,
      declaredPath: route.path,
      requestPath: substituteHttpRoutePathParameters(route.path),
      headers: Object.freeze({
        accept: 'application/json',
        ...(hasJsonBody ? { 'content-type': 'application/json' } : {}),
        'x-pressly-proof': 'handwritten-http-route-mount-census',
      }),
      body: hasJsonBody ? '{}' : undefined,
    });
  });

  return Object.freeze(requests);
};

const resolveCensusOrigin = (origin: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch (cause) {
    throw toolingError({
      code: 'http_route_census_invariant',
      message: 'HTTP route census origin must be a valid URL.',
      cause,
    });
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    (parsed.pathname !== '' && parsed.pathname !== '/')
  )
    throw censusInvariant(
      'HTTP route census origin must be an HTTP(S) origin without credentials, path, query, or fragment.',
    );

  return new URL(parsed.origin);
};

const classifyStatus = (
  status: number,
): Pick<HttpRouteCensusResult, 'failure' | 'outcome'> => {
  if (status === 404) return { outcome: 'failure', failure: 'not-found' };
  if (status === 405)
    return { outcome: 'failure', failure: 'method-not-mounted' };
  if (status >= 500) return { outcome: 'failure', failure: 'server-failure' };
  if (status >= 400) return { outcome: 'boundary-rejection', failure: null };
  return { outcome: 'reachable-success', failure: null };
};

export const runHttpRouteMountCensus = async (input: {
  origin: string;
  manifest: readonly HttpRouteManifestEntry[];
  request: HttpRouteCensusRequester;
}): Promise<HttpRouteMountCensusReport> => {
  const origin = resolveCensusOrigin(input.origin);
  const requests = makeHttpRouteCensusRequests(input.manifest);
  const results: HttpRouteCensusResult[] = [];

  for (const request of requests) {
    const url = new URL(request.requestPath, origin);
    try {
      const response = await input.request(url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });
      const classification = classifyStatus(response.status);
      results.push(
        Object.freeze({
          operationId: request.operationId,
          method: request.method,
          declaredPath: request.declaredPath,
          requestPath: request.requestPath,
          status: response.status,
          ...classification,
        }),
      );
    } catch {
      results.push(
        Object.freeze({
          operationId: request.operationId,
          method: request.method,
          declaredPath: request.declaredPath,
          requestPath: request.requestPath,
          status: null,
          outcome: 'failure',
          failure: 'network-failure',
        }),
      );
    }
  }

  const frozenResults = Object.freeze(results);
  const failureCount = results.filter(
    (result) => result.outcome === 'failure',
  ).length;

  return Object.freeze({
    proof: 'handwritten-http-route-mount-census',
    catalogSource: '@pressly/topology/http:httpRouteManifest',
    scope: 'mounted HTTP dispatch reachability only',
    origin: origin.origin,
    routeCount: results.length,
    reachableSuccessCount: results.filter(
      (result) => result.outcome === 'reachable-success',
    ).length,
    boundaryRejectionCount: results.filter(
      (result) => result.outcome === 'boundary-rejection',
    ).length,
    failureCount,
    passed: failureCount === 0,
    routes: frozenResults,
    limitations: Object.freeze([
      'A success or unauthenticated boundary rejection proves only that the topology method and path reached mounted dispatch.',
      'This census does not prove authorization, validation, persistence, or business behavior; those require their focused integration and browser proofs.',
    ]),
  });
};
