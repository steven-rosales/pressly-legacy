import type {
  OperationProofClaim,
  StaticArchitectureOperation,
} from '@pressly/cells';
import {
  hasOperationProofClaim,
  requiredOperationProofClaims,
  type OperationProofProfile,
  type ParsedOperationProof,
} from '../../topology/tooling/operation-proof-source.ts';
import {
  cellDefinitionOfDoneObligations,
  type DefinitionOfDoneEvidence,
  type CellDefinitionOfDoneEntry,
  type CellDefinitionOfDoneObligation,
} from './cell-definition-of-done.ts';

const finalArchitectureRef = 'verification/topology/final-architecture.test.ts';
const architectureMapRef = 'generated/architecture-map.ts';
const contractCompatibilityRef =
  'verification/topology/contract-wire-compatibility.test.ts';

export type DefinitionOfDoneContext = Readonly<{
  repositoryPathExists: (repositoryPath: string) => boolean;
  generatedClientContainsOperation: (
    repositoryPath: string,
    operationId: string,
  ) => boolean;
  legacyAndCompatibilityRemoved: boolean;
}>;

const unique = (values: readonly string[]): readonly string[] =>
  Object.freeze([...new Set(values)].sort());

const evidence = (
  obligation: CellDefinitionOfDoneObligation,
  met: boolean,
  refs: readonly string[],
  reason: string,
): DefinitionOfDoneEvidence =>
  Object.freeze({
    obligation,
    applicability: 'applicable',
    outcome: met ? 'met' : 'unmet',
    reason,
    refs: unique(refs),
  });

const notApplicable = (
  obligation: CellDefinitionOfDoneObligation,
  refs: readonly string[],
  reason: string,
): DefinitionOfDoneEvidence =>
  Object.freeze({
    obligation,
    applicability: 'not-applicable',
    outcome: 'not-applicable',
    reason,
    refs: unique(refs),
  });

const parsedProofs = (
  operation: StaticArchitectureOperation,
): readonly ParsedOperationProof[] =>
  Object.freeze(
    (operation.paths?.proofs ?? []).map((proof) =>
      Object.freeze({
        operationId: operation.id,
        declarationName: operation.source.manifestExportName,
        path: proof.path,
        layer: proof.layer,
        scenarios: proof.scenarios,
      }),
    ),
  );

const proofRefs = (
  proofs: readonly ParsedOperationProof[],
  claims: readonly OperationProofClaim[],
): readonly string[] =>
  unique(
    proofs.flatMap((proof) =>
      proof.scenarios.some((scenario) =>
        scenario.proves.some((claim) => claims.includes(claim)),
      )
        ? [proof.path]
        : [],
    ),
  );

const profileFor = (
  operation: StaticArchitectureOperation,
): OperationProofProfile => {
  const paths = operation.paths;
  const manifestRequiresPersistence =
    operation.ownerKind === 'system' &&
    operation.consistency.transaction === 'required';
  return Object.freeze({
    kind: operation.kind,
    ownerKind: operation.ownerKind,
    transaction: operation.consistency.transaction,
    concurrency: operation.consistency.concurrency,
    idempotencyRequired: operation.consistency.idempotencyRequired,
    hasDecision: (paths?.decisions.length ?? 0) > 0,
    hasPersistence:
      manifestRequiresPersistence || (paths?.persistence.length ?? 0) > 0,
    hasProtocol:
      operation.cli.length +
        operation.eventStreams.length +
        operation.http.length +
        operation.jobs.length >
      0,
    hasMessages: operation.emits.length + operation.consumes.length > 0,
  });
};

const isPostgresClaim = (claim: OperationProofClaim): boolean =>
  claim === 'postgres-commit' ||
  claim === 'expected-rejection-no-partial-write' ||
  claim === 'unexpected-failure-rollback' ||
  claim === 'unexpected-failure-no-write' ||
  claim === 'same-payload-replay' ||
  claim === 'divergent-key-conflict' ||
  claim === 'same-key-concurrency' ||
  claim === 'declared-concurrency-race' ||
  claim === 'state-message-atomicity';

const claimsMet = (
  proofs: readonly ParsedOperationProof[],
  claims: readonly OperationProofClaim[],
): boolean => claims.every((claim) => hasOperationProofClaim(proofs, claim));

const frontendClientRefs = (
  operation: StaticArchitectureOperation,
): readonly string[] =>
  unique(
    (operation.paths?.features ?? []).map(
      (feature) => `generated/clients/${feature.experience}.ts`,
    ),
  );

export const deriveCellDefinitionOfDoneEvidence = (
  operation: StaticArchitectureOperation,
  context: DefinitionOfDoneContext,
): CellDefinitionOfDoneEntry => {
  const paths = operation.paths;
  if (paths === null)
    return Object.freeze({
      operationId: operation.id,
      evidence: Object.freeze(
        cellDefinitionOfDoneObligations.map((obligation) =>
          evidence(
            obligation,
            false,
            [],
            'Strict repository evidence was not resolved.',
          ),
        ),
      ),
    });

  const proofs = parsedProofs(operation);
  const profile = profileFor(operation);
  const requiredClaims = requiredOperationProofClaims(profile);
  const postgresClaims = requiredClaims.filter(isPostgresClaim);
  const postgresWrite = postgresClaims.length > 0;
  const frontendApplicable = paths.features.length > 0;
  const featureRefs = paths.features.flatMap((feature) => [
    feature.path,
    ...feature.stateProofs,
    ...feature.componentProofs,
  ]);
  const focusedFeatureProofComplete =
    paths.features.length > 0 &&
    paths.features.every(
      (feature) =>
        context.repositoryPathExists(feature.path) &&
        feature.componentProofs.length > 0 &&
        feature.stateProofs.every(context.repositoryPathExists) &&
        feature.componentProofs.every(context.repositoryPathExists),
    );
  const completePaths = [
    paths.cell,
    ...paths.contracts,
    ...paths.decisions,
    ...paths.executors,
    ...paths.persistence,
    ...paths.state,
    ...paths.events,
    ...paths.protocols,
    ...paths.tests,
    ...featureRefs,
    ...proofs.map((proof) => proof.path),
  ];
  const allPathsExist = (repositoryPaths: readonly string[]): boolean =>
    repositoryPaths.length > 0 &&
    repositoryPaths.every(context.repositoryPathExists);

  return Object.freeze({
    operationId: operation.id,
    evidence: Object.freeze([
      evidence(
        'obvious-owner-and-cell',
        paths.cell.includes(`/src/cells/`) &&
          paths.cell.endsWith('/cell.ts') &&
          context.repositoryPathExists(paths.cell),
        [paths.cell, architectureMapRef],
        'The selected operation resolves to one canonical owner cell path.',
      ),
      evidence(
        'explicit-versioned-contract',
        allPathsExist(paths.contracts) &&
          hasOperationProofClaim(proofs, 'contract'),
        [...paths.contracts, ...proofRefs(proofs, ['contract'])],
        'A local contract and executable decode/encode scenario prove the versioned boundary.',
      ),
      paths.decisions.length === 0
        ? notApplicable(
            'pure-deterministic-decisions',
            [paths.cell],
            'The operation has no independently named decision role.',
          )
        : evidence(
            'pure-deterministic-decisions',
            allPathsExist(paths.decisions) &&
              hasOperationProofClaim(proofs, 'decision'),
            [...paths.decisions, ...proofRefs(proofs, ['decision'])],
            'A unit-layer scenario executes the local pure decision.',
          ),
      evidence(
        'explicit-effect-dependencies',
        allPathsExist(paths.executors) &&
          hasOperationProofClaim(proofs, 'executor-success'),
        [...paths.executors, ...proofRefs(proofs, ['executor-success'])],
        'A local executor and unit-layer success scenario prove explicit effect sequencing.',
      ),
      !profile.hasPersistence
        ? notApplicable(
            'isolated-sql-persistence',
            [paths.cell, finalArchitectureRef],
            'The operation owns no persistence adapter.',
          )
        : evidence(
            'isolated-sql-persistence',
            allPathsExist(paths.persistence) &&
              context.repositoryPathExists(finalArchitectureRef),
            [...paths.persistence, finalArchitectureRef],
            'Strict locality and SQL-placement guards bind persistence to the cell.',
          ),
      evidence(
        'typed-expected-failures',
        allPathsExist(paths.contracts) &&
          hasOperationProofClaim(proofs, 'contract') &&
          (!postgresWrite ||
            hasOperationProofClaim(
              proofs,
              'expected-rejection-no-partial-write',
            )),
        [
          ...paths.contracts,
          ...proofRefs(proofs, [
            'contract',
            'expected-rejection-no-partial-write',
          ]),
        ],
        'The contract and applicable no-partial-write scenario prove expected failure data.',
      ),
      evidence(
        'standard-unexpected-failure-boundary',
        context.repositoryPathExists(finalArchitectureRef) &&
          (!postgresWrite ||
            hasOperationProofClaim(proofs, 'unexpected-failure-rollback') ||
            hasOperationProofClaim(proofs, 'unexpected-failure-no-write')),
        [
          finalArchitectureRef,
          ...paths.executors,
          ...proofRefs(proofs, [
            'unexpected-failure-rollback',
            'unexpected-failure-no-write',
          ]),
        ],
        'Unexpected failures use the standard boundary and execute the applicable rollback or pre-write scenario.',
      ),
      profile.hasProtocol
        ? evidence(
            'declarative-protocol-registration',
            allPathsExist(paths.protocols) &&
              hasOperationProofClaim(proofs, 'protocol'),
            [...paths.protocols, ...proofRefs(proofs, ['protocol'])],
            'A local protocol role and executable mapping scenario prove registration.',
          )
        : notApplicable(
            'declarative-protocol-registration',
            [paths.cell, architectureMapRef],
            'The operation declares no host protocol surface.',
          ),
      evidence(
        'declared-scenario-conformance',
        claimsMet(proofs, requiredClaims),
        proofRefs(proofs, requiredClaims),
        'Every claim required by the positive operation profile executes by name.',
      ),
      postgresWrite || profile.hasMessages
        ? evidence(
            'persistent-state-and-message-conformance',
            claimsMet(
              proofs,
              requiredClaims.filter(
                (claim) =>
                  isPostgresClaim(claim) || claim === 'message-compatibility',
              ),
            ),
            proofRefs(proofs, [...postgresClaims, 'message-compatibility']),
            'Named PostgreSQL and message scenarios prove durable effects.',
          )
        : notApplicable(
            'persistent-state-and-message-conformance',
            [paths.cell],
            'The operation owns no durable write or message effect.',
          ),
      postgresWrite
        ? evidence(
            'real-postgres-idempotency-and-concurrency',
            claimsMet(proofs, postgresClaims),
            proofRefs(proofs, postgresClaims),
            'Every applicable database-controlled claim executes in a PostgreSQL-layer scenario.',
          )
        : notApplicable(
            'real-postgres-idempotency-and-concurrency',
            [paths.cell],
            'The operation has no local database-controlled write profile.',
          ),
      profile.hasMessages
        ? evidence(
            'backward-compatible-cross-system-messages',
            allPathsExist(paths.events) &&
              context.repositoryPathExists(contractCompatibilityRef) &&
              hasOperationProofClaim(proofs, 'message-compatibility'),
            [
              ...paths.events,
              ...proofRefs(proofs, ['message-compatibility']),
              contractCompatibilityRef,
            ],
            'The local message contract and compatibility scenario preserve producer-owned bytes.',
          )
        : notApplicable(
            'backward-compatible-cross-system-messages',
            [paths.cell, contractCompatibilityRef],
            'The operation emits and consumes no cross-system message.',
          ),
      frontendApplicable
        ? evidence(
            'generated-frontend-client',
            focusedFeatureProofComplete &&
              frontendClientRefs(operation).length > 0 &&
              frontendClientRefs(operation).every((clientPath) =>
                context.generatedClientContainsOperation(
                  clientPath,
                  operation.id,
                ),
              ),
            [...frontendClientRefs(operation), ...featureRefs],
            'Declared Experience features bind the operation to generated clients and existing focused state/component proof.',
          )
        : notApplicable(
            'generated-frontend-client',
            [paths.cell, architectureMapRef],
            'No declared Experience feature consumes the operation.',
          ),
      evidence(
        'complete-architecture-path',
        allPathsExist(completePaths) &&
          paths.contracts.length > 0 &&
          paths.executors.length > 0 &&
          paths.tests.length > 0 &&
          proofs.length > 0 &&
          (!profile.hasPersistence || paths.persistence.length > 0) &&
          context.repositoryPathExists(architectureMapRef),
        [architectureMapRef, ...completePaths],
        'The strict map resolves every local structural role and executable proof.',
      ),
      evidence(
        'legacy-and-compatibility-removed',
        context.legacyAndCompatibilityRemoved &&
          context.repositoryPathExists(finalArchitectureRef),
        [paths.cell, finalArchitectureRef],
        'The final architecture guard owns retired-root and compatibility deletion proof.',
      ),
    ]),
  });
};

export const deriveCellDefinitionOfDoneIndex = (
  operations: readonly StaticArchitectureOperation[],
  context: DefinitionOfDoneContext,
): readonly CellDefinitionOfDoneEntry[] =>
  Object.freeze(
    [...operations]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((operation) =>
        deriveCellDefinitionOfDoneEvidence(operation, context),
      ),
  );
