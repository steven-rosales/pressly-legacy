import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL, URL, URLSearchParams } from 'node:url';
import { toolingError } from '../../packages/errors/src/tooling-error.mjs';
import { selectDeploySha } from './deployment-selection.mjs';

const clientName = 'pressly-deployment-monitor';
const clientVersion = '1.0.0';
const sentryProtocolVersion = '7';
const deliveryTimeoutMilliseconds = 5_000;
const checkInIdPattern = /^[0-9a-f]{32}$/;
const monitorSlugPattern = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/;
const publicKeyPattern = /^[A-Za-z0-9_-]{8,128}$/;

const configurationError = (code, message) =>
  toolingError({ code, message, nativeKind: 'TypeError' });

const normalizeCheckInId = (value) => {
  const checkInId = value.trim().toLowerCase();

  if (!checkInIdPattern.test(checkInId))
    throw configurationError(
      'invalid_deployment_monitor_check_in_id',
      'Deployment monitor check-in ID must be 32 hexadecimal characters.',
    );

  return checkInId;
};

const normalizeMonitorSlug = (value) => {
  const monitorSlug = value.trim();

  if (
    monitorSlug !== value ||
    monitorSlug.length > 50 ||
    !monitorSlugPattern.test(monitorSlug)
  )
    throw configurationError(
      'invalid_deployment_monitor_slug',
      'Deployment monitor slug is malformed.',
    );

  return monitorSlug;
};

const normalizeStartedAt = (value) => {
  if (!/^\d{13}$/.test(value))
    throw configurationError(
      'invalid_deployment_monitor_started_at',
      'Deployment monitor start time is malformed.',
    );

  const startedAt = Number(value);
  if (!Number.isSafeInteger(startedAt))
    throw configurationError(
      'invalid_deployment_monitor_started_at',
      'Deployment monitor start time is malformed.',
    );

  return startedAt;
};

const finishedStatusFor = (outcome) => {
  if (outcome === 'success') return 'ok';
  if (outcome === 'failure' || outcome === 'cancelled') return 'error';

  throw configurationError(
    'invalid_deployment_monitor_outcome',
    'Deployment outcome must be success, failure, or cancelled.',
  );
};

const parseSentryDsn = (value) => {
  if (value.trim() !== value || value.length === 0)
    throw configurationError(
      'invalid_deployment_monitor_dsn',
      'Deployment monitor DSN is malformed.',
    );

  let dsn;
  try {
    dsn = new URL(value);
  } catch {
    throw configurationError(
      'invalid_deployment_monitor_dsn',
      'Deployment monitor DSN is malformed.',
    );
  }

  if (
    dsn.protocol !== 'https:' ||
    dsn.username.length === 0 ||
    dsn.password.length > 0 ||
    dsn.search.length > 0 ||
    dsn.hash.length > 0
  )
    throw configurationError(
      'invalid_deployment_monitor_dsn',
      'Deployment monitor DSN is malformed.',
    );

  let publicKey;
  let pathSegments;
  try {
    publicKey = decodeURIComponent(dsn.username);
    pathSegments = dsn.pathname
      .split('/')
      .filter((segment) => segment.length > 0)
      .map((segment) => decodeURIComponent(segment));
  } catch {
    throw configurationError(
      'invalid_deployment_monitor_dsn',
      'Deployment monitor DSN is malformed.',
    );
  }

  const projectId = pathSegments.at(-1) ?? '';
  const pathPrefix = pathSegments.slice(0, -1);
  if (
    !publicKeyPattern.test(publicKey) ||
    !/^\d+$/.test(projectId) ||
    pathPrefix.some((segment) => !/^[A-Za-z0-9._~-]+$/.test(segment))
  )
    throw configurationError(
      'invalid_deployment_monitor_dsn',
      'Deployment monitor DSN is malformed.',
    );

  const encodedPrefix = pathPrefix.map(encodeURIComponent).join('/');
  const basePath = encodedPrefix.length > 0 ? `/${encodedPrefix}` : '';
  const auth = new URLSearchParams({
    sentry_version: sentryProtocolVersion,
    sentry_key: publicKey,
    sentry_client: `${clientName}/${clientVersion}`,
  });

  return `${dsn.origin}${basePath}/api/${projectId}/envelope/?${auth}`;
};

const serializeCheckInEnvelope = ({ checkIn, occurredAt }) =>
  [
    JSON.stringify({
      sent_at: occurredAt.toISOString(),
      sdk: { name: clientName, version: clientVersion },
    }),
    JSON.stringify({ type: 'check_in' }),
    JSON.stringify(checkIn),
  ].join('\n');

export const buildDeploymentCheckInRequest = ({
  dsn,
  monitorSlug,
  sourceSha,
  phase,
  checkInId,
  outcome = '',
  startedAt = '',
  now = Date.now(),
}) => {
  if (phase !== 'start' && phase !== 'finish')
    throw configurationError(
      'invalid_deployment_monitor_phase',
      'Deployment monitor phase must be start or finish.',
    );

  const normalizedCheckInId = normalizeCheckInId(checkInId);
  const normalizedSlug = normalizeMonitorSlug(monitorSlug);
  const normalizedSha = selectDeploySha({
    eventName: 'workflow_dispatch',
    manualSha: sourceSha,
  });
  const occurredAt = new Date(now);
  if (!Number.isFinite(now) || Number.isNaN(occurredAt.getTime()))
    throw configurationError(
      'invalid_deployment_monitor_time',
      'Deployment monitor time is malformed.',
    );

  const status = phase === 'start' ? 'in_progress' : finishedStatusFor(outcome);
  const checkIn = {
    check_in_id: normalizedCheckInId,
    monitor_slug: normalizedSlug,
    status,
    release: normalizedSha,
    environment: 'production',
  };

  if (phase === 'finish' && startedAt.length > 0) {
    const duration = (now - normalizeStartedAt(startedAt)) / 1_000;
    if (!Number.isFinite(duration) || duration < 0)
      throw configurationError(
        'invalid_deployment_monitor_duration',
        'Deployment monitor duration is malformed.',
      );
    checkIn.duration = duration;
  }

  return {
    checkInId: normalizedCheckInId,
    endpoint: parseSentryDsn(dsn),
    body: serializeCheckInEnvelope({ checkIn, occurredAt }),
  };
};

export const deliverDeploymentCheckIn = async (
  input,
  {
    fetchImpl = globalThis.fetch,
    timeoutSignal = () => AbortSignal.timeout(deliveryTimeoutMilliseconds),
  } = {},
) => {
  const request = buildDeploymentCheckInRequest(input);
  let response;
  try {
    response = await fetchImpl(request.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope' },
      body: request.body,
      redirect: 'error',
      signal: timeoutSignal(),
    });
  } catch {
    throw toolingError({
      code: 'deployment_monitor_delivery_failed',
      message: 'Deployment monitor delivery failed.',
    });
  }

  if (response?.ok !== true)
    throw toolingError({
      code: 'deployment_monitor_delivery_failed',
      message: 'Deployment monitor delivery failed.',
    });

  return request.checkInId;
};

const defaultPersistCheckIn = async ({ outputFile, checkInId, startedAt }) => {
  if (outputFile.length === 0)
    throw configurationError(
      'missing_deployment_monitor_output',
      'GitHub output path is required for deployment monitor start.',
    );

  await appendFile(
    outputFile,
    `check_in_id=${checkInId}\nstarted_at=${startedAt}\n`,
    'utf8',
  );
};

export const runDeploymentMonitorCli = async (
  { phase, environment = process.env },
  {
    fetchImpl = globalThis.fetch,
    makeCheckInId = () => randomUUID().replaceAll('-', ''),
    now = Date.now,
    persistCheckIn = defaultPersistCheckIn,
    timeoutSignal = () => AbortSignal.timeout(deliveryTimeoutMilliseconds),
    writeError = (message) => process.stderr.write(message),
  } = {},
) => {
  try {
    const startedAtNow = now();
    const checkInId =
      phase === 'start'
        ? normalizeCheckInId(makeCheckInId())
        : normalizeCheckInId(
            environment['DEPLOYMENT_MONITOR_CHECK_IN_ID'] ?? '',
          );

    if (phase === 'start')
      await persistCheckIn({
        outputFile: environment['GITHUB_OUTPUT'] ?? '',
        checkInId,
        startedAt: startedAtNow,
      });

    const sourceSha = selectDeploySha({
      eventName: environment['EVENT_NAME'] ?? '',
      workflowRunSha: environment['WORKFLOW_RUN_SHA'] ?? '',
      manualSha: environment['MANUAL_SHA'] ?? '',
    });

    await deliverDeploymentCheckIn(
      {
        dsn: environment['SENTRY_DEPLOYMENT_DSN'] ?? '',
        monitorSlug: environment['SENTRY_DEPLOYMENT_MONITOR_SLUG'] ?? '',
        sourceSha,
        phase,
        checkInId,
        outcome: environment['DEPLOY_OUTCOME'] ?? '',
        startedAt:
          phase === 'finish'
            ? (environment['DEPLOYMENT_MONITOR_STARTED_AT'] ?? '')
            : '',
        now: startedAtNow,
      },
      { fetchImpl, timeoutSignal },
    );

    return { delivered: true, checkInId };
  } catch {
    writeError(
      'Deployment telemetry unavailable; deployment result remains authoritative.\n',
    );
    return { delivered: false };
  }
};

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain)
  await runDeploymentMonitorCli({
    phase: process.argv[2] ?? '',
  });
