export const operationProofClaims = Object.freeze([
  'contract',
  'decision',
  'executor-success',
  'postgres-commit',
  'expected-rejection-no-partial-write',
  'unexpected-failure-rollback',
  'unexpected-failure-no-write',
  'same-payload-replay',
  'divergent-key-conflict',
  'same-key-concurrency',
  'declared-concurrency-race',
  'state-message-atomicity',
  'protocol',
  'message-compatibility',
  'presentation-state',
  'component-interaction',
] as const);

export type OperationProofClaim = (typeof operationProofClaims)[number];

export type OperationProofLayer =
  | 'component'
  | 'contract'
  | 'postgres'
  | 'unit';

export type StaticOperationProofScenario = Readonly<{
  name: string;
  proves: readonly OperationProofClaim[];
}>;

export type StaticOperationProof = Readonly<{
  path: string;
  layer: OperationProofLayer;
  scenarios: readonly StaticOperationProofScenario[];
}>;
