import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = await readFile(
  new URL('../src/jobs-host.ts', import.meta.url),
  'utf8',
);

describe('jobs host boundary', () => {
  it('delegates mechanisms without importing or implementing business queues', () => {
    const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    );

    expect(imports).toEqual(
      expect.arrayContaining([
        '@pressly/cells',
        '@pressly/errors/app-error',
        '@pressly/errors/factories',
        '@pressly/jobs',
      ]),
    );
    expect(imports).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^@pressly\/(?:contracts|db|orders|pricing|production|users|webhook-ingestion)(?:\/|$)/,
        ),
      ]),
    );
    expect(source).not.toMatch(
      /\b(?:cents|customer|laundry|orders|pricing|processor|production|webhook)\b/i,
    );
    expect(source).not.toMatch(
      /\b(?:drizzle|postgres|setInterval|setTimeout|SKIP\s+LOCKED|FOR\s+UPDATE)\b/i,
    );
    expect(source).not.toMatch(/while\s*\(/);
  });
});
