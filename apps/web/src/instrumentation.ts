import { observeNextRequestError } from '@/common/adapters/observability/next-request-error';

export async function register() {
  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env['NEXT_RUNTIME'] === 'edge') {
    await import('../sentry.edge.config');
  }
}

export const onRequestError = (
  error: unknown,
  request: unknown,
  context: unknown,
) => {
  observeNextRequestError({ error, request, context });
};
