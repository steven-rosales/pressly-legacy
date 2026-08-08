import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const workflowPath = new URL('../../.github/workflows/ci.yml', import.meta.url);
const workflowSource = await readFile(workflowPath, 'utf8');
const nodeRuntimeDockerfiles = Object.fromEntries(
  await Promise.all(
    ['api', 'web', 'worker'].map(async (application) => [
      application,
      await readFile(
        new URL(`../../apps/${application}/Dockerfile`, import.meta.url),
        'utf8',
      ),
    ]),
  ),
);
const processorDockerfile = await readFile(
  new URL('../../apps/processor/Dockerfile', import.meta.url),
  'utf8',
);
const processorBuildConfig = await readFile(
  new URL('../../apps/processor/vite.config.ts', import.meta.url),
  'utf8',
);
const controlDockerfile = await readFile(
  new URL('../../apps/control/Dockerfile', import.meta.url),
  'utf8',
);
const controlBuildConfig = await readFile(
  new URL('../../apps/control/vite.config.ts', import.meta.url),
  'utf8',
);
const webBuildConfig = await readFile(
  new URL('../../apps/web/next.config.ts', import.meta.url),
  'utf8',
);
const restoreRunbook = await readFile(
  new URL('../../infra/aws/docs/restore-postgres.md', import.meta.url),
  'utf8',
);
const restoreScript = await readFile(
  new URL('../../infra/aws/lightsail/restore-postgres.sh', import.meta.url),
  'utf8',
);
const restoreProof = await readFile(
  new URL(
    '../../infra/aws/lightsail/restore-postgres-proof.sh',
    import.meta.url,
  ),
  'utf8',
);
const workflow = parse(workflowSource);
const production = workflow.jobs['production-artifacts'];
const productionSteps = production.steps;
const required = workflow.jobs.required;

const applications = {
  api: {
    build: 'Build API image once',
    sbom: 'Generate API SBOM',
    scan: 'Block critical API vulnerabilities',
  },
  web: {
    build: 'Build web image once',
    sbom: 'Generate web SBOM',
    scan: 'Block critical web vulnerabilities',
  },
  worker: {
    build: 'Build Worker image once',
    sbom: 'Generate Worker SBOM',
    scan: 'Block critical Worker vulnerabilities',
  },
  processor: {
    build: 'Build Processor image once',
    sbom: 'Generate Processor SBOM',
    scan: 'Block critical Processor vulnerabilities',
  },
  control: {
    build: 'Build Control image once',
    sbom: 'Generate Control SBOM',
    scan: 'Block critical Control vulnerabilities',
  },
};

const step = (name) => {
  const found = productionSteps.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`Missing CI step: ${name}`);
  return found;
};

const stepIndex = (name) =>
  productionSteps.findIndex((candidate) => candidate.name === name);

const runBash = (source, environment) =>
  spawnSync('bash', ['-c', source], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      ...environment,
    },
  });

const runtimeStage = (dockerfile) => {
  const runnerMarker = dockerfile.lastIndexOf(' AS runner');
  if (runnerMarker === -1) throw new Error('Dockerfile has no runner stage.');
  const stageStart = dockerfile.lastIndexOf('\nFROM ', runnerMarker);
  return dockerfile.slice(stageStart + 1);
};

describe('five-image CI release', () => {
  it('builds the process-owned bootstrap commands into the API tools image', () => {
    expect(nodeRuntimeDockerfiles.api).toContain(
      'pnpm turbo build --filter=@pressly/api... --filter=@pressly/cli...',
    );
  });

  it('keeps branch CI build-only for all five application images', () => {
    const branchJobs = [
      workflow.jobs['web-docker-build'],
      workflow.jobs['api-docker-build'],
      workflow.jobs['lpms-docker-build'],
    ];
    for (const job of branchJobs) {
      expect(job.if).toBe("github.ref != 'refs/heads/main'");
      expect(job.needs).toEqual(['integration-tests', 'browser-e2e']);
      expect(JSON.stringify(job.steps)).not.toContain('docker/login-action');
      expect(JSON.stringify(job.steps)).not.toContain('docker push');
    }

    expect(
      workflow.jobs['web-docker-build'].steps.find(
        (candidate) => candidate.name === 'Build web image',
      ).with,
    ).toMatchObject({ file: 'apps/web/Dockerfile', push: false });
    expect(
      workflow.jobs['api-docker-build'].steps.find(
        (candidate) => candidate.name === 'Build API image',
      ).with,
    ).toMatchObject({
      file: 'apps/api/Dockerfile',
      target: 'runner',
      push: false,
    });
    expect(workflow.jobs['lpms-docker-build'].strategy.matrix.app).toEqual([
      'worker',
      'processor',
      'control',
    ]);
    expect(
      workflow.jobs['lpms-docker-build'].steps.find(
        (candidate) => candidate.name === 'Build LPMS image',
      ).with,
    ).toMatchObject({
      file: 'apps/${{ matrix.app }}/Dockerfile',
      target: 'runner',
      push: false,
    });
  });

  it('builds each main release image once and binds it to one source SHA', () => {
    expect(production.if).toBe(
      "github.event_name == 'push' && github.ref == 'refs/heads/main'",
    );
    expect(production.needs).toEqual(['integration-tests', 'browser-e2e']);
    expect(workflow.jobs['integration-tests'].needs).toEqual(['quality']);
    expect(workflow.jobs['browser-e2e'].needs).toEqual(['quality']);
    expect(
      workflow.jobs['integration-tests'].steps.find(
        (candidate) =>
          candidate.name === 'LPMS production repository integration tests',
      )?.run,
    ).toBe('pnpm -F @pressly/production test:integration');

    const resolveImages = step('Resolve image names').run;
    for (const [application, names] of Object.entries(applications)) {
      const builds = productionSteps.filter(
        (candidate) => candidate.name === names.build,
      );
      expect(builds).toHaveLength(1);
      expect(builds[0].with).toMatchObject({
        file: `apps/${application}/Dockerfile`,
        target: 'runner',
        load: true,
        tags: `\${{ steps.images.outputs.${application}_tag }}`,
        labels: 'org.opencontainers.image.revision=${{ github.sha }}',
      });
      expect(resolveImages).toContain(
        `${application}_tag=ghcr.io/$repository/${application}:$GITHUB_SHA`,
      );
    }

    const verifySource = step('Verify all images carry the release source SHA');
    expect(verifySource.run).toContain('docker image inspect');
    expect(verifySource.run).toContain('org.opencontainers.image.revision');
    expect(verifySource.run).toContain('"$revision" != "$GITHUB_SHA"');
    expect(stepIndex(verifySource.name)).toBeGreaterThan(
      Math.max(
        ...Object.values(applications).map(({ build }) => stepIndex(build)),
      ),
    );
    expect(stepIndex(verifySource.name)).toBeLessThan(
      stepIndex('Generate API SBOM'),
    );
  });

  it('requires a dedicated release environment and validates telemetry before any image build', () => {
    expect(production.environment).toBe('release-production');

    const validation = step('Validate release telemetry configuration');
    expect(validation.env).toEqual({
      NEXT_PUBLIC_SENTRY_DSN: '${{ secrets.NEXT_PUBLIC_SENTRY_DSN }}',
      PROCESSOR_SENTRY_DSN: '${{ secrets.PROCESSOR_SENTRY_DSN }}',
      CONTROL_SENTRY_DSN: '${{ secrets.CONTROL_SENTRY_DSN }}',
      SENTRY_AUTH_TOKEN: '${{ secrets.SENTRY_AUTH_TOKEN }}',
      SENTRY_ORG: '${{ vars.SENTRY_ORG }}',
      PROCESSOR_SENTRY_PROJECT: '${{ vars.PROCESSOR_SENTRY_PROJECT }}',
      CONTROL_SENTRY_PROJECT: '${{ vars.CONTROL_SENTRY_PROJECT }}',
    });
    expect(stepIndex(validation.name)).toBeLessThan(
      Math.min(
        ...Object.values(applications).map(({ build }) => stepIndex(build)),
      ),
    );
    expect(workflowSource).not.toContain(
      "vars.SENTRY_ORG || 'pressly-laundry-service-dry-cl'",
    );
    expect(workflowSource).not.toContain(
      "vars.PROCESSOR_SENTRY_PROJECT || 'pressly-processor'",
    );

    const validEnvironment = {
      NEXT_PUBLIC_SENTRY_DSN:
        'https://web-private-key@o123.ingest.us.sentry.io/123',
      PROCESSOR_SENTRY_DSN:
        'https://processor-private-key@o123.ingest.us.sentry.io/456',
      CONTROL_SENTRY_DSN:
        'https://control-private-key@o123.ingest.us.sentry.io/789',
      SENTRY_AUTH_TOKEN: 'sntrys_valid_release_upload_token',
      SENTRY_ORG: 'pressly-laundry-service-dry-cl',
      PROCESSOR_SENTRY_PROJECT: 'pressly-processor',
      CONTROL_SENTRY_PROJECT: 'pressly-control',
    };
    const valid = runBash(validation.run, validEnvironment);
    expect(valid.status, valid.stderr).toBe(0);
    expect(valid.stdout).toBe('');
    expect(valid.stderr).toBe('');

    for (const name of Object.keys(validEnvironment)) {
      const missing = runBash(validation.run, {
        ...validEnvironment,
        [name]: ' ',
      });
      expect(missing.status, name).not.toBe(0);
      expect(missing.stderr, name).toContain(name);
      for (const value of Object.values(validEnvironment))
        expect(`${missing.stdout}${missing.stderr}`, name).not.toContain(value);
    }

    const invalidDsn = runBash(validation.run, {
      ...validEnvironment,
      PROCESSOR_SENTRY_DSN:
        'https://processor-private-key@o123.ingest.us.sentry.io/not-a-project',
    });
    expect(invalidDsn.status).not.toBe(0);
    expect(invalidDsn.stderr).toContain('PROCESSOR_SENTRY_DSN');
    expect(invalidDsn.stderr).not.toContain('processor-private-key');

    const invalidControlDsn = runBash(validation.run, {
      ...validEnvironment,
      CONTROL_SENTRY_DSN:
        'https://control-private-key@o123.ingest.us.sentry.io/not-a-project',
    });
    expect(invalidControlDsn.status).not.toBe(0);
    expect(invalidControlDsn.stderr).toContain('CONTROL_SENTRY_DSN');
    expect(invalidControlDsn.stderr).not.toContain('control-private-key');
  });

  it('builds Web, Processor, and Control telemetry without embedding the upload token', () => {
    const webBuild = step('Build web image once').with;
    expect(webBuild['build-args']).toContain('NEXT_PUBLIC_SENTRY_DSN=');
    expect(webBuild['build-args']).toContain(
      'SENTRY_RELEASE=${{ github.sha }}',
    );
    expect(webBuild.secrets).toContain(
      'sentry_auth_token=${{ secrets.SENTRY_AUTH_TOKEN }}',
    );
    expect(webBuild['build-args']).not.toContain('SENTRY_AUTH_TOKEN=');
    expect(nodeRuntimeDockerfiles.web).toContain(
      '--mount=type=secret,id=sentry_auth_token',
    );
    expect(nodeRuntimeDockerfiles.web).not.toMatch(/ARG SENTRY_AUTH_TOKEN/);
    expect(nodeRuntimeDockerfiles.web).not.toMatch(/ENV SENTRY_AUTH_TOKEN/);
    expect(
      nodeRuntimeDockerfiles.web.match(/ARG SENTRY_RELEASE/g),
    ).toHaveLength(2);
    expect(
      nodeRuntimeDockerfiles.web.match(/ENV SENTRY_RELEASE=\$SENTRY_RELEASE/g),
    ).toHaveLength(2);

    const processorBuild = step('Build Processor image once').with;
    expect(processorBuild['build-args']).toContain(
      'VITE_SENTRY_RELEASE=${{ github.sha }}',
    );
    expect(processorBuild['build-args']).toContain(
      'VITE_SENTRY_ENVIRONMENT=production',
    );
    expect(processorBuild['build-args']).toContain('VITE_SENTRY_DSN=');
    expect(processorBuild['build-args']).toContain('SENTRY_ORG=');
    expect(processorBuild['build-args']).toContain('SENTRY_PROJECT=');
    expect(processorBuild.secrets).toContain(
      'sentry_auth_token=${{ secrets.SENTRY_AUTH_TOKEN }}',
    );
    expect(processorBuild['build-args']).not.toContain('SENTRY_AUTH_TOKEN=');

    expect(processorDockerfile).toContain(
      '--mount=type=secret,id=sentry_auth_token',
    );
    expect(processorDockerfile).not.toMatch(/ARG SENTRY_AUTH_TOKEN/);
    expect(processorDockerfile).not.toMatch(/ENV SENTRY_AUTH_TOKEN/);
    expect(processorDockerfile).toContain(
      'pnpm exec turbo build --filter=@pressly/processor^... --concurrency=2',
    );
    expect(processorDockerfile).toContain(
      'pnpm --filter @pressly/processor build',
    );
    expect(processorDockerfile).not.toContain(
      'pnpm exec turbo build --filter=@pressly/processor... --concurrency=2',
    );
    expect(
      processorDockerfile.indexOf('export SENTRY_AUTH_TOKEN='),
    ).toBeLessThan(
      processorDockerfile.indexOf('pnpm --filter @pressly/processor build'),
    );

    const controlBuild = step('Build Control image once').with;
    expect(controlBuild['build-args']).toContain(
      'VITE_SENTRY_RELEASE=${{ github.sha }}',
    );
    expect(controlBuild['build-args']).toContain(
      'VITE_SENTRY_ENVIRONMENT=production',
    );
    expect(controlBuild['build-args']).toContain('VITE_SENTRY_DSN=');
    expect(controlBuild['build-args']).toContain('SENTRY_ORG=');
    expect(controlBuild['build-args']).toContain('SENTRY_PROJECT=');
    expect(controlBuild.secrets).toContain(
      'sentry_auth_token=${{ secrets.SENTRY_AUTH_TOKEN }}',
    );
    expect(controlBuild['build-args']).not.toContain('SENTRY_AUTH_TOKEN=');

    expect(controlDockerfile).toContain(
      '--mount=type=secret,id=sentry_auth_token',
    );
    expect(controlDockerfile).not.toMatch(/ARG SENTRY_AUTH_TOKEN/);
    expect(controlDockerfile).not.toMatch(/ENV SENTRY_AUTH_TOKEN/);
    expect(controlDockerfile).toContain(
      'pnpm exec turbo build --filter=@pressly/control^... --concurrency=2',
    );
    expect(controlDockerfile).toContain('pnpm --filter @pressly/control build');
    expect(controlDockerfile).not.toContain(
      'pnpm exec turbo build --filter=@pressly/control... --concurrency=2',
    );
    expect(controlDockerfile.indexOf('export SENTRY_AUTH_TOKEN=')).toBeLessThan(
      controlDockerfile.indexOf('pnpm --filter @pressly/control build'),
    );
  });

  it('fails Web, Processor, and Control release builds when Sentry upload fails', () => {
    for (const buildConfig of [
      webBuildConfig,
      processorBuildConfig,
      controlBuildConfig,
    ]) {
      expect(buildConfig).toMatch(
        /errorHandler: \(error\) => \{\s+throw error;?\s+\}/,
      );
    }
    for (const buildConfig of [processorBuildConfig, controlBuildConfig])
      expect(buildConfig).toContain(
        'filesToDeleteAfterUpload: "./dist/**/*.map"',
      );
  });

  it('exposes one stable required check covering browser and every branch-specific image path', () => {
    expect(required.name).toBe('ci required');
    expect(required.if).toBe('always()');
    expect(required.needs).toEqual([
      'quality',
      'integration-tests',
      'browser-e2e',
      'web-docker-build',
      'api-docker-build',
      'lpms-docker-build',
      'production-artifacts',
    ]);

    const gate = required.steps.find(
      (candidate) => candidate.name === 'Verify required CI paths',
    );
    expect(gate.env.BROWSER_RESULT).toBe('${{ needs.browser-e2e.result }}');
    expect(gate.env.LPMS_BUILD_RESULT).toBe(
      '${{ needs.lpms-docker-build.result }}',
    );

    const baseResults = {
      QUALITY_RESULT: 'success',
      INTEGRATION_RESULT: 'success',
      BROWSER_RESULT: 'success',
    };
    const mainPush = runBash(gate.run, {
      ...baseResults,
      EVENT_NAME: 'push',
      REF: 'refs/heads/main',
      WEB_BUILD_RESULT: 'skipped',
      API_BUILD_RESULT: 'skipped',
      LPMS_BUILD_RESULT: 'skipped',
      PRODUCTION_RESULT: 'success',
    });
    expect(mainPush.status, mainPush.stderr).toBe(0);

    const pullRequest = runBash(gate.run, {
      ...baseResults,
      EVENT_NAME: 'pull_request',
      REF: 'refs/pull/31/merge',
      WEB_BUILD_RESULT: 'success',
      API_BUILD_RESULT: 'success',
      LPMS_BUILD_RESULT: 'success',
      PRODUCTION_RESULT: 'skipped',
    });
    expect(pullRequest.status, pullRequest.stderr).toBe(0);

    const skippedControlMatrix = runBash(gate.run, {
      ...baseResults,
      EVENT_NAME: 'pull_request',
      REF: 'refs/pull/31/merge',
      WEB_BUILD_RESULT: 'success',
      API_BUILD_RESULT: 'success',
      LPMS_BUILD_RESULT: 'skipped',
      PRODUCTION_RESULT: 'skipped',
    });
    expect(skippedControlMatrix.status).not.toBe(0);
    expect(skippedControlMatrix.stderr).toContain('lpms-docker-build');

    const failedBrowser = runBash(gate.run, {
      ...baseResults,
      EVENT_NAME: 'pull_request',
      REF: 'refs/pull/31/merge',
      BROWSER_RESULT: 'failure',
      WEB_BUILD_RESULT: 'skipped',
      API_BUILD_RESULT: 'skipped',
      LPMS_BUILD_RESULT: 'skipped',
      PRODUCTION_RESULT: 'skipped',
    });
    expect(failedBrowser.status).not.toBe(0);
    expect(failedBrowser.stderr).toContain('browser-e2e');
  });

  it('keeps build-only package managers out of every Node runtime image', () => {
    const removedRuntimePaths = [
      '/pnpm',
      '/root/.cache/node/corepack',
      '/usr/local/lib/node_modules/corepack',
      '/usr/local/lib/node_modules/npm',
      '/usr/local/bin/corepack',
      '/usr/local/bin/npm',
      '/usr/local/bin/npx',
      '/usr/local/bin/pnpm',
      '/usr/local/bin/pnpx',
      '/usr/local/bin/yarn',
      '/usr/local/bin/yarnpkg',
      '/opt/yarn-v1.22.22',
    ];

    for (const [application, dockerfile] of Object.entries(
      nodeRuntimeDockerfiles,
    )) {
      const runner = runtimeStage(dockerfile);
      const cleanupStart = runner.indexOf('RUN rm -rf');
      const userStart = runner.indexOf('\nUSER ');
      expect(
        cleanupStart,
        `${application} runtime cleanup`,
      ).toBeGreaterThanOrEqual(0);
      expect(userStart, `${application} non-root user`).toBeGreaterThan(
        cleanupStart,
      );
      const cleanup = runner.slice(cleanupStart, userStart);
      for (const path of removedRuntimePaths)
        expect(cleanup, `${application} removes ${path}`).toContain(path);
    }
  });

  it('generates five SBOMs and blocks every critical scan before publishing', () => {
    const publishIndex = stepIndex('Publish verified images');
    const loginIndex = stepIndex('Log in to GitHub Container Registry');
    const scanIndexes = [];

    for (const [application, names] of Object.entries(applications)) {
      expect(step(names.sbom).with).toMatchObject({
        image: `\${{ steps.images.outputs.${application}_tag }}`,
        format: 'spdx-json',
        'output-file': `artifacts/${application}.spdx.json`,
        'upload-artifact': false,
      });
      expect(step(names.scan).with).toMatchObject({
        'image-ref': `\${{ steps.images.outputs.${application}_tag }}`,
        'exit-code': '1',
        severity: 'CRITICAL',
        'vuln-type': 'os,library',
      });
      expect(stepIndex(names.scan)).toBeLessThan(publishIndex);
      scanIndexes.push(stepIndex(names.scan));
    }

    expect(Math.max(...scanIndexes)).toBeLessThan(loginIndex);
    expect(loginIndex).toBeLessThan(publishIndex);
    const publish = step('Publish verified images');
    expect(publish.run.match(/push_image "\$[A-Z]+_TAG"/g)).toHaveLength(5);
    expect(publish.run).toContain('for attempt in 1 2 3');
    expect(publish.run).toContain('if docker push "$image"; then');
    expect(publish.run).toContain('delay_seconds=$((attempt * 5))');
    expect(publish.run).toContain(
      'Image publication failed after 3 attempts: $image',
    );
    expect(
      productionSteps
        .slice(0, publishIndex)
        .filter((candidate) => candidate.name.startsWith('Block critical ')),
    ).toHaveLength(5);
  });

  it('retries each immutable image independently after a registry failure', () => {
    const publish = step('Publish verified images');
    const exercised = runBash(
      `
        declare -A attempts=()
        docker() {
          local image="$2"
          attempts["$image"]=$((\${attempts["$image"]:-0} + 1))
          printf 'push %s %s\n' "$image" "\${attempts["$image"]}"
          (( attempts["$image"] > 1 ))
        }
        sleep() { printf 'sleep %s\n' "$1"; }
        ${publish.run}
        for image in "$API_TAG" "$WEB_TAG" "$WORKER_TAG" "$PROCESSOR_TAG" "$CONTROL_TAG"; do
          [[ \${attempts["$image"]} == 2 ]]
        done
      `,
      {
        API_TAG: 'ghcr.io/pressly/api:release',
        WEB_TAG: 'ghcr.io/pressly/web:release',
        WORKER_TAG: 'ghcr.io/pressly/worker:release',
        PROCESSOR_TAG: 'ghcr.io/pressly/processor:release',
        CONTROL_TAG: 'ghcr.io/pressly/control:release',
      },
    );

    expect(exercised.status).toBe(0);
    expect(exercised.stdout.match(/^push /gm)).toHaveLength(10);
    expect(exercised.stdout.match(/^sleep 5$/gm)).toHaveLength(5);
  });

  it('fails closed after three publication attempts for one image', () => {
    const publish = step('Publish verified images');
    const failed = runBash(
      `
        docker() { printf 'push failed\n'; return 1; }
        sleep() { :; }
        ${publish.run}
      `,
      {
        API_TAG: 'ghcr.io/pressly/api:release',
        WEB_TAG: 'ghcr.io/pressly/web:release',
        WORKER_TAG: 'ghcr.io/pressly/worker:release',
        PROCESSOR_TAG: 'ghcr.io/pressly/processor:release',
        CONTROL_TAG: 'ghcr.io/pressly/control:release',
      },
    );

    expect(failed.status).not.toBe(0);
    expect(failed.stdout.match(/^push failed$/gm)).toHaveLength(3);
    expect(failed.stderr).toContain(
      'Image publication failed after 3 attempts: ghcr.io/pressly/api:release',
    );
  });

  it('records registry digests and uploads one exact five-image release artifact', () => {
    const publishIndex = stepIndex('Publish verified images');
    const manifestIndex = stepIndex('Record immutable release manifest');
    const uploadIndex = stepIndex('Upload release evidence');
    expect(publishIndex).toBeLessThan(manifestIndex);
    expect(manifestIndex).toBeLessThan(uploadIndex);

    const manifest = step('Record immutable release manifest').run;
    expect(manifest).toContain('docker buildx imagetools inspect');
    expect(manifest).toContain('^sha256:[0-9a-f]{64}$');
    expect(manifest).toContain('export SOURCE_SHA="$GITHUB_SHA"');
    expect(manifest).toContain('EXPECTED_SOURCE_SHA="$GITHUB_SHA"');
    expect(manifest).toContain('docker pull "$image"');
    expect(manifest).toContain('verify_registry_revision "$image"');
    expect(manifest).toContain(
      'Registry image $image was built from $revision, expected $GITHUB_SHA.',
    );
    for (const application of Object.keys(applications))
      expect(manifest).toContain(
        `export ${application.toUpperCase()}_IMAGE="$(resolve_digest "$${application.toUpperCase()}_TAG")"`,
      );
    expect(manifest).toContain(
      'node tooling/scripts/release-manifest.mjs create > artifacts/release.json',
    );
    expect(manifest).toContain(
      'node tooling/scripts/release-manifest.mjs validate artifacts/release.json',
    );

    expect(step('Upload release evidence').with).toMatchObject({
      name: 'production-release',
      path: 'artifacts/',
      'if-no-files-found': 'error',
      'retention-days': 90,
    });
    expect(workflowSource.match(/artifacts\/[a-z]+\.spdx\.json/g)).toHaveLength(
      5,
    );
  });
});

describe('production restore runbook', () => {
  it('fences public ingress and every current database writer without misclassifying frontends', () => {
    expect(restoreRunbook).toContain('current database-writing services');
    expect(restoreRunbook).toContain('API and Worker');
    expect(restoreRunbook).toMatch(/frontends, not database writers\./);
    expect(restoreRunbook).toContain('also stops Caddy');
    expect(restoreScript).toContain('compose stop caddy api worker');
    expect(restoreScript).toContain(
      'compose stop caddy api worker >/dev/null 2>&1 || true',
    );
    expect(restoreScript).toContain(
      'REVOKE CONNECT ON DATABASE %I FROM pressly_runtime',
    );
  });

  it('restores a clean candidate and validates it before promotion or restart', () => {
    const restoreIndex = restoreScript.indexOf('restore pg_restore');
    const migrateIndex = restoreScript.indexOf(
      'migrate node node_modules/drizzle-kit/bin.cjs migrate',
    );
    const candidateValidationIndex = restoreScript.indexOf(
      'validate_database "$CANDIDATE_DATABASE"',
    );
    const promotionIndex = restoreScript.indexOf(
      "echo 'Promoting the validated candidate",
    );
    const finishStart = restoreScript.indexOf('finish_restore() {');
    const finishEnd = restoreScript.indexOf('\n}', finishStart);
    const finishSource = restoreScript.slice(finishStart, finishEnd);
    const writerStartIndex = finishSource.indexOf(
      'compose up -d --wait api worker',
    );
    const ingressStartIndex = finishSource.indexOf(
      'compose up -d --wait caddy',
    );

    expect(restoreScript).toContain(
      'postgres_exec createdb -U "$POSTGRES_USER" --template=template0 "$CANDIDATE_DATABASE"',
    );
    expect(restoreScript).toContain('drop schema if exists drizzle cascade');
    expect(restoreScript).not.toContain('drop schema if exists public cascade');
    expect(restoreScript).toContain('--no-owner');
    expect(restoreScript).toContain('--no-privileges');
    expect(restoreScript).toContain('configure_roles "$CANDIDATE_DATABASE"');
    expect(restoreScript).toContain('source "$COMPOSE_ENV_FILE"');
    expect(restoreScript).toContain(
      'repository checkout is $CHECKOUT_SHA; release is $PRESSLY_RELEASE_SHA.',
    );
    expect(restoreScript).toContain('must be an immutable digest reference.');
    expect(restoreScript).toContain('expected the $application repository.');
    expect(restoreScript).toContain(
      'application image digest is reused across release bindings',
    );
    expect(restoreScript).toContain('org.opencontainers.image.revision');
    expect(restoreScript).toContain("--write-out '%{http_code}'");
    expect(restoreScript).toContain('[[ "$http_status" =~ ^2[0-9]{2}$ ]]');
    expect(restoreScript).toContain(
      '^pressly-[0-9]{8}T[0-9]{6}Z\\.dump\\.gpg$',
    );
    expect(restoreIndex).toBeGreaterThanOrEqual(0);
    expect(migrateIndex).toBeGreaterThan(restoreIndex);
    expect(candidateValidationIndex).toBeGreaterThan(migrateIndex);
    expect(promotionIndex).toBeGreaterThan(candidateValidationIndex);
    expect(restoreScript).toMatch(/complete_cutover\n\s+finish_restore/);
    expect(writerStartIndex).toBeGreaterThanOrEqual(0);
    expect(ingressStartIndex).toBeGreaterThan(writerStartIndex);
  });

  it('retains the old database and has a disposable encrypted proof', () => {
    expect(restoreScript).toContain('QUARANTINE_DATABASE=');
    expect(restoreScript).toContain(
      'Remove the quarantined database only after explicit retention approval.',
    );
    expect(restoreProof).toContain(
      'pg_dump --format=custom --compress=9 --no-owner --no-privileges',
    );
    expect(restoreProof).toContain('gpg --symmetric --cipher-algo AES256');
    expect(restoreProof).toContain("'after-backup'");
    expect(restoreProof).toContain('"$RESTORE_SCRIPT" "$BACKUP_FILE"');
    expect(restoreProof).toContain('PRESSLY_RESTORE_RESUME_SERVICES=false');
    expect(restoreRunbook).toContain(
      'It still replaces `POSTGRES_DB` with the restored candidate',
    );
  });

  it('proves real role reads and harmlessly rejected writes', () => {
    expect(restoreScript).toContain(
      'select count(*) >= 0 from public.auth_identities;',
    );
    expect(restoreScript).toContain(
      'select count(*) >= 0 from drizzle.__drizzle_migrations',
    );
    expect(restoreScript).toContain(
      'create table public.pressly_restore_runtime_ddl_probe',
    );
    expect(restoreScript).toContain(
      'update public.auth_identities set id = id where false',
    );
    expect(restoreScript).toContain(
      'delete from public.auth_identities where false',
    );
  });

  it('serializes against deploy, rollback, and backup before Compose mutation', () => {
    const deploymentLockIndex = restoreScript.indexOf(
      'exec 9> "$DEPLOY_LOCK_FILE"',
    );
    const backupLockIndex = restoreScript.indexOf(
      'exec 8> "$BACKUP_LOCK_FILE"',
    );
    const composeMutationIndex = restoreScript.indexOf(
      'compose up -d --wait postgres',
    );

    expect(restoreScript).toContain(
      'PRESSLY_DEPLOY_LOCK_FILE:-$APP_ROOT/deploy.lock',
    );
    expect(restoreScript).toContain(
      'PRESSLY_OPERATION_LOCK_DIR:-$APP_ROOT/run',
    );
    expect(restoreScript).toContain('postgres-backup.lock');
    expect(restoreScript.match(/if ! flock -n [89]; then/g)).toHaveLength(2);
    expect(restoreScript.match(/exit 75/g)).toHaveLength(2);
    expect(deploymentLockIndex).toBeGreaterThanOrEqual(0);
    expect(backupLockIndex).toBeGreaterThan(deploymentLockIndex);
    expect(composeMutationIndex).toBeGreaterThan(backupLockIndex);
  });

  it('derives the exact release identity from verified durable metadata', () => {
    const sourceIndex = restoreScript.indexOf('source "$ROLE_ENV_FILE"');
    const identityIndex = restoreScript.indexOf('RELEASE_IDENTITY="$({');
    const composeConfigIndex = restoreScript.indexOf('compose config --quiet');

    expect(restoreScript).toContain('CURRENT_RELEASE_FILE=');
    expect(restoreScript).toContain('CURRENT_RELEASE_METADATA_FILE=');
    expect(restoreScript).toContain('DEPLOYMENT_STATE_FILE=');
    expect(restoreScript).toContain('object_pairs_hook=unique_object');
    expect(restoreScript).toContain("('verified', 'succeeded', 0)");
    expect(restoreScript).toContain(
      'deployment state does not match current release metadata',
    );
    expect(restoreScript).toContain(
      'application image repositories must be distinct',
    );
    expect(restoreScript).toContain(
      'application image digests must be distinct',
    );
    expect(identityIndex).toBeGreaterThan(sourceIndex);
    expect(composeConfigIndex).toBeGreaterThan(identityIndex);
    expect(restoreProof).toContain('caller-stale-api:latest');
    expect(restoreProof).toContain('authoritative_release_metadata=passed');
  });

  it('rejects dirty recovery inputs and journals a crash-resumable cutover', () => {
    const journalStartIndex = restoreScript.indexOf(
      'restore_journal_operation \\\n    start',
    );
    const postgresStartIndex = restoreScript.indexOf(
      'compose up -d --wait postgres',
    );
    const writerStopIndex = restoreScript.indexOf(
      'compose stop caddy api worker',
      journalStartIndex,
    );

    expect(restoreScript).toContain(
      'status --porcelain --untracked-files=all --',
    );
    expect(restoreScript).toContain('"$MIGRATION_DIR"');
    expect(restoreScript).toContain('RESTORE_JOURNAL_FILE=');
    expect(restoreScript).toContain(
      'RESTORE_JOURNAL_CANONICAL="$(readlink -m -- "$RESTORE_JOURNAL_FILE")"',
    );
    expect(restoreScript).toContain(
      '"$RESTORE_JOURNAL_FILE" -ef "$RESTORE_EVIDENCE_FILE"',
    );
    expect(restoreScript).toContain('os.fsync(handle.fileno())');
    expect(restoreScript).toContain('os.fsync(directory_descriptor)');
    expect(restoreScript).toContain('write_restore_phase candidate_ready');
    expect(journalStartIndex).toBeGreaterThanOrEqual(0);
    expect(writerStopIndex).toBeGreaterThan(journalStartIndex);
    expect(postgresStartIndex).toBeGreaterThan(writerStopIndex);
    expect(postgresStartIndex).toBeGreaterThan(journalStartIndex);
    expect(restoreScript).toContain('TEST_FAIL_BEFORE_JOURNAL');
    expect(restoreProof).toContain('PRE_JOURNAL_POSTGRES_ID');
    expect(restoreScript).toContain('proof_kill_after after_target_rename');
    expect(restoreScript).toContain('proof_kill_after after_candidate_rename');
    expect(restoreProof).toContain(
      "run_killed_restore after_target_rename candidate_ready '0|1|1'",
    );
    expect(restoreProof).toContain(
      "run_killed_restore after_candidate_rename target_quarantined '1|0|1'",
    );
  });

  it('binds public recovery health to the provisioned host identity', () => {
    const composeConfigIndex = restoreScript.indexOf('compose config --quiet');
    const dnsPreflightIndex = restoreScript.indexOf(
      'preflight_public_health_hostnames',
      composeConfigIndex,
    );
    const journalStartIndex = restoreScript.indexOf(
      'restore_journal_operation \\\n    start',
    );

    expect(restoreScript).toContain('/etc/pressly/host-identity.json');
    expect(restoreScript).toContain(
      'host identity must be root-owned mode 0644',
    );
    expect(restoreScript).toContain(
      'host identity directory must be root-owned and not group/world writable',
    );
    expect(restoreScript).toContain(
      "'publicHealthTarget': public_health_target",
    );
    expect(restoreScript).toContain('getent ahostsv4 "$hostname"');
    expect(restoreScript).toContain('expected_address_found=true');
    expect(restoreScript).toContain('unexpected_address_found=true');
    expect(restoreScript).toContain(
      '--resolve "$hostname:443:$EXPECTED_PUBLIC_IP"',
    );
    expect(dnsPreflightIndex).toBeGreaterThan(composeConfigIndex);
    expect(dnsPreflightIndex).toBeLessThan(journalStartIndex);
    expect(restoreProof).toContain('HOST_IDENTITY_SNAPSHOT_FILE');
    expect(restoreProof).toContain(
      'publicHealthTarget does not match this invocation',
    );
  });

  it('brackets final public health with exclusive DNS checks', () => {
    const finishStart = restoreScript.indexOf('finish_restore()');
    const abortStart = restoreScript.indexOf(
      'if [[ "$ABORT_PRE_CUTOVER" == true ]]',
      finishStart,
    );
    const finish = restoreScript.slice(finishStart, abortStart);
    const abort = restoreScript.slice(abortStart);

    for (const block of [finish, abort]) {
      const caddyStart = block.indexOf('fenced_compose up -d --wait caddy');
      const dnsBefore = block.indexOf(
        'preflight_public_health_hostnames',
        caddyStart,
      );
      const apiHealth = block.indexOf('wait_for_public_health API', dnsBefore);
      const controlHealth = block.indexOf(
        'wait_for_public_health Control',
        apiHealth,
      );
      const dnsAfter = block.indexOf(
        'preflight_public_health_hostnames',
        controlHealth,
      );

      expect(caddyStart).toBeGreaterThanOrEqual(0);
      expect(dnsBefore).toBeGreaterThan(caddyStart);
      expect(apiHealth).toBeGreaterThan(dnsBefore);
      expect(controlHealth).toBeGreaterThan(apiHealth);
      expect(dnsAfter).toBeGreaterThan(controlHealth);
    }

    expect(
      finish.indexOf('reconcile_schema1_deployment_state'),
    ).toBeGreaterThan(finish.lastIndexOf('preflight_public_health_hostnames'));
    expect(abort.indexOf('write_restore_phase aborting')).toBeLessThan(
      abort.indexOf('fenced_compose up -d --wait api worker'),
    );
  });

  it('keeps service restart policies fenced across public-verification crashes', () => {
    expect(restoreScript).toContain(
      'proof_kill_after before_public_verification',
    );
    expect(restoreScript).toContain('proof_kill_after after_public_verified');
    expect(restoreScript).toContain('docker update --restart=no');
    expect(restoreScript).toContain('docker update --restart=unless-stopped');
    expect(restoreProof).toContain('FENCE_PRE_PUBLIC_STATUS');
    expect(restoreProof).toContain('FENCE_PUBLIC_VERIFIED_STATUS');
    expect(restoreProof).toContain("== 'no no no'");
    expect(restoreProof).toContain(
      "== 'unless-stopped unless-stopped unless-stopped'",
    );
    expect(restoreProof).toContain(
      'public_verified_admission=verified,running_unverified',
    );
    expect(restoreProof).toContain(
      'write_public_verified_journal running_unverified',
    );
    expect(restoreProof).toContain('write_public_verified_journal verified');
  });

  it('supports exact pre-cutover abort and first-rollout bundle recovery', () => {
    expect(restoreScript).toContain('--abort-pre-cutover');
    expect(restoreScript).toContain("'aborting': {'aborting'}");
    expect(restoreScript).toContain(
      'proof_kill_after after_abort_candidate_drop',
    );
    expect(restoreScript).toContain(
      'candidate recovery is forbidden while a hardened current operations bundle exists',
    );
    expect(restoreScript).toContain(
      'candidate operations bundle source SHA does not match the unresolved deployment identity',
    );
    expect(restoreProof).toContain(
      'run_killed_restore after_preparing preparing',
    );
    expect(restoreProof).toContain(
      'run_killed_restore after_candidate_ready candidate_ready',
    );
    expect(restoreProof).toContain(
      'PRESSLY_RESTORE_TEST_FAIL_ABORT_VALIDATION',
    );
    expect(restoreProof).toContain('after_abort_candidate_drop');
    expect(restoreProof).toContain('post-rename abort unexpectedly passed');
    expect(restoreScript).toContain("journal['resumeServices'] = True");
  });

  it('rejects stale quarantine collisions before cutover', () => {
    expect(restoreScript).toContain(
      'QUARANTINE_DATABASE="${RECOVERY_PREFIX}_damaged_${RESTORE_STAMP}_$$"',
    );
    expect(restoreScript).toContain('preparing:target_only');
    expect(restoreScript).toContain('preparing:candidate_ready');
    expect(restoreScript).not.toContain('preparing:*');
    expect(restoreScript).not.toContain('candidate_ready:candidate_promoted');
    expect(restoreProof).toContain('STALE_QUARANTINE_DATABASE');
    expect(restoreProof).toContain(
      'phase preparing conflicts with database topology candidate_promoted',
    );
    expect(restoreProof).toContain(
      'quarantine_collision=unique-name,preparing-rejected',
    );
    expect(restoreProof).toContain('ANOMALOUS_CUTOVER_OUTPUT');
    expect(restoreProof).toContain(
      'phase candidate_ready conflicts with database topology candidate_promoted',
    );
    expect(restoreProof).toContain(
      'unreachable_cutover_topology=candidate-ready-promoted-rejected',
    );
  });

  it('admits exact unresolved deployment shapes without erasing recovery evidence', () => {
    expect(restoreScript).toContain("state.get('schemaVersion') == 2");
    expect(restoreScript).toContain(
      'current release must exactly match recoveryTarget or rollbackPrevious',
    );
    expect(restoreScript).toContain('unresolvedDeploymentState');
    expect(restoreScript).toContain('postgres-restore-last.json');
    expect(restoreProof).toContain(
      'write_recovering_unverified_state previous',
    );
    expect(restoreProof).toContain('UNRESOLVED_STATE_SNAPSHOT_FILE');
  });

  it('builds an actual N-1 backup and requires the current migration on restore', () => {
    expect(restoreProof).toContain('const removed = journal.entries.pop()');
    expect(restoreProof).toContain(
      '--volume "$N_MINUS_ONE_MIGRATIONS:/repo/packages/db/src/migrations:ro"',
    );
    expect(restoreProof).toContain(
      'the current release migration was not applied to the N-1 backup',
    );
    expect(restoreProof).toContain('migration_upgrade=$N_MINUS_ONE_COUNT->');
  });
});
