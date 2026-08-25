import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Processor browser host dependency boundary', () => {
  it('imports only browser lifecycle mechanisms', () => {
    const implementation = read('../src/processor-browser-host.ts');
    const importSources = [...implementation.matchAll(/from '([^']+)'/g)].map(
      (match) => match[1],
    );

    expect(importSources).toEqual([
      '@pressly/errors/app-error',
      '@pressly/errors/factories',
      'react',
      'react-dom/client',
    ]);
    expect(implementation).not.toMatch(
      /@pressly\/(?:.*-system|experience-|contracts|generated)/,
    );
    expect(implementation).not.toMatch(/(?:apps|systems|experiences)\//);
  });

  it('declares only the generated runtime composition edge', () => {
    const manifest = JSON.parse(read('../package.json')) as {
      dependencies: Record<string, string>;
    };

    expect(manifest.dependencies['@pressly/generated-runtime']).toBe(
      'workspace:*',
    );
    expect(
      manifest.dependencies['@pressly/experience-processor'],
    ).toBeUndefined();
    expect(Object.keys(manifest.dependencies)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/@pressly\/.*-system/)]),
    );
  });
});
