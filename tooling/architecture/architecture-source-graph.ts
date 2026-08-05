import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  architectureOwnerDependencyKey,
  type ArchitectureDependencyEvidence,
  type ArchitectureImplementationBinding,
  type ArchitectureOwnerDependency,
  type ArchitectureOwnerDependencyObservation,
  type RepositoryArchitecture,
} from './architecture-compiler.ts';

export type SourceDependencyEvidence = ArchitectureDependencyEvidence &
  Readonly<{
    file: string;
    specifier: string;
  }>;

export type ObservedArchitectureOwnerDependency =
  ArchitectureOwnerDependencyObservation<SourceDependencyEvidence>;

const sourceFilesIn = (directory: string): readonly string[] =>
  existsSync(directory)
    ? Object.freeze(
        readdirSync(directory, { withFileTypes: true })
          .sort((left, right) =>
            left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
          )
          .flatMap((entry) => {
            const entryPath = path.join(directory, entry.name);
            return entry.isDirectory()
              ? sourceFilesIn(entryPath)
              : entry.isFile() && entry.name.endsWith('.ts')
                ? [entryPath]
                : [];
          }),
      )
    : Object.freeze([]);

const stringLiteralValue = (node: ts.Node): string | null =>
  ts.isStringLiteralLike(node) ? node.text : null;

const importIsTypeOnly = (node: ts.ImportDeclaration): boolean => {
  const clause = node.importClause;
  if (clause?.isTypeOnly === true) return true;
  if (clause?.name !== undefined) return false;
  if (
    clause?.namedBindings === undefined ||
    !ts.isNamedImports(clause.namedBindings) ||
    clause.namedBindings.elements.length === 0
  )
    return false;

  return clause.namedBindings.elements.every((element) => element.isTypeOnly);
};

const exportIsTypeOnly = (node: ts.ExportDeclaration): boolean => {
  if (node.isTypeOnly) return true;
  if (
    node.exportClause === undefined ||
    !ts.isNamedExports(node.exportClause) ||
    node.exportClause.elements.length === 0
  )
    return false;

  return node.exportClause.elements.every((element) => element.isTypeOnly);
};

type ImplementationTypeSite =
  | Readonly<{
      binding: Exclude<ArchitectureImplementationBinding, 'class-implements'>;
      type: ts.TypeNode;
    }>
  | Readonly<{
      binding: 'class-implements';
      expression: ts.Expression;
    }>;

const implementationBindingOrder: readonly ArchitectureImplementationBinding[] =
  Object.freeze([
    'class-implements',
    'function-parameter',
    'function-return',
    'property-annotation',
    'satisfies',
    'variable-annotation',
  ]);

const implementationTypeSitesIn = (
  source: ts.SourceFile,
): readonly ImplementationTypeSite[] => {
  const sites: ImplementationTypeSite[] = [];
  const addFunctionSites = (
    parameters: ts.NodeArray<ts.ParameterDeclaration>,
    type: ts.TypeNode | undefined,
  ): void => {
    if (type !== undefined) sites.push({ binding: 'function-return', type });
    for (const parameter of parameters)
      if (parameter.type !== undefined)
        sites.push({
          binding: 'function-parameter',
          type: parameter.type,
        });
  };

  const visit = (node: ts.Node): void => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.body !== undefined
    )
      addFunctionSites(node.parameters, node.type);
    else if (ts.isFunctionExpression(node) || ts.isArrowFunction(node))
      addFunctionSites(node.parameters, node.type);

    if (
      ts.isVariableDeclaration(node) &&
      node.initializer !== undefined &&
      node.type !== undefined
    )
      sites.push({ binding: 'variable-annotation', type: node.type });

    if (
      ts.isPropertyDeclaration(node) &&
      node.initializer !== undefined &&
      node.type !== undefined
    )
      sites.push({ binding: 'property-annotation', type: node.type });

    if (ts.isSatisfiesExpression(node))
      sites.push({ binding: 'satisfies', type: node.type });

    if (ts.isClassDeclaration(node) || ts.isClassExpression(node))
      for (const clause of node.heritageClauses ?? [])
        if (clause.token === ts.SyntaxKind.ImplementsKeyword)
          for (const implementedType of clause.types)
            sites.push({
              binding: 'class-implements',
              expression: implementedType.expression,
            });

    ts.forEachChild(node, visit);
  };

  visit(source);
  return Object.freeze(sites);
};

const importedBindingNames = (
  node: ts.ImportDeclaration,
): ReadonlySet<string> => {
  const names = new Set<string>();
  const clause = node.importClause;
  if (clause?.name !== undefined) names.add(clause.name.text);

  const bindings = clause?.namedBindings;
  if (bindings !== undefined)
    if (ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
    else for (const element of bindings.elements) names.add(element.name.text);

  return names;
};

const leftmostEntityName = (name: ts.EntityName): string => {
  let current = name;
  while (ts.isQualifiedName(current)) current = current.left;
  return current.text;
};

const leftmostExpressionName = (expression: ts.Expression): string | null => {
  let current = expression;
  while (ts.isPropertyAccessExpression(current)) current = current.expression;
  return ts.isIdentifier(current) ? current.text : null;
};

const typeUsesImportedBinding = (
  type: ts.TypeNode,
  importedNames: ReadonlySet<string>,
): boolean => {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isTypeReferenceNode(node) &&
      importedNames.has(leftmostEntityName(node.typeName))
    ) {
      found = true;
      return;
    }
    if (!found) ts.forEachChild(node, visit);
  };

  visit(type);
  return found;
};

const implementationBindingsForImport = (
  sites: readonly ImplementationTypeSite[],
  node: ts.ImportDeclaration,
): readonly ArchitectureImplementationBinding[] => {
  const importedNames = importedBindingNames(node);
  if (importedNames.size === 0) return Object.freeze([]);

  const observed = new Set<ArchitectureImplementationBinding>();
  for (const site of sites) {
    const usesImportedBinding =
      site.binding === 'class-implements'
        ? importedNames.has(leftmostExpressionName(site.expression) ?? '')
        : typeUsesImportedBinding(site.type, importedNames);
    if (usesImportedBinding) observed.add(site.binding);
  }

  return Object.freeze(
    implementationBindingOrder.filter((binding) => observed.has(binding)),
  );
};

const moduleReferencesIn = (
  filePath: string,
): readonly Readonly<{
  specifier: string;
  kind: 'runtime' | 'type';
  implementationBindings: readonly ArchitectureImplementationBinding[];
}>[] => {
  const source = ts.createSourceFile(
    filePath,
    readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const references: Readonly<{
    specifier: string;
    kind: 'runtime' | 'type';
    implementationBindings: readonly ArchitectureImplementationBinding[];
  }>[] = [];
  const implementationTypeSites = implementationTypeSitesIn(source);

  const add = (
    specifier: string | null,
    kind: 'runtime' | 'type',
    implementationBindings: readonly ArchitectureImplementationBinding[] = Object.freeze(
      [],
    ),
  ): void => {
    if (specifier !== null)
      references.push(
        Object.freeze({ specifier, kind, implementationBindings }),
      );
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node))
      add(
        stringLiteralValue(node.moduleSpecifier),
        importIsTypeOnly(node) ? 'type' : 'runtime',
        implementationBindingsForImport(implementationTypeSites, node),
      );
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined)
      add(
        stringLiteralValue(node.moduleSpecifier),
        exportIsTypeOnly(node) ? 'type' : 'runtime',
      );
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
      add(stringLiteralValue(node.argument.literal), 'type');
    else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    )
      add(stringLiteralValue(node.arguments[0]!), 'runtime');

    ts.forEachChild(node, visit);
  };

  visit(source);
  return Object.freeze(references);
};

export const observeRepositoryOwnerDependencies = (
  repositoryRoot: string,
  architecture: RepositoryArchitecture,
): readonly ObservedArchitectureOwnerDependency[] => {
  const observed = new Map<
    string,
    Readonly<{
      dependency: ArchitectureOwnerDependency;
      evidence: SourceDependencyEvidence[];
    }>
  >();

  for (const module of architecture.modules.values()) {
    const sourceRoot = path.join(repositoryRoot, 'modules', module.id, 'src');
    for (const filePath of sourceFilesIn(sourceRoot)) {
      const relativeFilePath = path
        .relative(sourceRoot, filePath)
        .replaceAll(path.sep, '/');
      const source = architecture.classifySource(module.id, relativeFilePath);
      if (source.zone !== 'feature' && source.zone !== 'foundation') continue;

      for (const reference of moduleReferencesIn(filePath)) {
        if (!reference.specifier.startsWith('.')) continue;
        const targetRelativePath = path
          .relative(
            sourceRoot,
            path.resolve(path.dirname(filePath), reference.specifier),
          )
          .replaceAll(path.sep, '/');
        if (targetRelativePath.startsWith('../')) continue;

        const target = architecture.classifySource(
          module.id,
          targetRelativePath,
        );
        if (target.zone !== 'feature' && target.zone !== 'foundation') continue;
        if (source.zone === target.zone && source.owner === target.owner)
          continue;

        const dependency = Object.freeze({
          moduleId: module.id,
          sourceZone: source.zone,
          sourceOwner: source.owner,
          targetZone: target.zone,
          targetOwner: target.owner,
        });
        const key = architectureOwnerDependencyKey(dependency);
        const current = observed.get(key);
        const evidence =
          current?.evidence ?? ([] as SourceDependencyEvidence[]);
        evidence.push(
          Object.freeze({
            file: path
              .relative(repositoryRoot, filePath)
              .replaceAll(path.sep, '/'),
            specifier: reference.specifier,
            kind: reference.kind,
            implementationBindings: reference.implementationBindings,
          }),
        );
        if (current === undefined)
          observed.set(key, Object.freeze({ dependency, evidence }));
      }
    }
  }

  return Object.freeze(
    [...observed]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([, value]) =>
        Object.freeze({
          ...value.dependency,
          evidence: Object.freeze(
            [...value.evidence].sort((left, right) => {
              const leftKey = `${left.file}|${left.specifier}|${left.kind}|${left.implementationBindings.join(',')}`;
              const rightKey = `${right.file}|${right.specifier}|${right.kind}|${right.implementationBindings.join(',')}`;
              return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
            }),
          ),
        }),
      ),
  );
};
