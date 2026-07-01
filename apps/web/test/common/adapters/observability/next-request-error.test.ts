import { makeAppError } from '@pressly/errors';
import { observeNextRequestError } from '@/common/adapters/observability/next-request-error';

describe('observeNextRequestError', () => {
  it('reports Next request errors through the shared policy', () => {
    const capture = vi.fn();
    const error = new Error('render failed');

    const decision = observeNextRequestError({
      error,
      request: { url: 'https://pressly.test/pricing?zip=10001' },
      context: { routeType: 'app-render', routerKind: 'app' },
      reporter: {
        capture,
        shutdown: async () => undefined,
      },
    });

    expect(decision).toMatchObject({
      report: true,
      reason: 'server_error',
    });
    expect(capture).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'unexpected_error',
      }),
      expect.objectContaining({
        source: 'web',
        operation: 'next_request_error',
        route: '/pricing',
        tags: expect.objectContaining({
          reason: 'server_error',
          route_type: 'app-render',
          router_kind: 'app',
        }),
      }),
    );
  });

  it('suppresses routine client failures', () => {
    const capture = vi.fn();

    const decision = observeNextRequestError({
      error: makeAppError({
        kind: 'NotFoundError',
        code: 'route_not_found',
        message: 'Route not found.',
        safeMessage: 'Not found.',
        status: 404,
      }),
      context: { routePath: '/missing' },
      reporter: {
        capture,
        shutdown: async () => undefined,
      },
    });

    expect(decision).toMatchObject({
      report: false,
      reason: 'routine_client_failure',
    });
    expect(capture).not.toHaveBeenCalled();
  });
});
