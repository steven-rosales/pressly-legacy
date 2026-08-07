import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const liveToolingRoots = [
  'stateworks/tooling',
  'tooling/architecture',
  'tooling/browser-e2e',
  'tooling/scripts',
];
const liveToolingFiles = ['tooling/cents-webhook.postman_collection.json'];
const executableExtensions = new Set([
  '.cjs',
  '.js',
  '.json',
  '.mjs',
  '.mts',
  '.sh',
  '.ts',
]);
const nativeThrowableNames = [
  'AggregateError',
  'DOMException',
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
];

const filesBelow = (relativeRoot) => {
  const absoluteRoot = path.join(repositoryRoot, relativeRoot);

  return readdirSync(absoluteRoot, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeRoot, entry.name);
    if (entry.isDirectory()) return filesBelow(relativePath);
    return executableExtensions.has(path.extname(entry.name))
      ? [relativePath]
      : [];
  });
};

const lineNumberAt = (source, offset) =>
  source.slice(0, offset).split(/\r?\n/).length;

test('live repository tooling delegates native throwable construction to Errors ownership', () => {
  const nativeThrowableAlternation = nativeThrowableNames.join('|');
  const nativeThrowable = new RegExp(
    `\\b(?:new\\s+)?(?:${nativeThrowableAlternation})\\s*\\(|\\bextends\\s+(?:${nativeThrowableAlternation})\\b`,
    'g',
  );
  const files = [
    ...liveToolingRoots.flatMap(filesBelow),
    ...liveToolingFiles,
  ].filter(
    (file) =>
      !file.includes('/test/') &&
      !file.includes('.test.') &&
      !file.includes('.spec.'),
  );

  const violations = files.flatMap((file) => {
    const source = readFileSync(path.join(repositoryRoot, file), 'utf8');
    return [...source.matchAll(nativeThrowable)].map(
      (match) => `${file}:${lineNumberAt(source, match.index)}`,
    );
  });

  expect(violations).toEqual([]);
});
