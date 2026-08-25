import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const sources = await Promise.all(
  ['http-host.ts', 'event-stream-host.ts'].map((file) =>
    readFile(new URL(`../src/${file}`, import.meta.url), 'utf8'),
  ),
);

describe('HTTP host boundary', () => {
  it('contains protocol mechanics and no handwritten business knowledge', () => {
    const source = sources.join('\n');
    const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    );

    expect(imports).toEqual(
      expect.arrayContaining([
        '@pressly/cells',
        '@pressly/errors/factories',
        'express',
      ]),
    );
    expect(imports).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^@pressly\/(?:authorization|contracts|identity|orders|pricing|production|users|webhook-ingestion)(?:\/|$)/,
        ),
      ]),
    );
    expect(source).not.toMatch(
      /\b(?:cents|customer|laundry|orders|pricing|processor|production|webhook)\b/i,
    );
    expect(source).not.toMatch(/catchAsync|\.catch\s*\(\s*next\s*\)/);
  });
});
