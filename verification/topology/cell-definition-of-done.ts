export const cellDefinitionOfDoneObligations = Object.freeze([
  'obvious-owner-and-cell',
  'explicit-versioned-contract',
  'pure-deterministic-decisions',
  'explicit-effect-dependencies',
  'isolated-sql-persistence',
  'typed-expected-failures',
  'standard-unexpected-failure-boundary',
  'declarative-protocol-registration',
  'declared-scenario-conformance',
  'persistent-state-and-message-conformance',
  'real-postgres-idempotency-and-concurrency',
  'backward-compatible-cross-system-messages',
  'generated-frontend-client',
  'complete-architecture-path',
  'legacy-and-compatibility-removed',
] as const);

export type CellDefinitionOfDoneObligation =
  (typeof cellDefinitionOfDoneObligations)[number];

export type DefinitionOfDoneEvidence = Readonly<{
  obligation: CellDefinitionOfDoneObligation;
  applicability: 'applicable' | 'not-applicable';
  outcome: 'met' | 'not-applicable' | 'unmet';
  reason: string;
  refs: readonly string[];
}>;

export type CellDefinitionOfDoneEntry = Readonly<{
  operationId: string;
  evidence: readonly DefinitionOfDoneEvidence[];
}>;

export type SemanticExceptionRule = Readonly<{
  obligation: CellDefinitionOfDoneObligation;
  when: string;
  reason: string;
}>;

/**
 * Exceptions are semantic rules, never operation-id allowlists. An operation
 * is N/A only when its checked manifest and repository paths prove that the
 * corresponding behavior does not exist.
 */
const noIndependentDecisionRule = Object.freeze({
  obligation: 'pure-deterministic-decisions',
  when: 'the operation has no independently named decision path',
  reason:
    'A declarative boundary or direct capability adapter with no independent business branch has no separate decision to extract.',
} satisfies SemanticExceptionRule);
const noSqlPersistenceRule = Object.freeze({
  obligation: 'isolated-sql-persistence',
  when: 'the operation has no reachable persistence path',
  reason:
    'An operation that owns no SQL cannot provide a cell-local SQL adapter; repository-wide SQL isolation still applies.',
} satisfies SemanticExceptionRule);
const noProtocolRule = Object.freeze({
  obligation: 'declarative-protocol-registration',
  when: 'the operation declares no HTTP, job, CLI, or event-stream surface',
  reason:
    'A headless capability or internally composed operation has no host protocol to register.',
} satisfies SemanticExceptionRule);
const noPersistentEffectsRule = Object.freeze({
  obligation: 'persistent-state-and-message-conformance',
  when: 'the operation has no transaction, persistence path, emitted message, or consumed message',
  reason:
    'A read-only or presentation-only operation has no durable mutation or message effect to compare.',
} satisfies SemanticExceptionRule);
const noPostgresControlledWriteRule = Object.freeze({
  obligation: 'real-postgres-idempotency-and-concurrency',
  when: 'the operation is not a durable system authority or has no idempotency, concurrency, or persistence semantics controlled by PostgreSQL',
  reason:
    'Experience wrappers delegate durable semantics to system capabilities; pure, presentation-only, and mechanism-free system reads have no database-controlled write semantics.',
} satisfies SemanticExceptionRule);
const noCrossSystemMessagesRule = Object.freeze({
  obligation: 'backward-compatible-cross-system-messages',
  when: 'the operation emits and consumes no message contract',
  reason:
    'An operation outside asynchronous system communication has no message compatibility surface.',
} satisfies SemanticExceptionRule);
const noFrontendConsumerRule = Object.freeze({
  obligation: 'generated-frontend-client',
  when: 'no selected Experience feature declares the operation as a browser dependency',
  reason:
    'Presentation applicability follows explicit feature consumption rather than owner kind or incidental TSX files.',
} satisfies SemanticExceptionRule);

export const cellDefinitionOfDoneExceptionRules: readonly SemanticExceptionRule[] =
  Object.freeze([
    noIndependentDecisionRule,
    noSqlPersistenceRule,
    noProtocolRule,
    noPersistentEffectsRule,
    noPostgresControlledWriteRule,
    noCrossSystemMessagesRule,
    noFrontendConsumerRule,
  ]);

const unique = (refs: readonly string[]): readonly string[] =>
  Object.freeze([...new Set(refs)].sort());

export type SourceText = Readonly<{ path: string; source: string }>;

const postgresQueryImportPattern =
  /(?:from\s+|import\s*\(\s*|import\s+)['"]@pressly\/postgres\/query['"]/u;
const postgresPersistenceSourcePattern =
  /(?:\/postgres|[.]postgres|[.]repo)[.]ts$/u;
const testSourcePattern = /[.](?:spec|test)[.]ts$/u;

export const findCellRolePostgresQueryImports = (
  sources: readonly SourceText[],
): readonly string[] =>
  unique(
    sources.flatMap(({ path, source }) =>
      path.includes('/src/cells/') &&
      !testSourcePattern.test(path) &&
      !postgresPersistenceSourcePattern.test(path) &&
      postgresQueryImportPattern.test(source)
        ? [path]
        : [],
    ),
  );
