import { httpRouteManifest } from '../../topology/http.ts';
import {
  makeHttpRouteCensusRequests,
  runHttpRouteMountCensus,
  substituteHttpRoutePathParameters,
  type HttpRouteCensusRequester,
  type HttpRouteManifestEntry,
} from '../http-route-census/census.ts';
import { describe, expect, it } from 'vitest';

const route = (
  operationId: string,
  method: HttpRouteManifestEntry['method'],
  path: string,
): HttpRouteManifestEntry => Object.freeze({ operationId, method, path });

describe('topology HTTP route mount census', () => {
  it('derives one deterministic request from every handwritten topology route', () => {
    const requests = makeHttpRouteCensusRequests(httpRouteManifest);

    expect(requests).toHaveLength(httpRouteManifest.length);
    expect(requests.length).toBeGreaterThan(0);
    expect(
      new Set(
        requests.map((request) => `${request.method} ${request.declaredPath}`),
      ).size,
    ).toBe(requests.length);
    expect(
      requests.every((request) => !request.requestPath.includes(':')),
    ).toBe(true);
  });

  it('uses valid-shaped deterministic path values and JSON command bodies', () => {
    expect(
      substituteHttpRoutePathParameters(
        '/pricing/services/:serviceSlug/pricing',
      ),
    ).toBe('/pricing/services/wash-fold/pricing');
    expect(
      substituteHttpRoutePathParameters(
        '/production/locations/:locationId/orders/:productionOrderId',
      ),
    ).toBe(
      '/production/locations/00000000-0000-4000-8000-000000000999/orders/00000000-0000-4000-8000-000000000999',
    );

    const requests = makeHttpRouteCensusRequests([
      route('pricing.load.v1', 'GET', '/pricing/services/:serviceSlug/pricing'),
      route('orders.create.v1', 'POST', '/orders'),
    ]);
    expect(requests[0]).toMatchObject({
      body: undefined,
      headers: { accept: 'application/json' },
    });
    expect(requests[0]?.headers).not.toHaveProperty('content-type');
    expect(requests[1]).toMatchObject({
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
  });

  it('fails closed on an unknown parameter shape or duplicate topology route', () => {
    expect(() => substituteHttpRoutePathParameters('/reports/:day')).toThrow(
      'has no deterministic valid-shaped census value',
    );
    expect(() =>
      makeHttpRouteCensusRequests([
        route('orders.read.v1', 'GET', '/orders/:orderId'),
        route('orders.load.v1', 'GET', '/orders/:orderId'),
      ]),
    ).toThrow('repeats GET /orders/:orderId');
  });

  it('accepts success and boundary 4xx while rejecting missing, unsupported, failed, and unreachable dispatch', async () => {
    const manifest = [
      route('proof.ok.v1', 'GET', '/ok'),
      route('proof.unauthorized.v1', 'GET', '/unauthorized'),
      route('proof.invalid.v1', 'POST', '/invalid'),
      route('proof.missing.v1', 'GET', '/missing'),
      route('proof.unsupported.v1', 'POST', '/unsupported'),
      route('proof.failed.v1', 'GET', '/failed'),
      route('proof.unreachable.v1', 'GET', '/unreachable'),
    ] as const;
    const statusByPath = new Map([
      ['/ok', 200],
      ['/unauthorized', 401],
      ['/invalid', 422],
      ['/missing', 404],
      ['/unsupported', 405],
      ['/failed', 503],
    ]);
    const request: HttpRouteCensusRequester = async (url) => {
      const status = statusByPath.get(url.pathname);
      if (status === undefined)
        throw new TypeError('synthetic network failure');
      return Object.freeze({ status });
    };

    const report = await runHttpRouteMountCensus({
      origin: 'http://api:4000',
      manifest,
      request,
    });

    expect(report).toMatchObject({
      scope: 'mounted HTTP dispatch reachability only',
      routeCount: 7,
      reachableSuccessCount: 1,
      boundaryRejectionCount: 2,
      failureCount: 4,
      passed: false,
    });
    expect(report.routes.map((result) => result.failure)).toEqual([
      null,
      null,
      null,
      'not-found',
      'method-not-mounted',
      'server-failure',
      'network-failure',
    ]);
  });
});
