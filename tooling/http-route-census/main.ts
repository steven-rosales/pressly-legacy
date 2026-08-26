import { pathToFileURL } from 'node:url';
import { toolingError } from '@pressly/errors/tooling-error';
import { httpRouteManifest } from '../../topology/http.ts';
import { runHttpRouteMountCensus } from './census.ts';

const parseOrigin = (arguments_: readonly string[]): string => {
  if (arguments_.length !== 2 || arguments_[0] !== '--origin')
    throw toolingError({
      code: 'http_route_census_usage',
      message: 'Usage: main.ts --origin <http-or-https-origin>',
    });

  const origin = arguments_[1];
  if (origin === undefined || origin.trim() === '')
    throw toolingError({
      code: 'http_route_census_usage',
      message: 'The HTTP route census origin must not be empty.',
    });

  return origin;
};

const request = async (
  url: URL,
  input: Readonly<{
    method: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
    headers: Readonly<Record<string, string>>;
    body: string | undefined;
  }>,
) => {
  const response = await fetch(url, {
    method: input.method,
    headers: input.headers,
    ...(input.body === undefined ? {} : { body: input.body }),
    redirect: 'manual',
    signal: AbortSignal.timeout(5_000),
  });
  return Object.freeze({ status: response.status });
};

export const runGeneratedHttpRouteMountCensus = async (
  arguments_: readonly string[],
): Promise<number> => {
  const report = await runHttpRouteMountCensus({
    origin: parseOrigin(arguments_),
    manifest: httpRouteManifest,
    request,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.passed) return 0;

  const failures = report.routes
    .filter((route) => route.outcome === 'failure')
    .map(
      (route) =>
        `${route.method} ${route.declaredPath} (${route.operationId}): ${route.failure}${route.status === null ? '' : ` status=${route.status}`}`,
    )
    .join('\n');
  process.stderr.write(
    `Generated HTTP route mount census failed:\n${failures}\n`,
  );
  return 1;
};

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain)
  try {
    process.exitCode = await runGeneratedHttpRouteMountCensus(
      process.argv.slice(2),
    );
  } catch (error) {
    const failure =
      error instanceof Error
        ? error
        : toolingError({
            code: 'http_route_census_failure',
            message: 'HTTP route census failed with a non-Error value.',
            cause: error,
          });
    process.stderr.write(`${failure.message}\n`);
    process.exitCode = 1;
  }
