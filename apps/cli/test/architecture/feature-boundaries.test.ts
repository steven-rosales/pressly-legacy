import { readdir, readFile } from 'node:fs/promises';
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cliRoot = fileURLToPath(new URL('../../', import.meta.url));
const featuresRoot = join(cliRoot, 'src/features');

const sourceExtensions = new Set(['.ts', '.tsx']);

const listSourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);

      if (entry.isDirectory()) return listSourceFiles(entryPath);
      if (!sourceExtensions.has(extname(entry.name))) return [];

      return [entryPath];
    }),
  );

  return files.flat();
};

const featureNameForPath = (filePath: string): string | undefined => {
  const segments = featurePathSegments(filePath);

  return segments?.[0];
};

const featurePathSegments = (filePath: string): string[] | undefined => {
  const featurePath = relative(featuresRoot, filePath);

  if (
    featurePath === '' ||
    featurePath.startsWith('..') ||
    isAbsolute(featurePath)
  )
    return undefined;

  return featurePath.split(sep);
};

const importSpecifiersFor = (contents: string): string[] => {
  const specifiers: string[] = [];
  const staticImportPattern =
    /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportPattern = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const match of contents.matchAll(staticImportPattern)) {
    if (match[1] !== undefined) specifiers.push(match[1]);
  }

  for (const match of contents.matchAll(dynamicImportPattern)) {
    if (match[1] !== undefined) specifiers.push(match[1]);
  }

  return specifiers;
};

describe('CLI feature boundaries', () => {
  it('keeps features from importing other features directly', async () => {
    const violations: string[] = [];
    const files = await listSourceFiles(featuresRoot);

    for (const file of files) {
      const sourceFeature = featureNameForPath(file);
      const contents = await readFile(file, 'utf8');

      for (const specifier of importSpecifiersFor(contents)) {
        if (!specifier.startsWith('.')) continue;

        const targetFeature = featureNameForPath(
          resolve(dirname(file), specifier),
        );

        if (
          sourceFeature !== undefined &&
          targetFeature !== undefined &&
          sourceFeature !== targetFeature
        ) {
          violations.push(
            `${relative(cliRoot, file)} imports ${specifier} from ${targetFeature}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('keeps feature application code independent from outer feature layers', async () => {
    const violations: string[] = [];
    const files = await listSourceFiles(featuresRoot);

    for (const file of files) {
      const sourceSegments = featurePathSegments(file);
      if (sourceSegments?.[1] !== 'application') continue;

      const contents = await readFile(file, 'utf8');

      for (const specifier of importSpecifiersFor(contents)) {
        if (!specifier.startsWith('.')) continue;

        const target = resolve(dirname(file), specifier);
        const targetSegments = featurePathSegments(target);

        if (
          targetSegments === undefined ||
          targetSegments[0] !== sourceSegments[0]
        )
          continue;

        const targetLayer = targetSegments[1];

        if (
          targetLayer === 'adapters' ||
          targetLayer === 'presentation' ||
          targetLayer === 'args.ts' ||
          targetLayer === 'cli.ts' ||
          targetLayer === 'index.ts'
        ) {
          violations.push(
            `${relative(cliRoot, file)} imports ${specifier} from ${targetLayer}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
