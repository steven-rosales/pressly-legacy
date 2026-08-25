import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = await readFile(
  new URL('../src/cli-host.ts', import.meta.url),
  'utf8',
);

describe('CLI host boundary', () => {
  it('contains only generic protocol and process-effect composition', () => {
    const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    );

    expect(imports).toEqual(
      expect.arrayContaining([
        '@pressly/cells',
        '@pressly/errors/app-error',
        '@pressly/errors/factories',
      ]),
    );
    expect(imports).not.toEqual(
      expect.arrayContaining([
        'ink',
        'react',
        expect.stringMatching(
          /^@pressly\/(?:contracts|db|identity|ingress|orders|pricing|production|users)(?:\/|$)/,
        ),
      ]),
    );
    expect(source).not.toMatch(
      /\b(?:bootstrap|customer|laundry|orders|pricing|processor|production|webhook)\b/i,
    );
    expect(source).not.toMatch(/switch\s*\(/);
    expect(source).not.toMatch(
      /process\.(?:argv|exit|exitCode|stdin|stdout|stderr)/,
    );
  });
});
