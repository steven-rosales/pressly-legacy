import { normalizeUnknownError } from '@pressly/errors/app-error';
import type { IdSource } from '@pressly/cells/id-source';
import type { Logger, SecurityEventSink } from '@pressly/logging';
import type {
  CounterSink,
  ErrorReporter,
  MeasurementSink,
  TraceSink,
} from '@pressly/observability';
import { attemptObservation, isolateCounterSink } from '@pressly/observability';
import type { PostgresRuntime } from '@pressly/postgres/client';
import {
  makePostgresProductionChangeFeed,
  type ProductionChangeFeedFailureReason,
  type ProductionChangeFeedObservation,
} from '@pressly/production-system';
import type { Clock } from '@pressly/time';
import {
  presslyPostgresOwnerSchemas,
  type PresslyPostgresSchema,
} from '@pressly/topology/postgres-schema';
import {
  composeApiApplication,
  type ApiApplicationAssembly,
  type ApiRuntimeCatalogs,
} from '../bootstrap/app.ts';
import type {
  ApiBoundaryRequest,
  ApiBoundaryResponse,
  RateLimitStore,
} from '../bootstrap/boundary-provider-types.ts';
import type { ApiHttpBoundaryMechanisms } from '../bootstrap/http-boundary-providers.ts';
import type { ApiEnv } from './env.ts';

export type PresslyHttpRuntimeInput<
  Request extends ApiBoundaryRequest = ApiBoundaryRequest,
  Response extends ApiBoundaryResponse = ApiBoundaryResponse,
> = Readonly<{
  catalogs: ApiRuntimeCatalogs;
  configuration: ApiEnv;
  database: PostgresRuntime<PresslyPostgresSchema>;
  clock: Clock;
  ids: IdSource;
  rateLimitStore: RateLimitStore;
  mechanisms: ApiHttpBoundaryMechanisms<Request, Response>;
  process: Readonly<{
    logger: Logger;
    errors: ErrorReporter;
    counters: CounterSink;
    measurements: MeasurementSink;
    trace: TraceSink;
    securityEvents: SecurityEventSink;
    nowNanoseconds: () => bigint;
  }>;
}>;

const productionChangeObservation = (
  logger: Logger,
  counters: CounterSink,
): ProductionChangeFeedObservation => {
  const { increment } = isolateCounterSink(counters);
  return Object.freeze({
    failure: (reason: ProductionChangeFeedFailureReason, error?: unknown) => {
      increment('api.sse_feed_failures', { reason });
      attemptObservation(() =>
        logger.warn(
          reason === 'invalid_notification'
            ? 'production change notification rejected'
            : 'production change subscriber failed',
          reason === 'invalid_notification'
            ? { reason }
            : { error: normalizeUnknownError(error) },
        ),
      );
    },
    resync: (reason) => increment('api.sse_resyncs', { reason }),
  });
};

export type PresslyHttpRuntimeAssembly<
  Request extends ApiBoundaryRequest = ApiBoundaryRequest,
  Response extends ApiBoundaryResponse = ApiBoundaryResponse,
> = Readonly<{
  application: ApiApplicationAssembly<Request, Response>;
  listen: Readonly<{
    host: string;
    port: number;
    shutdownGracePeriodMs: number;
  }>;
  start: () => Promise<void>;
  close: () => Promise<void>;
}>;

export const composePresslyHttpRuntime = <
  Request extends ApiBoundaryRequest,
  Response extends ApiBoundaryResponse,
>(
  input: PresslyHttpRuntimeInput<Request, Response>,
): PresslyHttpRuntimeAssembly<Request, Response> => {
  const productionChanges = makePostgresProductionChangeFeed({
    database: input.database,
    schema: presslyPostgresOwnerSchemas.production,
    observation: productionChangeObservation(
      input.process.logger,
      input.process.counters,
    ),
  });
  const runtime = {
    env: input.configuration,
    logger: input.process.logger,
    securityEvents: input.process.securityEvents,
    observability: {
      errors: input.process.errors,
      counters: input.process.counters,
      measurements: input.process.measurements,
      trace: input.process.trace,
    },
    database: input.database,
    nowNanoseconds: input.process.nowNanoseconds,
  };

  return Object.freeze({
    application: composeApiApplication(
      runtime,
      input.catalogs,
      input.rateLimitStore,
      input.mechanisms,
      {
        clock: input.clock,
        ids: input.ids,
        productionChanges,
      },
    ),
    listen: Object.freeze({
      host: input.configuration.host,
      port: input.configuration.port,
      shutdownGracePeriodMs: input.configuration.shutdownGracePeriodMs,
    }),
    start: () => productionChanges.start(),
    close: () => productionChanges.close(),
  });
};
