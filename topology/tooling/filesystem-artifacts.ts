import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { presslyTopology } from '../pressly.topology.ts';
import {
  compareGeneratedArtifacts,
  compileTopology,
  resolveStaticArtifacts,
  type GeneratedArtifact,
  type GeneratedArtifactMismatch,
  type TopologyViolation,
} from '../src/public.ts';
import { resolveRepositoryOperationEvidence } from './repository-operation-evidence.ts';
import { resolveExpectedFailureProofs } from './expected-failure-proof.ts';

export const presslyRepositoryRoot = fileURLToPath(
  new URL('../..', import.meta.url),
);

export type PresslyArtifactResolution =
  | Readonly<{
      kind: 'invalid-topology';
      violations: readonly TopologyViolation[];
    }>
  | Readonly<{
      kind: 'invalid-observability';
      violations: readonly Readonly<{
        code: string;
        subject: string;
        message: string;
      }>[];
    }>
  | Readonly<{
      kind: 'ready';
      artifacts: readonly GeneratedArtifact[];
    }>;

export const resolvePresslyArtifacts =
  async (): Promise<PresslyArtifactResolution> => {
    const compilation = compileTopology(presslyTopology);
    if (compilation.kind === 'invalid')
      return Object.freeze({
        kind: 'invalid-topology',
        violations: compilation.violations,
      });

    const evidence = resolveRepositoryOperationEvidence(
      compilation.topology,
      presslyRepositoryRoot,
    );
    if (evidence.kind === 'invalid')
      return Object.freeze({
        kind: 'invalid-topology',
        violations: evidence.violations,
      });

    const expectedFailureProofs = resolveExpectedFailureProofs({
      topology: compilation.topology,
      operations: evidence.operations,
      repositoryRoot: presslyRepositoryRoot,
    });
    if (expectedFailureProofs.kind === 'invalid')
      return Object.freeze({
        kind: 'invalid-topology',
        violations: expectedFailureProofs.violations,
      });

    const artifactResolution = resolveStaticArtifacts(
      compilation.topology,
      evidence.operations,
    );
    if (artifactResolution.kind === 'invalid-observability')
      return artifactResolution;

    const prettierOptions =
      (await resolveConfig(
        path.join(presslyRepositoryRoot, 'generated/http-catalog.ts'),
      )) ?? {};
    const artifacts = await Promise.all(
      artifactResolution.artifacts.map(async (artifact) =>
        Object.freeze({
          ...artifact,
          content: await format(artifact.content, {
            ...prettierOptions,
            parser: 'typescript',
          }),
        }),
      ),
    );

    return Object.freeze({
      kind: 'ready',
      artifacts: Object.freeze(artifacts),
    });
  };

export const writeGeneratedArtifacts = (
  repositoryRoot: string,
  artifacts: readonly GeneratedArtifact[],
): readonly string[] => {
  const written: string[] = [];
  for (const artifact of artifacts) {
    const filePath = path.join(repositoryRoot, artifact.path);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, artifact.content, 'utf8');
    written.push(artifact.path);
  }
  return Object.freeze(written);
};

export const readGeneratedArtifacts = (
  repositoryRoot: string,
  expected: readonly GeneratedArtifact[],
): Readonly<Record<string, string | undefined>> => {
  const generatedRoot = path.join(repositoryRoot, 'generated');
  const collectGeneratedSourcePaths = (directory: string): readonly string[] =>
    existsSync(directory)
      ? readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
          if (
            entry.name === 'dist' ||
            entry.name === 'node_modules' ||
            entry.name === '.turbo'
          )
            return [];
          const target = path.join(directory, entry.name);
          if (entry.isDirectory()) return collectGeneratedSourcePaths(target);
          return entry.isFile() && /[.](?:[cm]?ts|tsx)$/.test(entry.name)
            ? [path.relative(repositoryRoot, target).split(path.sep).join('/')]
            : [];
        })
      : [];
  const generatedSourcePaths = collectGeneratedSourcePaths(generatedRoot);
  const paths = new Set([
    ...expected.map((artifact) => artifact.path),
    ...generatedSourcePaths,
  ]);

  return Object.freeze(
    Object.fromEntries(
      [...paths].map((artifactPath) => {
        const filePath = path.join(repositoryRoot, artifactPath);
        return [
          artifactPath,
          existsSync(filePath) ? readFileSync(filePath, 'utf8') : undefined,
        ];
      }),
    ),
  );
};

export const checkGeneratedArtifacts = (
  repositoryRoot: string,
  expected: readonly GeneratedArtifact[],
): readonly GeneratedArtifactMismatch[] =>
  compareGeneratedArtifacts(
    expected,
    readGeneratedArtifacts(repositoryRoot, expected),
  );

export const formatTopologyViolations = (
  violations: readonly Readonly<{
    code: string;
    subject: string;
    message: string;
  }>[],
): string =>
  violations
    .map((entry) => `- [${entry.code}] ${entry.subject}: ${entry.message}`)
    .join('\n');
