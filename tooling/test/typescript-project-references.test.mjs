import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const syncScript = path.join(
  repositoryRoot,
  'tooling/scripts/sync-typescript-project-references.mjs',
);

describe('TypeScript workspace project references', () => {
  it('keeps the generated workspace dependency graph current', () => {
    const result = spawnSync(process.execPath, [syncScript, '--check'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: process.env,
    });

    expect(`${result.stdout}\n${result.stderr}`).toContain(
      'TypeScript project references are current',
    );
    expect(result.status).toBe(0);
  });

  it('resolves workspace exports from source when compiled outputs are absent', () => {
    const configPath = path.join(
      repositoryRoot,
      'platform/cells/tsconfig.json',
    );
    const parsed = ts.getParsedCommandLineOfConfigFile(
      configPath,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
          expect(
            ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
          ).toBe('');
        },
      },
    );
    expect(parsed).toBeDefined();

    const hiddenOwners = ['codec', 'errors', 'cells'];
    const hiddenOutputRoots = hiddenOwners.map(
      (owner) =>
        `${path.join(repositoryRoot, 'platform', owner, 'dist')}${path.sep}`,
    );
    const hiddenLinkedOutputRoots = hiddenOwners.map(
      (owner) =>
        `${path.join('node_modules', '@pressly', owner, 'dist')}${path.sep}`,
    );
    const unresolvedWorkspaceImports = (useSourceRedirect) => {
      const compilerHost = ts.createCompilerHost(parsed.options);
      const fileExists = compilerHost.fileExists.bind(compilerHost);
      compilerHost.fileExists = (filePath) => {
        const absolute = path.resolve(filePath);
        return hiddenOutputRoots.some((root) => absolute.startsWith(root)) ||
          hiddenLinkedOutputRoots.some((root) => absolute.includes(root))
          ? false
          : fileExists(filePath);
      };
      compilerHost.useSourceOfProjectReferenceRedirect = () =>
        useSourceRedirect;

      const program = ts.createProgram({
        rootNames: parsed.fileNames,
        options: parsed.options,
        projectReferences: parsed.projectReferences,
        host: compilerHost,
      });
      return ts
        .getPreEmitDiagnostics(program)
        .filter(
          (diagnostic) =>
            diagnostic.code === 2307 &&
            ts
              .flattenDiagnosticMessageText(diagnostic.messageText, ' ')
              .includes('@pressly/'),
        )
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
        );
    };

    expect(
      parsed.projectReferences?.map((reference) =>
        path.relative(repositoryRoot, reference.path),
      ),
    ).toContain(path.join('platform', 'errors', 'tsconfig.json'));
    expect(unresolvedWorkspaceImports(false)).not.toEqual([]);
    expect(unresolvedWorkspaceImports(true)).toEqual([]);
  });

  it('does not rewrite cross-owner source imports in no-emit verification projects', () => {
    for (const configPath of [
      'verification/cli/tsconfig.json',
      'verification/http/tsconfig.json',
      'verification/topology/tsconfig.json',
    ]) {
      const config = JSON.parse(
        readFileSync(path.join(repositoryRoot, configPath), 'utf8'),
      );
      expect(config.compilerOptions.noEmit).toBe(true);
      expect(config.compilerOptions.rewriteRelativeImportExtensions).toBe(
        false,
      );
    }
  });

  it('registers reference checking in architecture generation and lint', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
    );

    expect(manifest.scripts['typescript:references:check']).toContain(
      'sync-typescript-project-references.mjs',
    );
    expect(manifest.scripts['typescript:references:write']).toContain(
      '--write',
    );
    expect(manifest.scripts['architecture:cellular']).toContain(
      'pnpm typescript:references:check',
    );
    expect(manifest.scripts['architecture:generate']).toContain(
      'pnpm typescript:references:write',
    );
  });
});
