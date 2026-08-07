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
const workflow = parse(workflowSource);
const production = workflow.jobs['production-artifacts'];
const productionSteps = production.steps;

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

  it('builds Processor telemetry for the release without embedding the upload token', () => {
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
    expect(publish.run.match(/docker push "\$[A-Z]+_TAG"/g)).toHaveLength(5);
    expect(
      productionSteps
        .slice(0, publishIndex)
        .filter((candidate) => candidate.name.startsWith('Block critical ')),
    ).toHaveLength(5);
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
