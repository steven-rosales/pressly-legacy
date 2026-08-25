// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const implementation = await readFile(
  new URL('../src/customer-browser-host.ts', import.meta.url),
  'utf8',
);
const manifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
) as Readonly<{
  dependencies?: Readonly<Record<string, string>>;
}>;

describe('customer browser host boundary', () => {
  it('depends only on platform, generated, and framework mechanisms', () => {
    const imports = [...implementation.matchAll(/from ['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    );

    expect(imports).toEqual([
      '@pressly/errors/app-error',
      '@pressly/errors/factories',
    ]);
    const presslyDependencies = Object.keys(manifest.dependencies ?? {}).filter(
      (dependency) => dependency.startsWith('@pressly/'),
    );
    expect(presslyDependencies).toContain('@pressly/generated-runtime');
    expect(presslyDependencies).not.toEqual(
      expect.arrayContaining([
        '@pressly/experience-customer',
        '@pressly/pricing-system',
        '@pressly/generated',
      ]),
    );
    expect(presslyDependencies).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^@pressly\/(?:experience-[^/]+|[^/]+-system)(?:\/|$)/,
        ),
      ]),
    );
    expect(imports).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^(?:next|react|react-dom|@pressly\/(?:contracts|generated|topology|[^/]+-experience|[^/]+-system))(?:\/|$)/,
        ),
      ]),
    );
  });

  it('leaves rendering and framework routing to Next', () => {
    expect(implementation).not.toMatch(
      /\b(?:createRoot|hydrateRoot)\s*\(|\bReactDOM\.|\bdocument\.getElementById\s*\(/,
    );
    expect(implementation).not.toMatch(
      /\b(?:route|pathname|redirect|rewrite)\b/i,
    );
  });
});
