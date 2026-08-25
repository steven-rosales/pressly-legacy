import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const sourceRoots = [
  'experiences',
  'generated',
  'hosts',
  'platform',
  'systems',
  'topology',
];
const ignoredDirectories = new Set([
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'test',
  'tests',
  'testing',
  '__tests__',
]);
const testFilePattern = /[.](?:int[.]spec|spec|test)[.](?:ts|tsx)$/u;
const configFilePattern = /(?:^|\/)(?:drizzle|eslint|vite|vitest)[.][^/]+$/u;

const liveSourceFiles = () => {
  const files = [];
  const visit = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (
        /[.](?:ts|tsx)$/u.test(entry.name) &&
        !testFilePattern.test(entry.name) &&
        !configFilePattern.test(
          path.relative(repositoryRoot, target).replaceAll(path.sep, '/'),
        )
      )
        files.push(target);
    }
  };
  for (const root of sourceRoots) visit(path.join(repositoryRoot, root));
  return files.sort();
};

const assertionInventory = () => {
  const nonNull = [];
  const doubleUnknown = [];
  const markers = [];
  for (const file of liveSourceFiles()) {
    const sourceText = readFileSync(file, 'utf8');
    const relativeFile = path
      .relative(repositoryRoot, file)
      .replaceAll(path.sep, '/');
    for (const match of sourceText.matchAll(
      /pressly-reviewed-double-assertion: ([a-z0-9-]+)/gu,
    ))
      markers.push({ file: relativeFile, marker: match[1] });

    const source = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node) => {
      const line =
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      if (ts.isNonNullExpression(node)) nonNull.push(`${relativeFile}:${line}`);
      if (
        ts.isAsExpression(node) &&
        node.type.kind === ts.SyntaxKind.UnknownKeyword &&
        ts.isAsExpression(node.parent)
      ) {
        const prefix = sourceText.slice(
          Math.max(0, node.getFullStart() - 300),
          node.getStart(source),
        );
        const marker = [
          ...prefix.matchAll(
            /pressly-reviewed-double-assertion: ([a-z0-9-]+)/gu,
          ),
        ].at(-1)?.[1];
        doubleUnknown.push({ file: relativeFile, marker });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { nonNull, doubleUnknown, markers };
};

const reviewedStateMachineAssertions = [
  {
    file: 'platform/cells/src/state-machine.ts',
    marker: 'mapped-transition-runtime-index',
  },
  {
    file: 'platform/cells/src/state-machine.ts',
    marker: 'frozen-const-state-tuple',
  },
];

describe('live-source type assertion safety', () => {
  it('keeps non-null assertions at exact zero', () => {
    expect(assertionInventory().nonNull).toEqual([]);
  });

  it('allows only the two reviewed generic state-machine coercions', () => {
    const inventory = assertionInventory();
    expect(inventory.doubleUnknown).toEqual(reviewedStateMachineAssertions);
    expect(inventory.markers).toEqual(reviewedStateMachineAssertions);
  });
});
