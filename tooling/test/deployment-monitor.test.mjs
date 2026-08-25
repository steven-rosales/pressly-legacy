import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  buildDeploymentCheckInRequest,
  deliverDeploymentCheckIn,
  runDeploymentMonitorCli,
} from '../scripts/deployment-monitor.mjs';

const root = resolve(import.meta.dirname, '../..');
const deploymentMonitorScript = resolve(
  root,
  'tooling/scripts/deployment-monitor.mjs',
);
const sourceSha = '0123456789abcdef0123456789abcdef01234567';
const checkInId = '1234567890abcdef1234567890abcdef';
const monitorSlug = 'pressly-production-deployment';
const dsn = 'https://public123@o123.ingest.sentry.io/456';
const now = Date.parse('2026-08-08T12:00:00.000Z');

const envelopeParts = (body) => {
  const [headers, itemHeaders, payload] = body
    .split('\n')
    .map((part) => JSON.parse(part));
  return { headers, itemHeaders, payload };
};

const requestInput = (overrides = {}) => ({
  dsn,
  monitorSlug,
  sourceSha,
  phase: 'start',
  checkInId,
  now,
  ...overrides,
});

describe('deployment monitor envelope', () => {
  it('sends a sanitized start check-in for the exact release SHA', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    const signal = {};

    await expect(
      deliverDeploymentCheckIn(requestInput(), {
        fetchImpl,
        timeoutSignal: () => signal,
      }),
    ).resolves.toBe(checkInId);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [endpoint, options] = fetchImpl.mock.calls[0];
    expect(endpoint).toBe(
      'https://o123.ingest.sentry.io/api/456/envelope/?sentry_version=7&sentry_key=public123&sentry_client=pressly-deployment-monitor%2F1.0.0',
    );
    expect(options).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope' },
      redirect: 'error',
      signal,
    });
    const envelope = envelopeParts(options.body);
    expect(envelope).toEqual({
      headers: {
        sent_at: '2026-08-08T12:00:00.000Z',
        sdk: { name: 'pressly-deployment-monitor', version: '1.0.0' },
      },
      itemHeaders: { type: 'check_in' },
      payload: {
        check_in_id: checkInId,
        monitor_slug: monitorSlug,
        status: 'in_progress',
        release: sourceSha,
        environment: 'production',
      },
    });
    expect(Object.keys(envelope.payload).sort()).toEqual([
      'check_in_id',
      'environment',
      'monitor_slug',
      'release',
      'status',
    ]);
  });

  it.each([
    ['success', 'ok'],
    ['failure', 'error'],
    ['cancelled', 'error'],
  ])('maps a %s workflow result to %s', (outcome, expectedStatus) => {
    const request = buildDeploymentCheckInRequest(
      requestInput({
        phase: 'finish',
        outcome,
        startedAt: String(now - 4_250),
      }),
    );

    expect(envelopeParts(request.body).payload).toEqual({
      check_in_id: checkInId,
      monitor_slug: monitorSlug,
      status: expectedStatus,
      release: sourceSha,
      environment: 'production',
      duration: 4.25,
    });
  });

  it('supports a self-hosted DSN path without retaining DSN credentials in the envelope', () => {
    const request = buildDeploymentCheckInRequest(
      requestInput({
        dsn: 'https://public123@sentry.example.test/observability/456',
      }),
    );

    expect(request.endpoint).toBe(
      'https://sentry.example.test/observability/api/456/envelope/?sentry_version=7&sentry_key=public123&sentry_client=pressly-deployment-monitor%2F1.0.0',
    );
    expect(request.body).not.toContain('public123');
    expect(request.body).not.toContain('sentry.example.test');
  });

  it.each([
    { sourceSha: 'main' },
    { monitorSlug: 'deployment monitor' },
    { monitorSlug: 'deployment\nsecret' },
    { monitorSlug: 'a'.repeat(51) },
    { dsn: 'http://public123@sentry.example.test/456' },
    { dsn: 'https://public123:private@sentry.example.test/456' },
    { dsn: 'https://public123@sentry.example.test/not-a-project' },
    { dsn: 'https://public123@sentry.example.test/456?token=secret' },
    { dsn: 'https://public123@sentry.example.test/456#secret' },
    {
      dsn: 'https://public123@sentry.example.test/observability%2Fsecret/456',
    },
    { phase: 'finish', outcome: 'timed_out' },
    {
      phase: 'finish',
      outcome: 'failure',
      startedAt: '$(printenv)',
    },
  ])('fails closed before fetching for malformed input %#', async (input) => {
    const fetchImpl = vi.fn();

    await expect(
      deliverDeploymentCheckIn(requestInput(input), { fetchImpl }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    async () => ({ ok: false, status: 429 }),
    async () => {
      throw new Error('network failure with an unsafe response');
    },
  ])(
    'classifies transport failures without exposing their details',
    async (fetchImpl) => {
      await expect(
        deliverDeploymentCheckIn(requestInput(), {
          fetchImpl,
          timeoutSignal: () => ({}),
        }),
      ).rejects.toThrow('Deployment monitor delivery failed.');
    },
  );

  it('does not read a rejected response body', async () => {
    const text = vi.fn(async () => 'unsafe response body');

    await expect(
      deliverDeploymentCheckIn(requestInput(), {
        fetchImpl: async () => ({ ok: false, status: 400, text }),
        timeoutSignal: () => ({}),
      }),
    ).rejects.toThrow('Deployment monitor delivery failed.');
    expect(text).not.toHaveBeenCalled();
  });
});

describe('best-effort deployment monitor process boundary', () => {
  const workflowEnvironment = (overrides = {}) => ({
    EVENT_NAME: 'workflow_run',
    WORKFLOW_RUN_SHA: sourceSha,
    MANUAL_SHA: '',
    GITHUB_OUTPUT: '/synthetic/github-output',
    SENTRY_DEPLOYMENT_DSN: dsn,
    SENTRY_DEPLOYMENT_MONITOR_SLUG: monitorSlug,
    ...overrides,
  });

  it('persists correlation before skipping a missing telemetry destination', async () => {
    const persistCheckIn = vi.fn(async () => undefined);
    const fetchImpl = vi.fn();
    const errors = [];

    await expect(
      runDeploymentMonitorCli(
        {
          phase: 'start',
          environment: workflowEnvironment({ SENTRY_DEPLOYMENT_DSN: '' }),
        },
        {
          fetchImpl,
          makeCheckInId: () => checkInId,
          now: () => now,
          persistCheckIn,
          writeError: (message) => errors.push(message),
        },
      ),
    ).resolves.toEqual({ delivered: false });

    expect(persistCheckIn).toHaveBeenCalledWith({
      outputFile: '/synthetic/github-output',
      checkInId,
      startedAt: now,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(errors).toEqual([
      'Deployment telemetry unavailable; deployment result remains authoritative.\n',
    ]);
  });

  it('exits successfully with fixed output when telemetry is not configured', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pressly-deploy-monitor-'));
    const githubOutput = join(directory, 'github-output');

    try {
      const result = spawnSync(
        process.execPath,
        [deploymentMonitorScript, 'start'],
        {
          encoding: 'utf8',
          env: workflowEnvironment({
            GITHUB_OUTPUT: githubOutput,
            SENTRY_DEPLOYMENT_DSN: '',
          }),
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(
        'Deployment telemetry unavailable; deployment result remains authoritative.\n',
      );
      expect(readFileSync(githubOutput, 'utf8')).toMatch(
        /^check_in_id=[0-9a-f]{32}\nstarted_at=\d{13}\n$/,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not invent an uncorrelated terminal check-in when start state is missing', async () => {
    const fetchImpl = vi.fn();

    await expect(
      runDeploymentMonitorCli(
        {
          phase: 'finish',
          environment: workflowEnvironment({
            DEPLOYMENT_MONITOR_CHECK_IN_ID: '',
            DEPLOY_OUTCOME: 'failure',
          }),
        },
        { fetchImpl, writeError: () => undefined },
      ),
    ).resolves.toEqual({ delivered: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never leaks a DSN or transport error content through its process output', async () => {
    const sentinelDsn = 'https://do-not-print-this-key@sentry.example.test/456';
    const sentinelResponse = 'do-not-print-this-response-or-customer-data';
    const errors = [];

    const result = await runDeploymentMonitorCli(
      {
        phase: 'start',
        environment: workflowEnvironment({
          SENTRY_DEPLOYMENT_DSN: sentinelDsn,
        }),
      },
      {
        fetchImpl: async () => {
          throw new Error(`${sentinelDsn} ${sentinelResponse}`);
        },
        makeCheckInId: () => checkInId,
        now: () => now,
        persistCheckIn: async () => undefined,
        timeoutSignal: () => ({}),
        writeError: (message) => errors.push(message),
      },
    );

    expect(result).toEqual({ delivered: false });
    const output = errors.join('');
    expect(output).toBe(
      'Deployment telemetry unavailable; deployment result remains authoritative.\n',
    );
    expect(output).not.toContain(sentinelDsn);
    expect(output).not.toContain('do-not-print-this-key');
    expect(output).not.toContain(sentinelResponse);
  });

  it('reuses one generated check-in ID for start and terminal delivery', async () => {
    const requests = [];
    const fetchImpl = async (_endpoint, options) => {
      requests.push(envelopeParts(options.body).payload);
      return { ok: true };
    };

    const started = await runDeploymentMonitorCli(
      {
        phase: 'start',
        environment: workflowEnvironment(),
      },
      {
        fetchImpl,
        makeCheckInId: () => checkInId,
        now: () => now,
        persistCheckIn: async () => undefined,
        timeoutSignal: () => ({}),
      },
    );
    const finished = await runDeploymentMonitorCli(
      {
        phase: 'finish',
        environment: workflowEnvironment({
          DEPLOYMENT_MONITOR_CHECK_IN_ID: checkInId,
          DEPLOYMENT_MONITOR_STARTED_AT: String(now),
          DEPLOY_OUTCOME: 'success',
        }),
      },
      {
        fetchImpl,
        now: () => now + 1_000,
        timeoutSignal: () => ({}),
      },
    );

    expect(started).toEqual({ delivered: true, checkInId });
    expect(finished).toEqual({ delivered: true, checkInId });
    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.check_in_id)).toEqual([
      checkInId,
      checkInId,
    ]);
    expect(requests.map((request) => request.release)).toEqual([
      sourceSha,
      sourceSha,
    ]);
    expect(requests.map((request) => request.status)).toEqual([
      'in_progress',
      'ok',
    ]);
  });
});

describe('deployment workflow monitor isolation', () => {
  it('reports before host mutation and always reports the authoritative terminal status', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/deploy-production.yml'),
      'utf8',
    );

    const start = workflow.indexOf('- name: Report deployment start');
    const resolveRef = workflow.indexOf('- name: Resolve deploy ref');
    const installSsh = workflow.indexOf('- name: Install SSH key');
    const deploy = workflow.indexOf('- name: Run deployment');
    const finish = workflow.indexOf('- name: Report deployment result');

    expect(start).toBeGreaterThan(0);
    expect(start).toBeLessThan(resolveRef);
    expect(resolveRef).toBeLessThan(installSsh);
    expect(deploy).toBeLessThan(finish);
    expect(workflow).toContain('if: ${{ always() }}');
    expect(workflow.match(/continue-on-error: true/g)).toHaveLength(2);
    expect(workflow).toContain('DEPLOY_OUTCOME: ${{ job.status }}');
    expect(workflow).toContain(
      'DEPLOYMENT_MONITOR_CHECK_IN_ID: ${{ steps.deployment-monitor.outputs.check_in_id }}',
    );
  });

  it('keeps the reporter outside the target release checkout and exposes no auth token', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/deploy-production.yml'),
      'utf8',
    );

    expect(workflow).toContain('path: release-source');
    expect(workflow).toContain(
      'node release-source/tooling/scripts/release-manifest.mjs',
    );
    expect(workflow).toContain(
      "local_deploy_script='release-source/deploy/aws/lightsail/deploy.sh'",
    );
    expect(
      workflow.match(/tooling\/scripts\/deployment-monitor\.mjs/g),
    ).toHaveLength(2);
    expect(workflow).toContain(
      'SENTRY_DEPLOYMENT_DSN: ${{ secrets.SENTRY_DEPLOYMENT_DSN }}',
    );
    expect(workflow).toContain(
      'SENTRY_DEPLOYMENT_MONITOR_SLUG: ${{ vars.SENTRY_DEPLOYMENT_MONITOR_SLUG }}',
    );
    expect(workflow).not.toContain('SENTRY_AUTH_TOKEN');
  });
});
