import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const sourceRoot = join(process.cwd(), 'src');

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });

const importSpecifiers = (source: string): string[] =>
  [...source.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? '',
  );

const violationsFor = (
  file: string,
  forbidden: readonly RegExp[],
): string[] => {
  const source = readFileSync(file, 'utf8');
  return importSpecifiers(source)
    .filter((specifier) => forbidden.some((pattern) => pattern.test(specifier)))
    .map((specifier) => `${relative(sourceRoot, file)} -> ${specifier}`);
};

describe('web import boundaries', () => {
  const files = sourceFiles(sourceRoot);

  it('has no unbounded app/shared directory', () => {
    expect(files.some((file) => file.includes('/app/shared/'))).toBe(false);
  });

  it('keeps common independent from app and product features', () => {
    const violations = files
      .filter((file) => file.includes('/common/'))
      .flatMap((file) => violationsFor(file, [/^@\/app\//, /^@\/features\//]));

    expect(violations).toEqual([]);
  });

  it('keeps product features independent from app and concrete adapters', () => {
    const violations = files
      .filter((file) => file.includes('/features/'))
      .flatMap((file) =>
        violationsFor(
          file,
          file.endsWith('/server.ts')
            ? [/^@\/app\//]
            : [/^@\/app\//, /^@\/common\/adapters\//],
        ),
      );

    expect(violations).toEqual([]);
  });

  it('keeps design primitives independent from product code', () => {
    const violations = files
      .filter((file) => file.includes('/components/ui/'))
      .flatMap((file) =>
        violationsFor(file, [/^@\/app\//, /^@\/common\//, /^@\/features\//]),
      );

    expect(violations).toEqual([]);
  });
});
