import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { StaticArchitecturePaths } from '@pressly/cells';
import ts from 'typescript';
import type { CompiledTopology, TopologyViolation } from '../src/public.ts';

export type ExpectedFailureVariant = Readonly<{
  field: 'code' | 'kind' | 'reason';
  value: string;
}>;

export type ExpectedFailureScenario = Readonly<{
  name: string;
  path: string;
  variant: ExpectedFailureVariant;
}>;

export type OpenExpectedFailureContract = Readonly<{
  operationId: string;
  path: string;
  failureType: string;
}>;

export type ExpectedFailureProofResolution =
  | Readonly<{
      kind: 'invalid';
      violations: readonly TopologyViolation[];
      openContracts: readonly OpenExpectedFailureContract[];
    }>
  | Readonly<{
      kind: 'resolved';
      scenarios: Readonly<Record<string, readonly ExpectedFailureScenario[]>>;
      openContracts: readonly OpenExpectedFailureContract[];
    }>;

type DeclarationFailureResolution =
  | Readonly<{ kind: 'closed'; variants: readonly ExpectedFailureVariant[] }>
  | Readonly<{ kind: 'open'; failureType: string }>
  | Readonly<{ kind: 'unresolved'; message: string }>;

type NamedScenario = Readonly<{
  name: string;
  assertedValues: ReadonlySet<string>;
}>;

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

const rootCallName = (expression: ts.Expression): string | null => {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression))
    return rootCallName(expression.expression);
  if (ts.isCallExpression(expression))
    return rootCallName(expression.expression);
  if (ts.isParenthesizedExpression(expression))
    return rootCallName(expression.expression);
  return null;
};

const expectationValues = (body: ts.Node): ReadonlySet<string> => {
  const values = new Set<string>();
  const collectStrings = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      values.add(node.text);
    ts.forEachChild(node, collectStrings);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const root = rootCallName(node.expression);
      if (
        root !== null &&
        (root === 'assert' || root === 'expect' || root.startsWith('expect'))
      )
        collectStrings(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return values;
};

const literalValues = (body: ts.Node): ReadonlySet<string> => {
  const values = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      values.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(body);
  return values;
};

const containsExecutedAction = (body: ts.ConciseBody): boolean => {
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

const hasExpectation = (body: ts.Node): boolean =>
  expectationValues(body).size > 0 ||
  (() => {
    let found = false;
    const visit = (node: ts.Node): void => {
      if (found) return;
      if (ts.isCallExpression(node)) {
        const root = rootCallName(node.expression);
        if (
          root !== null &&
          (root === 'assert' || root === 'expect' || root.startsWith('expect'))
        ) {
          found = true;
          return;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
    return found;
  })();

const localArrayInitializers = (
  sourceFile: ts.SourceFile,
): ReadonlyMap<string, ts.ArrayLiteralExpression> => {
  const initializers = new Map<string, ts.ArrayLiteralExpression>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations)
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer !== undefined &&
        ts.isArrayLiteralExpression(declaration.initializer)
      )
        initializers.set(declaration.name.text, declaration.initializer);
  }
  return initializers;
};

const arrayLiteral = (
  expression: ts.Expression | undefined,
  arrays: ReadonlyMap<string, ts.ArrayLiteralExpression>,
): ts.ArrayLiteralExpression | null => {
  if (expression === undefined) return null;
  if (ts.isArrayLiteralExpression(expression)) return expression;
  return ts.isIdentifier(expression)
    ? (arrays.get(expression.text) ?? null)
    : null;
};

const rowName = (row: ts.Expression, index: number): string => {
  if (ts.isObjectLiteralExpression(row))
    return literalString(property(row, 'name')) ?? `row ${index + 1}`;
  if (ts.isArrayLiteralExpression(row))
    return literalString(row.elements[0] ?? null) ?? `row ${index + 1}`;
  return `row ${index + 1}`;
};

const rowValues = (row: ts.Expression): ReadonlySet<string> => {
  const values = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      values.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(row);
  return values;
};

export const parseNamedExpectedFailureScenarios = (input: {
  path: string;
  source: string;
}): readonly NamedScenario[] => {
  const sourceFile = ts.createSourceFile(
    input.path,
    input.source,
    ts.ScriptTarget.Latest,
    true,
    input.path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const arrays = localArrayInitializers(sourceFile);
  const scenarios: NamedScenario[] = [];

  const addScenario = (name: string, body: ts.Node): void => {
    if (!hasExpectation(body)) return;
    scenarios.push(
      Object.freeze({ name, assertedValues: expectationValues(body) }),
    );
  };

  const visit = (node: ts.Node): void => {
    if (!ts.isCallExpression(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    if (
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'proveOperation'
    ) {
      const proof = node.arguments[0];
      if (proof !== undefined && ts.isObjectLiteralExpression(proof)) {
        const scenariosExpression = property(proof, 'scenarios');
        if (
          scenariosExpression !== null &&
          ts.isArrayLiteralExpression(scenariosExpression)
        )
          for (const scenario of scenariosExpression.elements) {
            if (!ts.isObjectLiteralExpression(scenario)) continue;
            const name = literalString(property(scenario, 'name'));
            const run = property(scenario, 'run');
            if (
              name === null ||
              run === null ||
              (!ts.isArrowFunction(run) && !ts.isFunctionExpression(run))
            )
              continue;
            const explicitVariant = literalString(
              property(scenario, 'expectedFailure'),
            );
            if (!containsExecutedAction(run.body)) continue;
            const assertedValues = new Set(literalValues(run.body));
            if (explicitVariant !== null)
              assertedValues.add(
                explicitVariant.slice(explicitVariant.indexOf(':') + 1),
              );
            if (assertedValues.size > 0)
              scenarios.push(Object.freeze({ name, assertedValues }));
          }
      }
      return;
    }

    if (
      ts.isIdentifier(node.expression) &&
      (node.expression.text === 'it' || node.expression.text === 'test')
    ) {
      const name = literalString(node.arguments[0] ?? null);
      const body = node.arguments[1];
      if (
        name !== null &&
        body !== undefined &&
        (ts.isArrowFunction(body) || ts.isFunctionExpression(body))
      )
        addScenario(name, body.body);
      return;
    }

    if (ts.isCallExpression(node.expression)) {
      const each = node.expression;
      if (
        ts.isPropertyAccessExpression(each.expression) &&
        each.expression.name.text === 'each' &&
        ts.isIdentifier(each.expression.expression) &&
        (each.expression.expression.text === 'it' ||
          each.expression.expression.text === 'test')
      ) {
        const template = literalString(node.arguments[0] ?? null);
        const body = node.arguments[1];
        const rows = arrayLiteral(each.arguments[0], arrays);
        if (
          template !== null &&
          body !== undefined &&
          (ts.isArrowFunction(body) || ts.isFunctionExpression(body)) &&
          rows !== null &&
          hasExpectation(body.body)
        )
          rows.elements.forEach((row, index) =>
            scenarios.push(
              Object.freeze({
                name: `${template} [${rowName(row, index)}]`,
                assertedValues: rowValues(row),
              }),
            ),
          );
        return;
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return Object.freeze(scenarios);
};

export const missingExpectedFailureVariants = (input: {
  variants: readonly ExpectedFailureVariant[];
  scenarios: readonly NamedScenario[];
}): readonly ExpectedFailureVariant[] =>
  Object.freeze(
    input.variants.filter(
      ({ value }) =>
        !input.scenarios.some(({ assertedValues }) =>
          assertedValues.has(value),
        ),
    ),
  );

export const selectExpectedFailureDiscriminant = (
  candidates: readonly Readonly<{
    field: ExpectedFailureVariant['field'];
    values: readonly string[] | null;
  }>[],
): Readonly<{
  field: ExpectedFailureVariant['field'];
  values: readonly string[];
}> | null => {
  const finite = candidates.find(({ values }) => values !== null);
  return finite?.values === null || finite?.values === undefined
    ? null
    : Object.freeze({ field: finite.field, values: finite.values });
};

const exportedVariable = (
  sourceFile: ts.SourceFile,
  name: string,
): ts.VariableDeclaration | null => {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (
      statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      ) !== true
    )
      continue;
    for (const declaration of statement.declarationList.declarations)
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name)
        return declaration;
  }
  return null;
};

const declarationFailure = (
  program: ts.Program,
  checker: ts.TypeChecker,
  cellPath: string,
  declarationName: string,
): DeclarationFailureResolution => {
  const sourceFile = program.getSourceFile(cellPath);
  if (sourceFile === undefined)
    return Object.freeze({
      kind: 'unresolved',
      message: `The TypeScript program did not load ${cellPath}.`,
    });
  const declaration = exportedVariable(sourceFile, declarationName);
  if (declaration === null || !ts.isIdentifier(declaration.name))
    return Object.freeze({
      kind: 'unresolved',
      message: `${cellPath} does not export ${declarationName}.`,
    });

  const declarationType = checker.getTypeAtLocation(declaration.name);
  const contractSymbol = declarationType.getProperty('contract');
  if (contractSymbol === undefined)
    return Object.freeze({
      kind: 'unresolved',
      message: `${declarationName} has no typed contract property.`,
    });
  const contractType = checker.getTypeOfSymbolAtLocation(
    contractSymbol,
    declaration.name,
  );
  const failureSymbol = contractType.getProperty('failure');
  if (failureSymbol === undefined)
    return Object.freeze({
      kind: 'unresolved',
      message: `${declarationName} has no typed failure contract.`,
    });
  const failureContractType = checker.getTypeOfSymbolAtLocation(
    failureSymbol,
    declaration.name,
  );
  const decodeSymbol = failureContractType.getProperty('decode');
  const decodeType =
    decodeSymbol === undefined
      ? null
      : checker.getTypeOfSymbolAtLocation(decodeSymbol, declaration.name);
  const returnType = decodeType?.getCallSignatures()[0]?.getReturnType();
  if (returnType === undefined)
    return Object.freeze({
      kind: 'unresolved',
      message: `${declarationName} failure contract has no decode signature.`,
    });

  let failureType: ts.Type | null = null;
  for (const branch of returnType.isUnion() ? returnType.types : [returnType]) {
    const kindSymbol = branch.getProperty('kind');
    if (kindSymbol === undefined) continue;
    const kindType = checker.getTypeOfSymbolAtLocation(
      kindSymbol,
      declaration.name,
    );
    if (checker.typeToString(kindType) !== '"valid"') continue;
    const valueSymbol = branch.getProperty('value');
    if (valueSymbol !== undefined)
      failureType = checker.getTypeOfSymbolAtLocation(
        valueSymbol,
        declaration.name,
      );
  }
  if (failureType === null)
    return Object.freeze({
      kind: 'unresolved',
      message: `${declarationName} failure decoder has no valid value branch.`,
    });
  if ((failureType.flags & ts.TypeFlags.Never) !== 0)
    return Object.freeze({ kind: 'closed', variants: Object.freeze([]) });

  const literalValues = (
    field: ExpectedFailureVariant['field'],
  ): readonly string[] | null => {
    const values: string[] = [];
    for (const member of failureType.isUnion()
      ? failureType.types
      : [failureType]) {
      const symbol = member.getProperty(field);
      if (symbol === undefined) return null;
      const propertyType = checker.getTypeOfSymbolAtLocation(
        symbol,
        declaration.name,
      );
      for (const valueType of propertyType.isUnion()
        ? propertyType.types
        : [propertyType]) {
        if ((valueType.flags & ts.TypeFlags.StringLiteral) === 0) return null;
        values.push((valueType as ts.StringLiteralType).value);
      }
    }
    return Object.freeze([...new Set(values)].sort());
  };

  const discriminant = selectExpectedFailureDiscriminant(
    (['code', 'kind', 'reason'] as const).map((field) =>
      Object.freeze({ field, values: literalValues(field) }),
    ),
  );
  if (discriminant !== null)
    return Object.freeze({
      kind: 'closed',
      variants: Object.freeze(
        discriminant.values.map((value) =>
          Object.freeze({ field: discriminant.field, value }),
        ),
      ),
    });
  return Object.freeze({
    kind: 'open',
    failureType: checker.typeToString(
      failureType,
      declaration.name,
      ts.TypeFormatFlags.NoTruncation,
    ),
  });
};

const compilerOptions = (
  repositoryRoot: string,
  ownerDirectory: string,
): Readonly<{
  rootNames: readonly string[];
  options: ts.CompilerOptions;
}> | null => {
  const ownerConfigPath = path.join(
    repositoryRoot,
    ownerDirectory,
    'tsconfig.json',
  );
  if (!existsSync(ownerConfigPath)) return null;
  const ownerConfig = ts.readConfigFile(ownerConfigPath, ts.sys.readFile);
  if (ownerConfig.error !== undefined) return null;
  const parsedOwner = ts.parseJsonConfigFileContent(
    ownerConfig.config,
    ts.sys,
    path.dirname(ownerConfigPath),
  );
  const sourceMapPath = path.join(
    repositoryRoot,
    'tooling/typescript/dependency-cruiser.generated.json',
  );
  if (!existsSync(sourceMapPath))
    return Object.freeze({
      rootNames: Object.freeze(parsedOwner.fileNames),
      options: parsedOwner.options,
    });
  const sourceMapConfig = ts.readConfigFile(sourceMapPath, ts.sys.readFile);
  const parsedSourceMap = ts.parseJsonConfigFileContent(
    sourceMapConfig.config,
    ts.sys,
    path.dirname(sourceMapPath),
  );
  return Object.freeze({
    rootNames: Object.freeze(parsedOwner.fileNames),
    options: Object.freeze({
      ...parsedOwner.options,
      ...(parsedSourceMap.options.baseUrl === undefined
        ? {}
        : { baseUrl: parsedSourceMap.options.baseUrl }),
      ...(parsedSourceMap.options.paths === undefined
        ? {}
        : { paths: parsedSourceMap.options.paths }),
    }),
  });
};

const violation = (operationId: string, message: string): TopologyViolation =>
  Object.freeze({ code: 'invalid_cell_source', subject: operationId, message });

export const resolveExpectedFailureProofs = (input: {
  topology: CompiledTopology;
  operations: Readonly<Record<string, StaticArchitecturePaths>>;
  repositoryRoot: string;
}): ExpectedFailureProofResolution => {
  const repositoryRoot = path.resolve(input.repositoryRoot);
  const violations: TopologyViolation[] = [];
  const openContracts: OpenExpectedFailureContract[] = [];
  const scenariosByOperation: Record<
    string,
    readonly ExpectedFailureScenario[]
  > = {};
  const cellsByOwner = new Map<
    string,
    readonly (typeof input.topology.cells)[number][]
  >();
  for (const cell of input.topology.cells) {
    const paths = input.operations[cell.manifest.id];
    if (paths === undefined) continue;
    const ownerDirectory = paths.cell.split('/').slice(0, 2).join('/');
    cellsByOwner.set(ownerDirectory, [
      ...(cellsByOwner.get(ownerDirectory) ?? []),
      cell,
    ]);
  }

  for (const [ownerDirectory, cells] of cellsByOwner) {
    const configuration = compilerOptions(repositoryRoot, ownerDirectory);
    if (configuration === null) {
      for (const cell of cells)
        violations.push(
          violation(
            cell.manifest.id,
            `Cannot resolve expected failures without ${ownerDirectory}/tsconfig.json.`,
          ),
        );
      continue;
    }
    const program = ts.createProgram({
      rootNames: [...configuration.rootNames],
      options: configuration.options,
    });
    const checker = program.getTypeChecker();

    for (const cell of cells) {
      const paths = input.operations[cell.manifest.id];
      if (paths === undefined) continue;
      const cellPath = path.join(repositoryRoot, paths.cell);
      const declared = declarationFailure(
        program,
        checker,
        cellPath,
        cell.source.manifestExportName,
      );
      if (declared.kind === 'unresolved') {
        violations.push(violation(cell.manifest.id, declared.message));
        continue;
      }
      if (declared.kind === 'open') {
        openContracts.push(
          Object.freeze({
            operationId: cell.manifest.id,
            path: paths.cell,
            failureType: declared.failureType,
          }),
        );
        continue;
      }

      const namedScenarios = paths.tests.flatMap((testPath) =>
        parseNamedExpectedFailureScenarios({
          path: testPath,
          source: readFileSync(path.join(repositoryRoot, testPath), 'utf8'),
        }),
      );
      const scenarios = declared.variants.flatMap((variant) =>
        namedScenarios
          .filter(({ assertedValues }) => assertedValues.has(variant.value))
          .map(({ name }) =>
            Object.freeze({ name, path: paths.cell, variant }),
          ),
      );
      scenariosByOperation[cell.manifest.id] = Object.freeze(scenarios);
      const missing = missingExpectedFailureVariants({
        variants: declared.variants,
        scenarios: namedScenarios,
      });
      if (missing.length > 0)
        violations.push(
          violation(
            cell.manifest.id,
            `Named executable local scenarios do not assert every declared expected failure: ${missing
              .map(({ field, value }) => `${field}:${value}`)
              .join(', ')}.`,
          ),
        );
    }
  }

  const sortedOpenContracts = Object.freeze(
    openContracts.sort((left, right) =>
      left.operationId.localeCompare(right.operationId),
    ),
  );
  if (violations.length > 0)
    return Object.freeze({
      kind: 'invalid',
      violations: Object.freeze(
        violations.sort(
          (left, right) =>
            left.subject.localeCompare(right.subject) ||
            left.message.localeCompare(right.message),
        ),
      ),
      openContracts: sortedOpenContracts,
    });
  return Object.freeze({
    kind: 'resolved',
    scenarios: Object.freeze(scenariosByOperation),
    openContracts: sortedOpenContracts,
  });
};
