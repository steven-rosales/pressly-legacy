import path from 'node:path';
import {
  operationProofClaims,
  type OperationProofClaim,
  type OperationProofLayer,
} from '@pressly/cells/operation-proof';
import ts from 'typescript';

export type OperationProofSource = Readonly<{
  path: string;
  source: string;
}>;

export type ParsedOperationProofScenario = Readonly<{
  name: string;
  proves: readonly OperationProofClaim[];
}>;

export type ParsedOperationProof = Readonly<{
  operationId: string;
  declarationName: string;
  layer: OperationProofLayer;
  path: string;
  scenarios: readonly ParsedOperationProofScenario[];
}>;

export type OperationProofTarget = Readonly<{
  operationId: string;
  cellPath: string;
  declarationExportName: string;
}>;

export type OperationProofSourceIssue = Readonly<{
  code:
    | 'duplicate_operation_proof_scenario'
    | 'invalid_operation_proof'
    | 'missing_operation_proof'
    | 'nonlocal_operation_proof'
    | 'unknown_operation_proof';
  path: string;
  operationId: string | null;
  message: string;
}>;

export type OperationProofSourceResolution =
  | Readonly<{
      kind: 'invalid';
      issues: readonly OperationProofSourceIssue[];
      proofs: Readonly<Record<string, readonly ParsedOperationProof[]>>;
    }>
  | Readonly<{
      kind: 'resolved';
      proofs: Readonly<Record<string, readonly ParsedOperationProof[]>>;
    }>;

export type OperationProofProfile = Readonly<{
  kind: 'command' | 'process' | 'query' | 'reaction' | 'subscription';
  ownerKind: 'experience' | 'system';
  transaction: 'none' | 'required';
  concurrency: 'none' | 'optimistic' | 'partitioned';
  idempotencyRequired: boolean;
  hasDecision: boolean;
  hasPersistence: boolean;
  hasProtocol: boolean;
  hasMessages: boolean;
}>;

const validClaim = new Set<string>(operationProofClaims);
const validLayer = new Set<OperationProofLayer>([
  'component',
  'contract',
  'postgres',
  'unit',
]);
const testPathPattern = /[.](?:spec|test)[.]tsx?$/u;

const property = (
  object: ts.ObjectLiteralExpression,
  name: string,
): ts.Expression | null => {
  const match = object.properties.find(
    (candidate): candidate is ts.PropertyAssignment =>
      ts.isPropertyAssignment(candidate) &&
      ((ts.isIdentifier(candidate.name) && candidate.name.text === name) ||
        (ts.isStringLiteral(candidate.name) && candidate.name.text === name)),
  );
  return match?.initializer ?? null;
};

const literalString = (expression: ts.Expression | null): string | null =>
  expression !== null &&
  (ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression))
    ? expression.text
    : null;

const containsExecutedProofAction = (body: ts.ConciseBody): boolean => {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (node !== body && ts.isFunctionLike(node)) return;
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
};

const issue = (
  code: OperationProofSourceIssue['code'],
  sourcePath: string,
  operationId: string | null,
  message: string,
): OperationProofSourceIssue =>
  Object.freeze({ code, path: sourcePath, operationId, message });

const parseProofCall = (
  call: ts.CallExpression,
  sourcePath: string,
  hasCanonicalProofImport: boolean,
  localCellDeclarations: ReadonlySet<string>,
):
  | Readonly<{ kind: 'invalid'; issues: readonly OperationProofSourceIssue[] }>
  | Readonly<{ kind: 'parsed'; proof: ParsedOperationProof }> => {
  const [argument] = call.arguments;
  if (argument === undefined || !ts.isObjectLiteralExpression(argument))
    return Object.freeze({
      kind: 'invalid',
      issues: Object.freeze([
        issue(
          'invalid_operation_proof',
          sourcePath,
          null,
          'proveOperation must receive one inline object literal.',
        ),
      ]),
    });

  const operationId = literalString(property(argument, 'operationId'));
  const declaration = property(argument, 'declaration');
  const layer = literalString(property(argument, 'layer'));
  const scenariosExpression = property(argument, 'scenarios');
  const issues: OperationProofSourceIssue[] = [];

  if (!hasCanonicalProofImport)
    issues.push(
      issue(
        'invalid_operation_proof',
        sourcePath,
        operationId,
        'proveOperation must be imported by its canonical name from @pressly/testkit/operation-proof.',
      ),
    );
  if (
    declaration === null ||
    !ts.isIdentifier(declaration) ||
    !localCellDeclarations.has(declaration.text)
  )
    issues.push(
      issue(
        'invalid_operation_proof',
        sourcePath,
        operationId,
        'declaration must be a named import from the local ./cell.ts.',
      ),
    );

  if (operationId === null || operationId.trim().length === 0)
    issues.push(
      issue(
        'invalid_operation_proof',
        sourcePath,
        null,
        'operationId must be a non-empty string literal.',
      ),
    );
  if (layer === null || !validLayer.has(layer as OperationProofLayer))
    issues.push(
      issue(
        'invalid_operation_proof',
        sourcePath,
        operationId,
        'layer must be one of component, contract, postgres, or unit.',
      ),
    );
  if (
    scenariosExpression === null ||
    !ts.isArrayLiteralExpression(scenariosExpression) ||
    scenariosExpression.elements.length === 0
  )
    issues.push(
      issue(
        'invalid_operation_proof',
        sourcePath,
        operationId,
        'scenarios must be a non-empty inline array literal.',
      ),
    );

  const scenarios: ParsedOperationProofScenario[] = [];
  if (
    scenariosExpression !== null &&
    ts.isArrayLiteralExpression(scenariosExpression)
  )
    for (const scenarioExpression of scenariosExpression.elements) {
      if (!ts.isObjectLiteralExpression(scenarioExpression)) {
        issues.push(
          issue(
            'invalid_operation_proof',
            sourcePath,
            operationId,
            'Every scenario must be an inline object literal.',
          ),
        );
        continue;
      }
      const name = literalString(property(scenarioExpression, 'name'));
      const provesExpression = property(scenarioExpression, 'proves');
      const runExpression = property(scenarioExpression, 'run');
      const hasExecutableRun =
        runExpression !== null &&
        (ts.isArrowFunction(runExpression) ||
          ts.isFunctionExpression(runExpression)) &&
        containsExecutedProofAction(runExpression.body);
      if (name === null || name.trim().length === 0)
        issues.push(
          issue(
            'invalid_operation_proof',
            sourcePath,
            operationId,
            'Every scenario name must be a non-empty string literal.',
          ),
        );
      if (
        provesExpression === null ||
        !ts.isArrayLiteralExpression(provesExpression) ||
        provesExpression.elements.length === 0
      )
        issues.push(
          issue(
            'invalid_operation_proof',
            sourcePath,
            operationId,
            'Every scenario proves value must be a non-empty inline array.',
          ),
        );
      if (!hasExecutableRun)
        issues.push(
          issue(
            'invalid_operation_proof',
            sourcePath,
            operationId,
            'Every scenario must provide an inline run function that executes an assertion or behavior call.',
          ),
        );

      const proves: OperationProofClaim[] = [];
      if (
        provesExpression !== null &&
        ts.isArrayLiteralExpression(provesExpression)
      )
        for (const proofClaimExpression of provesExpression.elements) {
          const claim = literalString(proofClaimExpression);
          if (claim === null || !validClaim.has(claim))
            issues.push(
              issue(
                'invalid_operation_proof',
                sourcePath,
                operationId,
                `Unknown operation proof claim ${JSON.stringify(claim)}.`,
              ),
            );
          else proves.push(claim as OperationProofClaim);
        }
      if (name !== null && name.trim().length > 0)
        scenarios.push(
          Object.freeze({ name, proves: Object.freeze([...new Set(proves)]) }),
        );
    }

  if (
    issues.length > 0 ||
    operationId === null ||
    layer === null ||
    declaration === null ||
    !ts.isIdentifier(declaration)
  )
    return Object.freeze({ kind: 'invalid', issues: Object.freeze(issues) });

  const duplicateNames = scenarios
    .map(({ name }) => name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  for (const duplicateName of [...new Set(duplicateNames)])
    issues.push(
      issue(
        'duplicate_operation_proof_scenario',
        sourcePath,
        operationId,
        `Scenario ${JSON.stringify(duplicateName)} is declared more than once.`,
      ),
    );
  if (issues.length > 0)
    return Object.freeze({ kind: 'invalid', issues: Object.freeze(issues) });

  return Object.freeze({
    kind: 'parsed',
    proof: Object.freeze({
      operationId,
      declarationName: declaration.text,
      layer: layer as OperationProofLayer,
      path: sourcePath,
      scenarios: Object.freeze(scenarios),
    }),
  });
};

export const parseOperationProofSource = (
  source: OperationProofSource,
):
  | Readonly<{ kind: 'invalid'; issues: readonly OperationProofSourceIssue[] }>
  | Readonly<{ kind: 'parsed'; proofs: readonly ParsedOperationProof[] }> => {
  const sourceFile = ts.createSourceFile(
    source.path,
    source.source,
    ts.ScriptTarget.Latest,
    true,
    source.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const proofs: ParsedOperationProof[] = [];
  const issues: OperationProofSourceIssue[] = [];
  let hasCanonicalProofImport = false;
  const localCellDeclarations = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const moduleSpecifier = literalString(statement.moduleSpecifier);
    const namedBindings = statement.importClause?.namedBindings;
    if (namedBindings === undefined || !ts.isNamedImports(namedBindings))
      continue;
    for (const specifier of namedBindings.elements) {
      const importedName = specifier.propertyName?.text ?? specifier.name.text;
      if (
        moduleSpecifier === '@pressly/testkit/operation-proof' &&
        importedName === 'proveOperation' &&
        specifier.name.text === 'proveOperation'
      )
        hasCanonicalProofImport = true;
      if (
        (moduleSpecifier === './cell.ts' || moduleSpecifier === './cell') &&
        importedName === specifier.name.text
      )
        localCellDeclarations.add(specifier.name.text);
    }
  }
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'proveOperation'
    ) {
      const parsed = parseProofCall(
        node,
        source.path,
        hasCanonicalProofImport,
        localCellDeclarations,
      );
      if (parsed.kind === 'invalid') issues.push(...parsed.issues);
      else proofs.push(parsed.proof);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return issues.length > 0
    ? Object.freeze({ kind: 'invalid', issues: Object.freeze(issues) })
    : Object.freeze({ kind: 'parsed', proofs: Object.freeze(proofs) });
};

const insideDirectory = (file: string, directory: string): boolean =>
  file.startsWith(`${directory}/`);

export const resolveOperationProofSources = (
  targets: readonly OperationProofTarget[],
  sources: readonly OperationProofSource[],
): OperationProofSourceResolution => {
  const targetById = new Map(
    targets.map((target) => [target.operationId, target] as const),
  );
  const proofsById = new Map<string, ParsedOperationProof[]>();
  const issues: OperationProofSourceIssue[] = [];

  for (const source of sources) {
    if (!testPathPattern.test(source.path)) continue;
    const parsed = parseOperationProofSource(source);
    if (parsed.kind === 'invalid') {
      issues.push(...parsed.issues);
      continue;
    }
    for (const proof of parsed.proofs) {
      const target = targetById.get(proof.operationId);
      if (target === undefined) {
        issues.push(
          issue(
            'unknown_operation_proof',
            proof.path,
            proof.operationId,
            'The proof does not match a selected operation.',
          ),
        );
        continue;
      }
      const cellDirectory = path.posix.dirname(target.cellPath);
      if (!insideDirectory(proof.path, cellDirectory)) {
        issues.push(
          issue(
            'nonlocal_operation_proof',
            proof.path,
            proof.operationId,
            `Proof must live under ${cellDirectory}.`,
          ),
        );
        continue;
      }
      if (proof.declarationName !== target.declarationExportName) {
        issues.push(
          issue(
            'invalid_operation_proof',
            proof.path,
            proof.operationId,
            `Proof declaration must be ${target.declarationExportName}; found ${proof.declarationName}.`,
          ),
        );
        continue;
      }
      const current = proofsById.get(proof.operationId) ?? [];
      current.push(proof);
      proofsById.set(proof.operationId, current);
    }
  }

  for (const target of targets)
    if ((proofsById.get(target.operationId) ?? []).length === 0)
      issues.push(
        issue(
          'missing_operation_proof',
          target.cellPath,
          target.operationId,
          'The operation has no executable typed proof in its cell directory.',
        ),
      );

  const resolvedProofs = Object.freeze(
    Object.fromEntries(
      targets.map(({ operationId }) => [
        operationId,
        Object.freeze(
          [...(proofsById.get(operationId) ?? [])].sort((left, right) =>
            left.path.localeCompare(right.path),
          ),
        ),
      ]),
    ),
  );

  if (issues.length > 0)
    return Object.freeze({
      kind: 'invalid',
      issues: Object.freeze(
        [...issues].sort(
          (left, right) =>
            left.path.localeCompare(right.path) ||
            left.message.localeCompare(right.message),
        ),
      ),
      proofs: resolvedProofs,
    });

  return Object.freeze({
    kind: 'resolved',
    proofs: resolvedProofs,
  });
};

export const requiredOperationProofClaims = (
  profile: OperationProofProfile,
): readonly OperationProofClaim[] => {
  const required: OperationProofClaim[] = ['contract', 'executor-success'];
  if (profile.hasDecision) required.push('decision');
  if (profile.hasProtocol) required.push('protocol');
  if (profile.hasMessages) required.push('message-compatibility');

  const postgresWrite =
    profile.ownerKind === 'system' &&
    profile.hasPersistence &&
    profile.kind !== 'query' &&
    profile.kind !== 'subscription';
  if (postgresWrite) {
    required.push(
      'postgres-commit',
      'expected-rejection-no-partial-write',
      profile.transaction === 'required'
        ? 'unexpected-failure-rollback'
        : 'unexpected-failure-no-write',
    );
    if (profile.idempotencyRequired)
      required.push(
        'same-payload-replay',
        'divergent-key-conflict',
        'same-key-concurrency',
      );
    if (profile.concurrency !== 'none')
      required.push('declared-concurrency-race');
    if (profile.hasMessages) required.push('state-message-atomicity');
  }
  return Object.freeze([...new Set(required)]);
};

const requiredProofLayers = (
  claim: OperationProofClaim,
): readonly OperationProofLayer[] => {
  if (
    claim === 'postgres-commit' ||
    claim === 'expected-rejection-no-partial-write' ||
    claim === 'unexpected-failure-rollback' ||
    claim === 'unexpected-failure-no-write' ||
    claim === 'same-payload-replay' ||
    claim === 'divergent-key-conflict' ||
    claim === 'same-key-concurrency' ||
    claim === 'declared-concurrency-race' ||
    claim === 'state-message-atomicity'
  )
    return ['postgres'];
  if (claim === 'presentation-state' || claim === 'component-interaction')
    return ['component'];
  if (claim === 'contract') return ['contract', 'unit'];
  if (claim === 'decision' || claim === 'executor-success') return ['unit'];
  if (claim === 'protocol') return ['contract', 'unit'];
  if (claim === 'message-compatibility')
    return ['contract', 'postgres', 'unit'];
  return ['component', 'contract', 'postgres', 'unit'];
};

export const hasOperationProofClaim = (
  proofs: readonly ParsedOperationProof[],
  claim: OperationProofClaim,
): boolean =>
  proofs.some(
    (proof) =>
      requiredProofLayers(claim).includes(proof.layer) &&
      proof.scenarios.some((scenario) => scenario.proves.includes(claim)),
  );

export const missingOperationProofClaims = (
  profile: OperationProofProfile,
  proofs: readonly ParsedOperationProof[],
): readonly OperationProofClaim[] => {
  return Object.freeze(
    requiredOperationProofClaims(profile).filter(
      (claim) => !hasOperationProofClaim(proofs, claim),
    ),
  );
};
