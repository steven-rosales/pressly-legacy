import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const workflowPath = new URL('../../.github/workflows/ci.yml', import.meta.url);
const workflowSource = await readFile(workflowPath, 'utf8');
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
};

const step = (name) => {
  const found = productionSteps.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`Missing CI step: ${name}`);
  return found;
};

const stepIndex = (name) =>
  productionSteps.findIndex((candidate) => candidate.name === name);

describe('four-image CI release', () => {
  it('keeps branch CI build-only for all four application images', () => {
    const branchJobs = [
      workflow.jobs['web-docker-build'],
      workflow.jobs['api-docker-build'],
      workflow.jobs['lpms-docker-build'],
    ];
    for (const job of branchJobs) {
      expect(job.if).toBe("github.ref != 'refs/heads/main'");
      expect(job.needs).toEqual(['integration-tests']);
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
    expect(production.needs).toEqual(['integration-tests']);
    expect(workflow.jobs['integration-tests'].needs).toEqual(['quality']);
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

  it('generates four SBOMs and blocks every critical scan before publishing', () => {
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
    expect(publish.run.match(/docker push "\$[A-Z]+_TAG"/g)).toHaveLength(4);
    expect(
      productionSteps
        .slice(0, publishIndex)
        .filter((candidate) => candidate.name.startsWith('Block critical ')),
    ).toHaveLength(4);
  });

  it('records registry digests and uploads one exact four-image release artifact', () => {
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
      4,
    );
  });
});
