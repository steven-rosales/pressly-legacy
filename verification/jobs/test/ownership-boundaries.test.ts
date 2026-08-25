import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url));

const sourceFiles = (root: string): readonly string[] =>
  readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.[cm]?[jt]sx?$/.test(entry.name)
        ? [path]
        : [];
  });

const contents = (root: string): string =>
  sourceFiles(root)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

describe('jobs runtime ownership', () => {
  it('keeps the host business-neutral and process effects out of topology', () => {
    const host = contents(join(repositoryRoot, 'hosts/jobs/src'));
    expect(host).not.toMatch(
      /@pressly\/(?:access|customers|ingress|orders|pricing|production)-system|@pressly\/experience-|@pressly\/topology/,
    );

    const topology = contents(join(repositoryRoot, 'topology/runtime/jobs'));
    expect(topology).not.toMatch(/\bprocess\.|from ['"]node:/);
    expect(
      sourceFiles(join(repositoryRoot, 'topology/runtime/jobs'))
        .map((path) => relative(repositoryRoot, path))
        .sort(),
    ).toEqual([
      'topology/runtime/jobs/pressly-jobs.composition.ts',
      'topology/runtime/jobs/public.ts',
      'topology/runtime/jobs/types.ts',
    ]);
  });

  it('keeps delivery and durable-queue behavior with semantic owners', () => {
    for (const path of [
      'systems/ingress/src/capabilities/process-inbound-event-job/queue.ts',
      'systems/orders/src/capabilities/order-outbox-job/queue.ts',
      'systems/production/src/cells/demand/apply-fulfillment-demand/job-delivery.ts',
    ])
      expect(existsSync(join(repositoryRoot, path)), path).toBe(true);
  });
});
