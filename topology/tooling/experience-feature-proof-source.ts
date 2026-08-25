import path from 'node:path';
import ts from 'typescript';

export type ExperienceFeatureProofClaim =
  | 'component-interaction'
  | 'presentation-state';

export type ParsedExperienceFeatureProofScenario = Readonly<{
  name: string;
  proves: readonly ExperienceFeatureProofClaim[];
}>;

export type ParsedExperienceFeatureProof = Readonly<{
  featureId: string;
  declarationName: string;
  declarationModuleSpecifier: string;
  path: string;
  scenarios: readonly ParsedExperienceFeatureProofScenario[];
}>;

export type ExperienceFeatureProofSource = Readonly<{
  path: string;
  source: string;
}>;

export type ExperienceFeatureProofTarget = Readonly<{
  featureId: string;
  declarationExportName: string;
  declarationPath: string;
  stateProofs: readonly string[];
  componentProofs: readonly string[];
}>;

export type ExperienceFeatureProofSourceIssue = Readonly<{
  code:
    | 'duplicate_experience_feature_proof_scenario'
    | 'invalid_experience_feature_proof'
    | 'missing_experience_feature_proof'
    | 'unexpected_experience_feature_proof'
    | 'unknown_experience_feature_proof';
  path: string;
  featureId: string | null;
  message: string;
}>;

export type ExperienceFeatureProofSourceResolution =
  | Readonly<{
      kind: 'invalid';
      issues: readonly ExperienceFeatureProofSourceIssue[];
      proofs: Readonly<Record<string, readonly ParsedExperienceFeatureProof[]>>;
    }>
  | Readonly<{
      kind: 'resolved';
      proofs: Readonly<Record<string, readonly ParsedExperienceFeatureProof[]>>;
    }>;

const claims = new Set<ExperienceFeatureProofClaim>([
  'component-interaction',
  'presentation-state',
]);

const issue = (
  code: ExperienceFeatureProofSourceIssue['code'],
  path: string,
  featureId: string | null,
  message: string,
): ExperienceFeatureProofSourceIssue =>
  Object.freeze({ code, path, featureId, message });

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
  expression !== null && ts.isStringLiteral(expression)
    ? expression.text
    : null;

type ImportedFeatureDeclaration = Readonly<{
  exportName: string;
  moduleSpecifier: string;
}>;

const modulePathWithoutExtension = (modulePath: string): string =>
  modulePath.replace(/\.(?:[cm]?[jt]sx?)$/u, '');

const resolvedDeclarationImportPath = (
  proofPath: string,
  moduleSpecifier: string,
): string | null =>
  moduleSpecifier.startsWith('.')
    ? modulePathWithoutExtension(
        path.posix.normalize(
          path.posix.join(path.posix.dirname(proofPath), moduleSpecifier),
        ),
      )
    : null;

const parseProofCall = (
  call: ts.CallExpression,
  sourcePath: string,
  hasCanonicalImport: boolean,
  importedDeclarations: ReadonlyMap<string, ImportedFeatureDeclaration>,
): Readonly<{
  proof: ParsedExperienceFeatureProof | null;
  issues: readonly ExperienceFeatureProofSourceIssue[];
}> => {
  const issues: ExperienceFeatureProofSourceIssue[] = [];
  if (!hasCanonicalImport)
    issues.push(
      issue(
        'invalid_experience_feature_proof',
        sourcePath,
        null,
        'proveExperienceFeature must use the canonical @pressly/testkit/experience-feature-proof import.',
      ),
    );
  const input = call.arguments[0];
  if (
    input === undefined ||
    call.arguments.length !== 1 ||
    !ts.isObjectLiteralExpression(input)
  ) {
    issues.push(
      issue(
        'invalid_experience_feature_proof',
        sourcePath,
        null,
        'proveExperienceFeature requires one inline object literal.',
      ),
    );
    return Object.freeze({ proof: null, issues: Object.freeze(issues) });
  }

  const featureId = literalString(property(input, 'featureId'));
  const featureExpression = property(input, 'feature');
  const declarationLocalName =
    featureExpression !== null && ts.isIdentifier(featureExpression)
      ? featureExpression.text
      : null;
  const declaration =
    declarationLocalName === null
      ? undefined
      : importedDeclarations.get(declarationLocalName);
  const scenariosExpression = property(input, 'scenarios');
  if (featureId === null || featureId.trim().length === 0)
    issues.push(
      issue(
        'invalid_experience_feature_proof',
        sourcePath,
        featureId,
        'featureId must be a non-empty string literal.',
      ),
    );
  if (declaration === undefined)
    issues.push(
      issue(
        'invalid_experience_feature_proof',
        sourcePath,
        featureId,
        'feature must be a directly imported feature declaration identifier.',
      ),
    );
  if (
    scenariosExpression === null ||
    !ts.isArrayLiteralExpression(scenariosExpression) ||
    scenariosExpression.elements.length === 0
  )
    issues.push(
      issue(
        'invalid_experience_feature_proof',
        sourcePath,
        featureId,
        'scenarios must be a non-empty inline array literal.',
      ),
    );

  const scenarios: ParsedExperienceFeatureProofScenario[] = [];
  if (
    scenariosExpression !== null &&
    ts.isArrayLiteralExpression(scenariosExpression)
  )
    for (const scenarioExpression of scenariosExpression.elements) {
      if (!ts.isObjectLiteralExpression(scenarioExpression)) {
        issues.push(
          issue(
            'invalid_experience_feature_proof',
            sourcePath,
            featureId,
            'Every feature scenario must be an inline object literal.',
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
        ts.isBlock(runExpression.body) &&
        runExpression.body.statements.length > 0;
      if (name === null || name.trim().length === 0)
        issues.push(
          issue(
            'invalid_experience_feature_proof',
            sourcePath,
            featureId,
            'Every feature scenario name must be a non-empty string literal.',
          ),
        );
      if (
        provesExpression === null ||
        !ts.isArrayLiteralExpression(provesExpression) ||
        provesExpression.elements.length === 0
      )
        issues.push(
          issue(
            'invalid_experience_feature_proof',
            sourcePath,
            featureId,
            'Every feature scenario proves value must be a non-empty inline array.',
          ),
        );
      if (!hasExecutableRun)
        issues.push(
          issue(
            'invalid_experience_feature_proof',
            sourcePath,
            featureId,
            'Every feature scenario run must be a non-empty inline function.',
          ),
        );

      const proves: ExperienceFeatureProofClaim[] = [];
      if (
        provesExpression !== null &&
        ts.isArrayLiteralExpression(provesExpression)
      )
        for (const value of provesExpression.elements) {
          const claim = literalString(value);
          if (
            claim === null ||
            !claims.has(claim as ExperienceFeatureProofClaim)
          )
            issues.push(
              issue(
                'invalid_experience_feature_proof',
                sourcePath,
                featureId,
                `Unknown Experience feature proof claim ${value.getText()}.`,
              ),
            );
          else proves.push(claim as ExperienceFeatureProofClaim);
        }
      if (name !== null)
        scenarios.push(Object.freeze({ name, proves: Object.freeze(proves) }));
    }

  return Object.freeze({
    proof:
      featureId === null || declaration === undefined
        ? null
        : Object.freeze({
            featureId,
            declarationName: declaration.exportName,
            declarationModuleSpecifier: declaration.moduleSpecifier,
            path: sourcePath,
            scenarios: Object.freeze(scenarios),
          }),
    issues: Object.freeze(issues),
  });
};

export const parseExperienceFeatureProofSource = (
  source: ExperienceFeatureProofSource,
): Readonly<{
  proofs: readonly ParsedExperienceFeatureProof[];
  issues: readonly ExperienceFeatureProofSourceIssue[];
}> => {
  const sourceFile = ts.createSourceFile(
    source.path,
    source.source,
    ts.ScriptTarget.Latest,
    true,
    source.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let hasCanonicalImport = false;
  const importedDeclarations = new Map<string, ImportedFeatureDeclaration>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const moduleSpecifier = ts.isStringLiteral(statement.moduleSpecifier)
      ? statement.moduleSpecifier.text
      : '';
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const specifier of bindings.elements) {
      const importedName = specifier.propertyName?.text ?? specifier.name.text;
      if (
        moduleSpecifier === '@pressly/testkit/experience-feature-proof' &&
        importedName === 'proveExperienceFeature' &&
        specifier.name.text === 'proveExperienceFeature'
      )
        hasCanonicalImport = true;
      else
        importedDeclarations.set(
          specifier.name.text,
          Object.freeze({
            exportName: importedName,
            moduleSpecifier,
          }),
        );
    }
  }

  const proofs: ParsedExperienceFeatureProof[] = [];
  const issues: ExperienceFeatureProofSourceIssue[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'proveExperienceFeature'
    ) {
      const parsed = parseProofCall(
        node,
        source.path,
        hasCanonicalImport,
        importedDeclarations,
      );
      if (parsed.proof !== null) proofs.push(parsed.proof);
      issues.push(...parsed.issues);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return Object.freeze({
    proofs: Object.freeze(proofs),
    issues: Object.freeze(issues),
  });
};

export const resolveExperienceFeatureProofSources = (
  targets: readonly ExperienceFeatureProofTarget[],
  sources: readonly ExperienceFeatureProofSource[],
): ExperienceFeatureProofSourceResolution => {
  const targetById = new Map(
    targets.map((target) => [target.featureId, target] as const),
  );
  const proofsById = new Map<string, ParsedExperienceFeatureProof[]>();
  const issues: ExperienceFeatureProofSourceIssue[] = [];

  for (const target of targets) {
    const featureDirectory = path.posix.dirname(target.declarationPath);
    for (const proofPath of [
      ...new Set([...target.stateProofs, ...target.componentProofs]),
    ])
      if (path.posix.dirname(proofPath) !== featureDirectory)
        issues.push(
          issue(
            'invalid_experience_feature_proof',
            proofPath,
            target.featureId,
            `Feature proofs must be colocated with ${target.declarationPath}.`,
          ),
        );
  }

  for (const source of sources) {
    const parsed = parseExperienceFeatureProofSource(source);
    issues.push(...parsed.issues);
    for (const proof of parsed.proofs) {
      const target = targetById.get(proof.featureId);
      if (target === undefined) {
        issues.push(
          issue(
            'unknown_experience_feature_proof',
            proof.path,
            proof.featureId,
            'The proof does not match a selected Experience feature.',
          ),
        );
        continue;
      }
      if (
        ![...target.stateProofs, ...target.componentProofs].includes(proof.path)
      )
        issues.push(
          issue(
            'unexpected_experience_feature_proof',
            proof.path,
            proof.featureId,
            'The proof path is not declared by the Experience feature manifest.',
          ),
        );
      if (proof.declarationName !== target.declarationExportName)
        issues.push(
          issue(
            'invalid_experience_feature_proof',
            proof.path,
            proof.featureId,
            `Feature declaration must be ${target.declarationExportName}; found ${proof.declarationName}.`,
          ),
        );
      const importedDeclarationPath = resolvedDeclarationImportPath(
        proof.path,
        proof.declarationModuleSpecifier,
      );
      if (
        importedDeclarationPath !==
        modulePathWithoutExtension(target.declarationPath)
      )
        issues.push(
          issue(
            'invalid_experience_feature_proof',
            proof.path,
            proof.featureId,
            `Feature declaration must be imported from ${target.declarationPath}; found ${proof.declarationModuleSpecifier}.`,
          ),
        );
      const current = proofsById.get(proof.featureId) ?? [];
      current.push(proof);
      proofsById.set(proof.featureId, current);
    }
  }

  const resolvedProofs: Record<
    string,
    readonly ParsedExperienceFeatureProof[]
  > = {};
  for (const target of targets) {
    const proofs = proofsById.get(target.featureId) ?? [];
    const names = proofs.flatMap((proof) =>
      proof.scenarios.map((scenario) => scenario.name),
    );
    for (const duplicate of [
      ...new Set(names.filter((name, index) => names.indexOf(name) !== index)),
    ])
      issues.push(
        issue(
          'duplicate_experience_feature_proof_scenario',
          proofs[0]?.path ?? target.componentProofs[0] ?? '',
          target.featureId,
          `Feature proof scenario name "${duplicate}" is repeated.`,
        ),
      );

    for (const statePath of target.stateProofs)
      if (
        !proofs.some(
          (proof) =>
            proof.path === statePath &&
            proof.scenarios.some((scenario) =>
              scenario.proves.includes('presentation-state'),
            ),
        )
      )
        issues.push(
          issue(
            'missing_experience_feature_proof',
            statePath,
            target.featureId,
            'Declared state proof must execute a presentation-state scenario.',
          ),
        );
    for (const componentPath of target.componentProofs)
      if (
        !proofs.some(
          (proof) =>
            proof.path === componentPath &&
            proof.scenarios.some((scenario) =>
              scenario.proves.includes('component-interaction'),
            ),
        )
      )
        issues.push(
          issue(
            'missing_experience_feature_proof',
            componentPath,
            target.featureId,
            'Declared component proof must execute a component-interaction scenario.',
          ),
        );
    resolvedProofs[target.featureId] = Object.freeze(proofs);
  }

  const frozen = Object.freeze(resolvedProofs);
  return issues.length === 0
    ? Object.freeze({ kind: 'resolved', proofs: frozen })
    : Object.freeze({
        kind: 'invalid',
        issues: Object.freeze(
          [...issues].sort(
            (left, right) =>
              left.path.localeCompare(right.path) ||
              left.message.localeCompare(right.message),
          ),
        ),
        proofs: frozen,
      });
};
