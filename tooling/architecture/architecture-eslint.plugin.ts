import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ArchitectureRole } from './architecture-definition.factory.ts';
import type {
  CompiledV2Module,
  RepositoryArchitecture,
  SourceLocation,
} from './architecture-compiler.ts';

type AstNode = Readonly<{
  type: string;
  value?: unknown;
  source?: Readonly<{ value?: unknown }>;
  importKind?: string;
  exportKind?: string;
  specifiers?: readonly AstNode[];
  declaration?: AstNode | null;
  local?: AstNode;
  exported?: AstNode;
  callee?: AstNode;
  object?: AstNode;
  property?: AstNode;
  name?: string;
  id?: AstNode | null;
  declarations?: readonly AstNode[];
  init?: AstNode | null;
  computed?: boolean;
  arguments?: readonly AstNode[];
  async?: boolean;
  body?: readonly AstNode[] | AstNode;
  members?: readonly AstNode[];
  typeAnnotation?: AstNode;
  typeArguments?: AstNode;
  typeParameters?: AstNode;
  params?: readonly AstNode[];
  types?: readonly AstNode[];
  typeName?: AstNode;
  extends?: readonly AstNode[];
  expression?: AstNode;
  superClass?: AstNode | null;
}>;

type RuleContext = Readonly<{
  filename: string;
  report: (
    input: Readonly<{
      node: AstNode;
      messageId: string;
      data?: Readonly<Record<string, string>>;
    }>,
  ) => void;
}>;

type RuleModule = Readonly<{
  meta: Readonly<Record<string, unknown>>;
  create: (
    context: RuleContext,
  ) => Readonly<Record<string, (node: AstNode) => void>>;
}>;

export type ArchitectureEslintPlugin = Readonly<{
  rules: Readonly<Record<string, RuleModule>>;
}>;

export type ArchitectureEslintPluginOptions = Readonly<{
  architecture: RepositoryArchitecture;
  repositoryRoot: string;
}>;

type OwnedModuleFile = Readonly<{
  module: CompiledV2Module;
  moduleKey: string;
  absolutePath: string;
  sourceRoot: string;
  relativePath: string;
  location: SourceLocation;
}>;

const importSpecifier = (node: AstNode): string | null => {
  const value = node.source?.value;
  return typeof value === 'string' ? value : null;
};

const importVisitors = (
  visitor: (node: AstNode) => void,
): Readonly<Record<string, (node: AstNode) => void>> => ({
  ImportDeclaration: visitor,
  ImportExpression: visitor,
  ExportAllDeclaration: visitor,
  ExportNamedDeclaration: visitor,
});

const identifierName = (node: AstNode | undefined): string | null =>
  node?.type === 'Identifier' && typeof node.name === 'string'
    ? node.name
    : null;

const nativeThrowableNames = new Set([
  'AggregateError',
  'DOMException',
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
]);

const nativeThrowableName = (node: AstNode | undefined): string | null => {
  const name = identifierName(node);
  return name !== null && nativeThrowableNames.has(name) ? name : null;
};

const exportedName = (node: AstNode | undefined): string | null => {
  const identifier = identifierName(node);
  if (identifier !== null) return identifier;
  return typeof node?.value === 'string' ? node.value : null;
};

const memberNames = (
  node: AstNode | undefined,
): Readonly<{ object: string; property: string }> | null => {
  if (node?.type !== 'MemberExpression') return null;
  const object = identifierName(node.object);
  const property = identifierName(node.property);
  return object === null || property === null
    ? null
    : Object.freeze({ object, property });
};

const isTypeOnlyImport = (node: AstNode): boolean =>
  node.importKind === 'type' ||
  (node.specifiers?.length !== 0 &&
    node.specifiers?.every((specifier) => specifier.importKind === 'type') ===
      true);

const isTypeOnlyEdge = (node: AstNode): boolean =>
  isTypeOnlyImport(node) ||
  node.exportKind === 'type' ||
  (node.specifiers?.length !== 0 &&
    node.specifiers?.every((specifier) => specifier.exportKind === 'type') ===
      true);

const pureRoles = new Set<ArchitectureRole>([
  'entity',
  'value',
  'event',
  'lifecycle',
  'model',
  'policy',
  'projection',
  'algorithm',
  'failure',
  'error',
  'contract.mapper',
  'persistence.mapper',
  'projection.mapper',
  'factory',
]);

const forbiddenPureImports = [
  /^node:(?:assert|async_hooks|child_process|cluster|dgram|dns|fs|http|https|net|os|perf_hooks|process|readline|repl|stream|tls|tty|v8|vm|worker_threads)(?:\/.*)?$/,
  /^express$/,
  /^drizzle-orm(?:\/.*)?$/,
  /^@pressly\/(?:config|db|http|logging|metrics|observability)(?:\/.*)?$/,
  /^next(?:\/.*)?$/,
  /^react(?:\/.*)?$/,
];

const runtimeDeclarationTypes = new Set([
  'ClassDeclaration',
  'FunctionDeclaration',
  'TSEnumDeclaration',
  'VariableDeclaration',
]);

const declarationNames = (
  node: AstNode | null | undefined,
): readonly string[] => {
  if (node === null || node === undefined) return Object.freeze([]);
  if (node.type === 'VariableDeclaration')
    return Object.freeze(
      (node.declarations ?? [])
        .map((declaration) => identifierName(declaration.id ?? undefined))
        .filter((name): name is string => name !== null),
    );

  const name = identifierName(node.id ?? undefined);
  return Object.freeze(name === null ? [] : [name]);
};

const typeMembers = (
  node: AstNode | readonly AstNode[] | null | undefined,
): readonly AstNode[] => {
  if (node === null || node === undefined) return Object.freeze([]);
  if (Array.isArray(node)) return Object.freeze([...node]);

  const current = node as AstNode;
  if (
    current.type === 'TSTypeAnnotation' ||
    current.type === 'TSParenthesizedType'
  )
    return typeMembers(current.typeAnnotation);
  if (current.type === 'TSTypeLiteral')
    return Object.freeze([...(current.members ?? [])]);
  if (current.type === 'TSInterfaceBody') return typeMembers(current.body);
  if (current.type === 'TSTypeReference')
    return Object.freeze(
      [
        ...(current.typeArguments?.params ?? []),
        ...(current.typeParameters?.params ?? []),
      ].flatMap((argument) => typeMembers(argument)),
    );
  if (current.type === 'TSIntersectionType')
    return Object.freeze(
      (current.types ?? []).flatMap((member) => typeMembers(member)),
    );
  return Object.freeze([]);
};

const isCallableType = (node: AstNode | null | undefined): boolean => {
  if (node === null || node === undefined) return false;
  if (node.type === 'TSFunctionType') return true;
  if (node.type === 'TSTypeAnnotation' || node.type === 'TSParenthesizedType')
    return isCallableType(node.typeAnnotation);
  return false;
};

const callableMemberCount = (node: AstNode): number => {
  const shape =
    node.type === 'TSTypeAliasDeclaration'
      ? node.typeAnnotation
      : node.type === 'TSInterfaceDeclaration'
        ? node.body !== undefined && 'type' in node.body
          ? node.body
          : undefined
        : undefined;

  return typeMembers(shape).filter(
    (member) =>
      member.type === 'TSMethodSignature' ||
      member.type === 'TSCallSignatureDeclaration' ||
      (member.type === 'TSPropertySignature' &&
        isCallableType(member.typeAnnotation)),
  ).length;
};

const exportedPackageSourceEntrypoints = (
  repositoryRoot: string,
): ReadonlySet<string> => {
  const packagesRoot = path.join(repositoryRoot, 'packages');
  if (!existsSync(packagesRoot)) return new Set<string>();

  const entrypoints = new Set<string>();
  for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageRoot = path.join(packagesRoot, entry.name);
    const manifestPath = path.join(packageRoot, 'package.json');
    if (!existsSync(manifestPath)) continue;

    const manifest = JSON.parse(
      readFileSync(manifestPath, 'utf8'),
    ) as Readonly<{
      exports?: Readonly<Record<string, unknown>>;
    }>;
    for (const exported of Object.values(manifest.exports ?? {})) {
      const typesTarget =
        typeof exported === 'string'
          ? exported
          : typeof exported === 'object' &&
              exported !== null &&
              'types' in exported
            ? (exported as Readonly<{ types?: unknown }>).types
            : undefined;
      if (typeof typesTarget !== 'string' || !typesTarget.startsWith('./dist/'))
        continue;

      const sourceRelative = typesTarget
        .slice('./dist/'.length)
        .replace(/\.d\.(?:cts|mts|ts)$/, '.ts');
      entrypoints.add(path.resolve(packageRoot, 'src', sourceRelative));
    }
  }

  return entrypoints;
};

export const makeArchitectureEslintPlugin = ({
  architecture,
  repositoryRoot,
}: ArchitectureEslintPluginOptions): ArchitectureEslintPlugin => {
  const modulesRoot = path.join(repositoryRoot, 'modules');
  const appsRoot = path.join(repositoryRoot, 'apps');
  const packagesRoot = path.join(repositoryRoot, 'packages');
  const declaredSymbolSurfaces = new Set(
    architecture.symbolSurfaces.map((surface) =>
      path.resolve(repositoryRoot, surface),
    ),
  );
  const packageSourceEntrypoints =
    exportedPackageSourceEntrypoints(repositoryRoot);

  const ownedV2File = (filename: string): OwnedModuleFile | null => {
    const absolutePath = path.resolve(filename);
    const relativeToModules = path.relative(modulesRoot, absolutePath);
    if (
      relativeToModules.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeToModules)
    )
      return null;

    const segments = relativeToModules.split(path.sep);
    const family = segments[0];
    const moduleName = segments[1];
    const sourceMarker = segments[2];
    if (
      family === undefined ||
      moduleName === undefined ||
      sourceMarker !== 'src'
    )
      return null;

    const moduleKey = `${family}/${moduleName}`;
    const module = architecture.modules.get(moduleKey);
    if (module === undefined) return null;

    const relativePath = segments.slice(3).join('/');
    const sourceRoot = path.join(modulesRoot, family, moduleName, 'src');
    return Object.freeze({
      module,
      moduleKey,
      absolutePath,
      sourceRoot,
      relativePath,
      location: architecture.classifySource(moduleKey, relativePath),
    });
  };

  const fileRole = (owned: OwnedModuleFile): ArchitectureRole | null =>
    owned.location.zone === 'feature' ||
    owned.location.zone === 'foundation' ||
    owned.location.zone === 'composition'
      ? owned.location.role
      : null;

  const fileRoleRule: RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        unknownOwner:
          'This source file is outside every declared v2 feature, foundation, or composition owner.',
        missingRole:
          'V2 module files must use a role suffix declared by their owner profile.',
        invalidRole:
          'Role "{{role}}" is not legal for architecture owner "{{owner}}".',
      },
    },
    create(context) {
      const owned = ownedV2File(context.filename);
      if (owned === null) return {};

      return {
        Program(node) {
          const location = owned.location;
          if (location.zone === 'root') return;
          if (location.zone === 'unknown') {
            context.report({ node, messageId: 'unknownOwner' });
            return;
          }

          if (location.role === null) {
            context.report({ node, messageId: 'missingRole' });
            return;
          }

          if (location.zone === 'composition') {
            if (location.role !== 'composition')
              context.report({
                node,
                messageId: 'invalidRole',
                data: { role: location.role, owner: 'composition' },
              });
            return;
          }

          const owner =
            location.zone === 'feature'
              ? owned.module.features.get(location.owner)
              : owned.module.foundations.get(location.owner);
          if (owner?.allowedRoles.has(location.role) !== true)
            context.report({
              node,
              messageId: 'invalidRole',
              data: { role: location.role, owner: location.owner },
            });
        },
      };
    },
  };

  const dependencyRule: RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        internalDependency:
          'Architecture dependency is forbidden: {{reason}}. Declare a narrow foundation edge or compose peers at the module boundary.',
        contractDependency:
          '@pressly/contracts is allowed only in a route or *.contract.mapper.ts boundary.',
        persistenceDependency:
          'Persistence mechanisms are allowed only in repositories, adapters, and *.persistence.mapper.ts files.',
        httpDependency:
          'HTTP mechanisms are allowed only in routes, controllers, middleware, and adapters.',
        publicRuntimeDependency:
          'public.ts may expose runtime declarations directly only from semantic pure roles or intentional outer adapters; application construction belongs in main.ts.',
      },
    },
    create(context) {
      const owned = ownedV2File(context.filename);
      if (owned === null) return {};

      const checkImport = (node: AstNode): void => {
        const specifier = importSpecifier(node);
        if (specifier === null) return;
        const role = fileRole(owned);
        const isCompositionBoundary = owned.location.zone === 'composition';

        if (specifier.startsWith('.')) {
          const absoluteTarget = path.resolve(
            path.dirname(owned.absolutePath),
            specifier,
          );
          const targetRelative = path
            .relative(owned.sourceRoot, absoluteTarget)
            .replaceAll(path.sep, '/');
          if (targetRelative.startsWith('../')) return;

          const decision = architecture.evaluateSourceDependency({
            moduleKey: owned.moduleKey,
            sourceRelativePath: owned.relativePath,
            targetRelativePath: targetRelative,
          });
          if (!decision.allowed)
            context.report({
              node,
              messageId: 'internalDependency',
              data: { reason: decision.reason },
            });
          else {
            const targetLocation = architecture.classifySource(
              owned.moduleKey,
              targetRelative,
            );
            const publicRuntimeRoles = new Set<ArchitectureRole>([
              'adapter',
              'algorithm',
              'command',
              'entity',
              'error',
              'factory',
              'event',
              'lifecycle',
              'policy',
              'projection',
              'value',
            ]);
            if (
              owned.location.zone === 'root' &&
              owned.location.file === 'public.ts' &&
              (targetLocation.zone === 'feature' ||
                targetLocation.zone === 'foundation') &&
              !isTypeOnlyEdge(node) &&
              (targetLocation.role === null ||
                !publicRuntimeRoles.has(targetLocation.role))
            )
              context.report({
                node,
                messageId: 'publicRuntimeDependency',
              });
          }
          return;
        }

        if (
          (specifier === '@pressly/contracts' ||
            specifier.startsWith('@pressly/contracts/')) &&
          role !== 'route' &&
          role !== 'controller' &&
          role !== 'contract.mapper'
        )
          context.report({ node, messageId: 'contractDependency' });

        if (
          (specifier === '@pressly/db' ||
            specifier.startsWith('@pressly/db/') ||
            specifier === 'drizzle-orm' ||
            specifier.startsWith('drizzle-orm/')) &&
          !isCompositionBoundary &&
          role !== 'repo' &&
          role !== 'adapter' &&
          role !== 'persistence.mapper'
        )
          context.report({ node, messageId: 'persistenceDependency' });

        if (
          (specifier === 'express' ||
            specifier === '@pressly/http' ||
            specifier.startsWith('@pressly/http/') ||
            specifier === 'next' ||
            specifier.startsWith('next/')) &&
          !isCompositionBoundary &&
          role !== 'route' &&
          role !== 'controller' &&
          role !== 'middleware' &&
          role !== 'adapter'
        )
          context.report({ node, messageId: 'httpDependency' });
      };

      return importVisitors(checkImport);
    },
  };

  const pureRoleRule: RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        effectImport:
          'Pure role files cannot import runtime effect mechanism "{{specifier}}".',
        ambientEffect:
          'Pure role files cannot use ambient effect "{{effect}}"; receive data or a capability explicitly.',
        asynchronous:
          'Pure role files must remain synchronous; move asynchronous effects to a use case or adapter.',
      },
    },
    create(context) {
      const owned = ownedV2File(context.filename);
      const role = owned === null ? null : fileRole(owned);
      if (role === null || !pureRoles.has(role)) return {};

      const reportAmbient = (node: AstNode, effect: string): void =>
        context.report({
          node,
          messageId: 'ambientEffect',
          data: { effect },
        });

      return {
        ImportDeclaration(node) {
          const specifier = importSpecifier(node);
          if (
            specifier !== null &&
            !isTypeOnlyImport(node) &&
            forbiddenPureImports.some((pattern) => pattern.test(specifier))
          )
            context.report({
              node,
              messageId: 'effectImport',
              data: { specifier },
            });
        },
        AwaitExpression(node) {
          context.report({ node, messageId: 'asynchronous' });
        },
        ':matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression)[async=true]'(
          node,
        ) {
          context.report({ node, messageId: 'asynchronous' });
        },
        CallExpression(node) {
          const callee = identifierName(node.callee);
          const member = memberNames(node.callee);
          if (
            callee !== null &&
            [
              'Date',
              'fetch',
              'queueMicrotask',
              'randomUUID',
              'setImmediate',
              'setInterval',
              'setTimeout',
            ].includes(callee)
          )
            reportAmbient(node, callee);
          else if (
            member !== null &&
            ((member.object === 'Date' && member.property === 'now') ||
              (member.object === 'Math' && member.property === 'random') ||
              (member.object === 'crypto' && member.property === 'randomUUID'))
          )
            reportAmbient(node, `${member.object}.${member.property}`);
        },
        NewExpression(node) {
          if (
            identifierName(node.callee) === 'Date' &&
            (node.arguments?.length ?? 0) === 0
          )
            reportAmbient(node, 'new Date()');
        },
        MemberExpression(node) {
          const member = memberNames(node);
          if (
            member !== null &&
            ['console', 'performance', 'process'].includes(member.object)
          )
            reportAmbient(node, `${member.object}.${member.property}`);
          else if (
            member?.object === 'globalThis' &&
            [
              'console',
              'crypto',
              'fetch',
              'performance',
              'process',
              'queueMicrotask',
              'setImmediate',
              'setInterval',
              'setTimeout',
            ].includes(member.property)
          )
            reportAmbient(node, `globalThis.${member.property}`);
        },
      };
    },
  };

  const portShapeRule: RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        valueImport: 'Port files may import only types.',
        runtimeDeclaration:
          'Port files describe types only; move runtime values and implementations to an adapter or composition file.',
        valueExport: 'Port files may export only types.',
      },
    },
    create(context) {
      const owned = ownedV2File(context.filename);
      if (owned === null || fileRole(owned) !== 'port') return {};

      return {
        ImportDeclaration(node) {
          if (!isTypeOnlyImport(node))
            context.report({ node, messageId: 'valueImport' });
        },
        ExportDefaultDeclaration(node) {
          context.report({ node, messageId: 'valueExport' });
        },
        ExportNamedDeclaration(node) {
          if (
            node.declaration !== undefined &&
            node.declaration !== null &&
            runtimeDeclarationTypes.has(node.declaration.type)
          ) {
            context.report({ node, messageId: 'runtimeDeclaration' });
            return;
          }

          if (
            node.declaration === null &&
            node.exportKind !== 'type' &&
            node.specifiers?.some(
              (specifier) => specifier.exportKind !== 'type',
            ) === true
          )
            context.report({ node, messageId: 'valueExport' });
        },
        VariableDeclaration(node) {
          context.report({ node, messageId: 'runtimeDeclaration' });
        },
        FunctionDeclaration(node) {
          context.report({ node, messageId: 'runtimeDeclaration' });
        },
        ClassDeclaration(node) {
          context.report({ node, messageId: 'runtimeDeclaration' });
        },
        TSEnumDeclaration(node) {
          context.report({ node, messageId: 'runtimeDeclaration' });
        },
      };
    },
  };

  const failureBoundaryRule: RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        unownedThrowable:
          'V2 module source cannot construct or subclass a native throwable. Return a typed *.failure.ts value for an expected outcome or construct an AppError through an explicit @pressly/errors subpath for an unexpected failure.',
        throwableFailure:
          'Expected *.failure.ts values are data and cannot throw. Return the failure through Result and present it at the application edge.',
        throwableLanguage:
          'Expected *.failure.ts values cannot depend on @pressly/errors. Throwable AppError construction belongs in *.error.ts or an effect adapter.',
      },
    },
    create(context) {
      const owned = ownedV2File(context.filename);
      if (owned === null) return {};

      const role = fileRole(owned);
      return {
        ImportDeclaration(node) {
          const specifier = importSpecifier(node);
          if (
            role === 'failure' &&
            (specifier === '@pressly/errors' ||
              specifier?.startsWith('@pressly/errors/') === true)
          )
            context.report({ node, messageId: 'throwableLanguage' });
        },
        NewExpression(node) {
          if (nativeThrowableName(node.callee) !== null)
            context.report({ node, messageId: 'unownedThrowable' });
        },
        CallExpression(node) {
          if (nativeThrowableName(node.callee) !== null)
            context.report({ node, messageId: 'unownedThrowable' });
        },
        ClassDeclaration(node) {
          if (nativeThrowableName(node.superClass ?? undefined) !== null)
            context.report({ node, messageId: 'unownedThrowable' });
        },
        ClassExpression(node) {
          if (nativeThrowableName(node.superClass ?? undefined) !== null)
            context.report({ node, messageId: 'unownedThrowable' });
        },
        ThrowStatement(node) {
          if (role === 'failure')
            context.report({ node, messageId: 'throwableFailure' });
        },
      };
    },
  };

  const semanticRoleRule: RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        applicationShapeInEntity:
          '"{{name}}" is an application/read shape, not an entity. Move it to *.model.ts (or *.value.ts for an invariant-bearing identityless value); *.entity.ts is reserved for continuity-bearing identity.',
        persistenceShapeInEntity:
          '"{{name}}" is named as a storage representation, not a domain entity. Move rows/records to a persistence mapper or rename a genuinely hydrated continuity-bearing entity in domain language.',
      },
    },
    create(context) {
      const owned = ownedV2File(context.filename);
      if (owned === null || fileRole(owned) !== 'entity') return {};

      const applicationShapeName =
        /(?:Command|Query|Input|Output|Result|Page|List|Summary|Projection|View|Mutation|Profile|Details?)$/;
      const persistenceShapeName =
        /^(?:Stored|Persisted|Database)|(?:Row|Record)$/;
      const checkDeclaration = (node: AstNode): void => {
        const name = identifierName(node.id ?? undefined);
        if (name !== null && applicationShapeName.test(name))
          context.report({
            node,
            messageId: 'applicationShapeInEntity',
            data: { name },
          });
        else if (name !== null && persistenceShapeName.test(name))
          context.report({
            node,
            messageId: 'persistenceShapeInEntity',
            data: { name },
          });
      };

      return {
        ClassDeclaration: checkDeclaration,
        TSInterfaceDeclaration: checkDeclaration,
        TSTypeAliasDeclaration: checkDeclaration,
      };
    },
  };

  const usecaseShapeRule: RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        multipleFactories:
          'A *.usecase.ts file may export one independently named make* operation; found {{names}}. Split these operations into sibling verb-object feature leaves.',
        operationFacade:
          'Exported use-case type "{{name}}" exposes {{count}} callable operations. A feature leaf owns one operation; split the facade into sibling features and compose them at the module boundary.',
        unexpectedRuntimeExport:
          'A *.usecase.ts file may export only its single make* constructor at runtime; "{{name}}" is an additional runtime export. Move pure data and transformations to their owning policy, model, or other semantic role.',
      },
    },
    create(context) {
      const owned = ownedV2File(context.filename);
      if (owned === null || fileRole(owned) !== 'usecase') return {};

      const typeDeclarations = new Map<
        string,
        Readonly<{ node: AstNode; callableCount: number }>
      >();
      const exportedTypes = new Set<string>();
      const exportedFactories = new Map<string, AstNode>();
      const unexpectedRuntimeExports = new Map<string, AstNode>();

      const rememberType = (node: AstNode): void => {
        const name = identifierName(node.id ?? undefined);
        if (name !== null)
          typeDeclarations.set(
            name,
            Object.freeze({ node, callableCount: callableMemberCount(node) }),
          );
      };

      const rememberRuntimeExport = (name: string, node: AstNode): void => {
        if (/^make[A-Z0-9]/.test(name)) exportedFactories.set(name, node);
        else unexpectedRuntimeExports.set(name, node);
      };

      const rememberExport = (node: AstNode): void => {
        const declaration = node.declaration;
        if (declaration !== null && declaration !== undefined) {
          if (
            declaration.type === 'TSTypeAliasDeclaration' ||
            declaration.type === 'TSInterfaceDeclaration'
          ) {
            rememberType(declaration);
            for (const name of declarationNames(declaration))
              exportedTypes.add(name);
          } else
            for (const name of declarationNames(declaration))
              rememberRuntimeExport(name, declaration);
        }

        for (const specifier of node.specifiers ?? []) {
          const local = exportedName(specifier.local);
          if (local === null) continue;
          const exported = exportedName(specifier.exported) ?? local;
          if (node.exportKind === 'type' || specifier.exportKind === 'type')
            exportedTypes.add(local);
          else rememberRuntimeExport(exported, specifier);
        }
      };

      const rememberDefaultExport = (node: AstNode): void => {
        const declaration = node.declaration;
        if (
          declaration?.type === 'TSTypeAliasDeclaration' ||
          declaration?.type === 'TSInterfaceDeclaration'
        ) {
          rememberType(declaration);
          for (const name of declarationNames(declaration))
            exportedTypes.add(name);
          return;
        }

        unexpectedRuntimeExports.set('default', node);
      };

      return {
        TSTypeAliasDeclaration: rememberType,
        TSInterfaceDeclaration: rememberType,
        ExportNamedDeclaration: rememberExport,
        ExportDefaultDeclaration: rememberDefaultExport,
        ExportAllDeclaration(node) {
          if (node.exportKind !== 'type')
            unexpectedRuntimeExports.set('*', node);
        },
        'Program:exit'(node) {
          const factoryNames = [...exportedFactories.keys()].sort();
          if (factoryNames.length > 1)
            context.report({
              node,
              messageId: 'multipleFactories',
              data: { names: factoryNames.join(', ') },
            });

          for (const [name, exportNode] of [...unexpectedRuntimeExports].sort(
            ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
          ))
            context.report({
              node: exportNode,
              messageId: 'unexpectedRuntimeExport',
              data: { name },
            });

          for (const name of [...exportedTypes].sort()) {
            const declaration = typeDeclarations.get(name);
            if (declaration !== undefined && declaration.callableCount > 1)
              context.report({
                node: declaration.node,
                messageId: 'operationFacade',
                data: {
                  name,
                  count: String(declaration.callableCount),
                },
              });
          }
        },
      };
    },
  };

  const symbolOwnershipRule: RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        directRelay:
          'Internal files cannot re-export from "{{target}}". Import the symbol from its semantic owner at the consumer; only declared module, package, and app surfaces curate APIs.',
        importedRelay:
          'Internal files cannot re-export imported symbol "{{name}}". Import it from its semantic owner at the consumer.',
        identityAlias:
          'Export "{{name}}" only renames imported symbol "{{source}}". Use the canonical symbol directly or define a shape that adds an invariant or transformation.',
      },
    },
    create(context) {
      const owned = ownedV2File(context.filename);
      const absolutePath = path.resolve(context.filename);
      const isInsideSourceRoot = (sourceRoot: string): boolean => {
        const relative = path.relative(sourceRoot, absolutePath);
        return (
          relative !== '' &&
          !relative.startsWith(`..${path.sep}`) &&
          !path.isAbsolute(relative) &&
          relative.split(path.sep)[1] === 'src'
        );
      };
      const isDeclaredSurface =
        declaredSymbolSurfaces.has(absolutePath) ||
        packageSourceEntrypoints.has(absolutePath);
      const enforce =
        owned !== null
          ? owned.location.zone !== 'root'
          : (isInsideSourceRoot(appsRoot) ||
              isInsideSourceRoot(packagesRoot)) &&
            !isDeclaredSurface;
      if (!enforce) return {};

      const importedNames = new Set<string>();
      const rememberImports = (node: AstNode): void => {
        for (const specifier of node.specifiers ?? []) {
          const local = identifierName(specifier.local);
          if (local !== null) importedNames.add(local);
        }
      };
      const importedReferenceName = (
        node: AstNode | null | undefined,
      ): string | null => {
        const name = identifierName(node ?? undefined);
        return name !== null && importedNames.has(name) ? name : null;
      };
      const reportIdentityAlias = (
        node: AstNode,
        exported: string | null,
        source: string,
      ): void =>
        context.report({
          node,
          messageId: 'identityAlias',
          data: { name: exported ?? 'anonymous', source },
        });

      return {
        ImportDeclaration: rememberImports,
        ExportAllDeclaration(node) {
          const target = importSpecifier(node) ?? 'another module';
          context.report({ node, messageId: 'directRelay', data: { target } });
        },
        ExportNamedDeclaration(node) {
          const target = importSpecifier(node);
          if (target !== null) {
            context.report({
              node,
              messageId: 'directRelay',
              data: { target },
            });
            return;
          }

          for (const specifier of node.specifiers ?? []) {
            const local = identifierName(specifier.local);
            if (local !== null && importedNames.has(local))
              context.report({
                node: specifier,
                messageId: 'importedRelay',
                data: { name: local },
              });
          }

          const declaration = node.declaration;
          if (declaration === null || declaration === undefined) return;

          if (
            declaration.type === 'TSTypeAliasDeclaration' &&
            declaration.typeAnnotation?.type === 'TSTypeReference' &&
            (declaration.typeAnnotation.typeArguments?.params?.length ?? 0) ===
              0
          ) {
            const source = importedReferenceName(
              declaration.typeAnnotation.typeName,
            );
            if (source !== null)
              reportIdentityAlias(
                declaration,
                identifierName(declaration.id ?? undefined),
                source,
              );
            return;
          }

          if (declaration.type === 'VariableDeclaration') {
            for (const variable of declaration.declarations ?? []) {
              const source = importedReferenceName(variable.init);
              const exported = identifierName(variable.id ?? undefined);
              const isNextMetadataBinding =
                exported === 'metadata' &&
                /\/(?:layout|page)\.[cm]?[jt]sx?$/.test(
                  absolutePath.replaceAll(path.sep, '/'),
                );
              if (source !== null && !isNextMetadataBinding)
                reportIdentityAlias(variable, exported, source);
            }
            return;
          }

          if (
            declaration.type === 'TSInterfaceDeclaration' &&
            typeMembers(declaration.body).length === 0 &&
            declaration.extends?.length === 1
          ) {
            const source = importedReferenceName(
              declaration.extends[0]?.expression,
            );
            if (source !== null)
              reportIdentityAlias(
                declaration,
                identifierName(declaration.id ?? undefined),
                source,
              );
          }
        },
      };
    },
  };

  const modulePublicSurfaceRule: RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        exportAll:
          'Module main.ts and public.ts surfaces must enumerate every exported value and type; export-star hides compatibility and dependency growth.',
        aliasedReexport:
          'Module main.ts and public.ts surfaces cannot rename "{{local}}" to "{{exported}}". Publish the canonical name or change it at the semantic owner.',
      },
    },
    create(context) {
      const owned = ownedV2File(context.filename);
      if (
        owned === null ||
        owned.location.zone !== 'root' ||
        (owned.relativePath !== 'main.ts' && owned.relativePath !== 'public.ts')
      )
        return {};

      return {
        ExportAllDeclaration(node) {
          context.report({ node, messageId: 'exportAll' });
        },
        ExportNamedDeclaration(node) {
          for (const specifier of node.specifiers ?? []) {
            const local = exportedName(specifier.local);
            const exported = exportedName(specifier.exported);
            if (local !== null && exported !== null && local !== exported)
              context.report({
                node: specifier,
                messageId: 'aliasedReexport',
                data: { local, exported },
              });
          }
        },
      };
    },
  };

  const ownedThrowableRule: RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        nativeThrowable:
          'Application and package source cannot construct or subclass native {{name}} directly. Use an explicit @pressly/errors subpath so throwable semantics have one owner.',
      },
    },
    create(context) {
      const report = (node: AstNode, name: string): void =>
        context.report({ node, messageId: 'nativeThrowable', data: { name } });

      return {
        NewExpression(node) {
          const name = nativeThrowableName(node.callee);
          if (name !== null) report(node, name);
        },
        CallExpression(node) {
          const name = nativeThrowableName(node.callee);
          if (name !== null) report(node, name);
        },
        ClassDeclaration(node) {
          const name = nativeThrowableName(node.superClass ?? undefined);
          if (name !== null) report(node, name);
        },
        ClassExpression(node) {
          const name = nativeThrowableName(node.superClass ?? undefined);
          if (name !== null) report(node, name);
        },
      };
    },
  };

  const qualifiedMapperRoleRule: RuleModule = {
    meta: {
      type: 'problem',
      schema: [],
      messages: {
        unqualified:
          'Mapper files must declare the crossed boundary with .contract.mapper, .persistence.mapper, or .projection.mapper. Use an adapter or use case when the operation performs effects.',
        asynchronous:
          'Qualified mapper files are synchronous transformations. Move asynchronous loading or orchestration into an adapter or use case.',
      },
    },
    create(context) {
      const filename = path.basename(context.filename);
      const isMapper = /\.mapper\.[cm]?[jt]sx?$/.test(filename);
      if (!isMapper) return {};

      const isQualified =
        /\.(?:contract|persistence|projection)\.mapper\.[cm]?[jt]sx?$/.test(
          filename,
        );
      if (!isQualified)
        return {
          Program(node) {
            context.report({ node, messageId: 'unqualified' });
          },
        };

      return {
        AwaitExpression(node) {
          context.report({ node, messageId: 'asynchronous' });
        },
        ':matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression)[async=true]'(
          node,
        ) {
          context.report({ node, messageId: 'asynchronous' });
        },
      };
    },
  };

  return Object.freeze({
    rules: Object.freeze({
      'module-v2-file-role': fileRoleRule,
      'module-v2-dependencies': dependencyRule,
      'module-v2-failure-boundary': failureBoundaryRule,
      'module-v2-pure-role': pureRoleRule,
      'module-v2-port-shape': portShapeRule,
      'module-v2-semantic-role': semanticRoleRule,
      'symbol-ownership': symbolOwnershipRule,
      'module-v2-usecase-shape': usecaseShapeRule,
      'module-public-surface': modulePublicSurfaceRule,
      'owned-throwable': ownedThrowableRule,
      'qualified-mapper-role': qualifiedMapperRoleRule,
    }),
  });
};
