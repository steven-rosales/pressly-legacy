import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { toolingError } from '../../platform/errors/src/tooling-error.mjs';

const nativeThrowableNames = [
  'AggregateError',
  'DOMException',
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
];

const nativeThrowablePattern = `^(?:${nativeThrowableNames.join('|')})$`;

const hostDomainLiteralValues = new Set([
  '00000000-0000-4000-8000-000000000100',
  'access-policy',
  'allowed-production-location-ids',
  'auth_login',
  'authenticated-actor',
  'authenticated-principal',
  'bearer-session',
  'bootstrap-owner',
  'bootstrap-production',
  'central-api-error-observation',
  'cents-webhook',
  'control-auth-login-rate-chain',
  'control-boundary',
  'control-capability',
  'control-cookie-csrf',
  'control-cookie-session',
  'control-exact-origin',
  'control-identity',
  'control-invitation-accept-rate-chain',
  'control-mfa-cookie',
  'control-request-context',
  'control-session-cookie',
  'cookie-auth-failure',
  'json-document',
  'json-document-64kb',
  'order-management-business-id',
  'order-management-principal',
  'order_outbox',
  'pressly-admin',
  'pricing-change-author',
  'processor-cookie-csrf',
  'processor-cookie-or-bearer-session',
  'processor-exact-origin',
  'processor-mfa-cookie',
  'processor-session-cookie',
  'processor_auth_login',
  'raw-document-256kb',
  'request-metadata',
  'webhook_ingestion',
]);

const hostDomainOperationIdPattern =
  /^(?:access|control|customer|customers|ingress|orders|pricing|processor|production)[.][a-z0-9.-]+[.]v[1-9][0-9]*$/u;

const isHostDomainLiteral = (value) =>
  hostDomainLiteralValues.has(value) ||
  hostDomainOperationIdPattern.test(value);

const productionPeerTableNames = Object.freeze([
  'access_production_locations',
  'auth_identities',
  'business_accounts',
  'order_fulfillments',
  'order_outbox_events',
  'orders',
]);
const productionPeerTableNameSet = new Set(productionPeerTableNames);
const productionPeerSchemaMemberNames = new Set([
  'accessProductionLocations',
  'authIdentities',
  'businessAccounts',
  'orderFulfillments',
  'orderOutboxEvents',
]);
const productionPeerSchemaImportPattern =
  /^(?:@pressly\/(?:access|orders)-system\/(?:schema(?:\/|$)|testing\/(?:assembly|[^/]*schema)(?:\/|$))|(?:[.]{1,2}\/)+(?:[^/]+\/)*(?:access|orders)\/(?:src\/)?schema(?:\/|$))/u;
const productionPeerTablePattern = new RegExp(
  `(?:^|[^A-Za-z0-9_])(?:${productionPeerTableNames.join('|')})(?:$|[^A-Za-z0-9_])`,
  'u',
);

const staticString = (node) => {
  if (typeof node?.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions?.length === 0)
    return (
      node.quasis?.map((quasi) => quasi.value?.cooked ?? '').join('') ?? ''
    );
  return null;
};

const memberPropertyName = (node) => {
  if (node?.computed === false && node.property?.type === 'Identifier')
    return node.property.name;
  return staticString(node?.property);
};

const memberObjectNames = (node) => {
  const names = [];
  let candidate = node;
  while (candidate?.type === 'MemberExpression') {
    const property = memberPropertyName(candidate);
    if (property !== null) names.unshift(property);
    candidate = candidate.object;
  }
  if (candidate?.type === 'Identifier') names.unshift(candidate.name);
  return names;
};

export const nativeThrowableSyntax = Object.freeze([
  Object.freeze({
    selector: `NewExpression[callee.name=/${nativeThrowablePattern}/]`,
    message:
      'Live source cannot construct native {{callee.name}} directly. Use an explicit @pressly/errors subpath.',
  }),
  Object.freeze({
    selector: `CallExpression[callee.name=/${nativeThrowablePattern}/]`,
    message:
      'Live source cannot call native throwable constructors directly. Use an explicit @pressly/errors subpath.',
  }),
  Object.freeze({
    selector: `ClassDeclaration[superClass.name=/${nativeThrowablePattern}/]`,
    message:
      'Live source cannot subclass a native throwable. Extend the Errors-owned AppError language instead.',
  }),
  Object.freeze({
    selector: `ClassExpression[superClass.name=/${nativeThrowablePattern}/]`,
    message:
      'Live source cannot subclass a native throwable. Extend the Errors-owned AppError language instead.',
  }),
]);

export const mapperPuritySyntax = Object.freeze([
  Object.freeze({
    selector: 'AwaitExpression',
    message:
      'Qualified mappers are synchronous transformations. Move asynchronous effects to an executor or adapter.',
  }),
  Object.freeze({
    selector:
      ':matches(FunctionDeclaration, FunctionExpression, ArrowFunctionExpression)[async=true]',
    message:
      'Qualified mappers are synchronous transformations. Move asynchronous effects to an executor or adapter.',
  }),
]);

export const expectedFailureSyntax = Object.freeze([
  Object.freeze({
    selector: 'ThrowStatement',
    message:
      'Expected *.failure.ts values are data. Return them through the cell outcome instead of throwing.',
  }),
]);

export const pureDecisionSyntax = Object.freeze([
  ...mapperPuritySyntax,
  Object.freeze({
    selector:
      'CallExpression[callee.name=/^(?:Date|fetch|queueMicrotask|randomUUID|setImmediate|setInterval|setTimeout)$/]',
    message:
      'Pure cell decisions receive complete facts and cannot use ambient time, randomness, network, or scheduling effects.',
  }),
  Object.freeze({
    selector:
      "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message:
      'Pure cell decisions receive the current instant explicitly and cannot call Date.now().',
  }),
  Object.freeze({
    selector:
      "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message:
      'Pure cell decisions receive identifiers or entropy explicitly and cannot call Math.random().',
  }),
  Object.freeze({
    selector:
      "CallExpression[callee.object.name='crypto'][callee.property.name='randomUUID']",
    message:
      'Pure cell decisions receive identifiers explicitly and cannot call crypto.randomUUID().',
  }),
  Object.freeze({
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      'Pure cell decisions receive the current instant explicitly and cannot construct the current Date.',
  }),
  Object.freeze({
    selector:
      'MemberExpression[object.name=/^(?:console|performance|process)$/]',
    message:
      'Pure cell decisions cannot use process, console, or performance globals.',
  }),
  Object.freeze({
    selector:
      "MemberExpression[object.name='globalThis'][property.name=/^(?:console|crypto|fetch|performance|process|queueMicrotask|setImmediate|setInterval|setTimeout)$/]",
    message:
      'Pure cell decisions cannot reach ambient effects through globalThis.',
  }),
]);

export const entityLanguageSyntax = Object.freeze([
  Object.freeze({
    selector:
      ':matches(ClassDeclaration, TSInterfaceDeclaration, TSTypeAliasDeclaration)[id.name=/(?:Command|Query|Input|Output|Result|Page|List|Summary|Projection|View|Mutation|Profile|Details?)$/]',
    message:
      'Application and read shapes belong in model or contract files, not *.entity.ts.',
  }),
  Object.freeze({
    selector:
      ':matches(ClassDeclaration, TSInterfaceDeclaration, TSTypeAliasDeclaration)[id.name=/^(?:Stored|Persisted|Database)|(?:Row|Record)$/]',
    message:
      'Persistence representations belong in adapters or persistence mappers, not *.entity.ts.',
  }),
]);

export const aggregatePackageRootRestrictions = Object.freeze({
  paths: Object.freeze(
    ['@pressly/contracts', '@pressly/errors', '@pressly/postgres'].map((name) =>
      Object.freeze({
        name,
        message: `${name} has no aggregate public surface. Import an explicit owner subpath.`,
      }),
    ),
  ),
});

export const aggregatePackageRootDynamicSyntax = Object.freeze([
  Object.freeze({
    selector:
      'ImportExpression[source.value=/^@pressly\\/(?:contracts|errors|postgres)$/]',
    message:
      'Aggregate Contracts, Errors, and PostgreSQL roots are forbidden. Import an explicit owner subpath.',
  }),
]);

export const pureDecisionImportRestrictions = Object.freeze({
  patterns: Object.freeze([
    Object.freeze({
      regex:
        '^(?:node:|express$|react(?:/.*)?$|@pressly/(?:auth(?:-platform)?|config|http|logging|observability|postgres)(?:/.*)?$)',
      allowTypeImports: true,
      message:
        'A pure cell decision receives complete facts and cannot import process, framework, persistence, authentication, configuration, logging, or observability effects.',
    }),
  ]),
});

export const expectedFailureImportRestrictions = Object.freeze({
  patterns: Object.freeze([
    Object.freeze({
      regex: '^@pressly/errors(?:/.*)?$',
      message:
        'Expected failures are typed data and cannot depend on the throwable Errors language.',
    }),
  ]),
});

const dependencyCruiserSourcePaths = (repositoryRoot) => {
  const sourceMapPath = path.join(
    repositoryRoot,
    'tooling/typescript/dependency-cruiser.generated.json',
  );
  try {
    const sourceMap = JSON.parse(readFileSync(sourceMapPath, 'utf8'));
    const paths = sourceMap?.compilerOptions?.paths;
    if (typeof paths !== 'object' || paths === null || Array.isArray(paths))
      throw toolingError({
        code: 'dependency_cruiser_source_map_invalid',
        message:
          'Dependency Cruiser source mapping must define compilerOptions.paths.',
      });
    return paths;
  } catch (cause) {
    if (
      cause !== null &&
      typeof cause === 'object' &&
      'tag' in cause &&
      cause.tag === 'ToolingError'
    )
      throw cause;
    throw toolingError({
      code: 'dependency_cruiser_source_map_unavailable',
      message:
        'Dependency Cruiser source mapping is unavailable. Run pnpm architecture:generate.',
      cause,
    });
  }
};

const explicitSourceSurfaces = (repositoryRoot) => {
  const surfaces = new Set(
    [
      'experiences/control/src/browser/localization/index.ts',
      'experiences/processor/src/browser/localization/index.ts',
      'topology/pressly-drizzle-schema.ts',
    ].map((relativePath) => path.resolve(repositoryRoot, relativePath)),
  );

  for (const [specifier, targets] of Object.entries(
    dependencyCruiserSourcePaths(repositoryRoot),
  )) {
    if (!specifier.startsWith('@pressly/') || !Array.isArray(targets)) continue;
    for (const target of targets)
      if (typeof target === 'string' && !target.includes('*'))
        surfaces.add(path.resolve(repositoryRoot, target));
  }

  return surfaces;
};

const sourceRoots = (repositoryRoot) =>
  ['experiences', 'generated', 'hosts', 'platform', 'systems', 'topology']
    .map((sourceRoot) => path.resolve(repositoryRoot, sourceRoot))
    .sort((left, right) => right.length - left.length);

const isWithin = (candidate, owner) => {
  const relative = path.relative(owner, candidate);
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
};

const identifierName = (node) =>
  node?.type === 'Identifier' && typeof node.name === 'string'
    ? node.name
    : null;

const exportedName = (node) => {
  const identifier = identifierName(node);
  if (identifier !== null) return identifier;
  return typeof node?.value === 'string' ? node.value : null;
};

const typeMembers = (node) => {
  if (node === null || node === undefined) return [];
  if (Array.isArray(node)) return node;
  if (node.type === 'TSTypeAnnotation' || node.type === 'TSParenthesizedType')
    return typeMembers(node.typeAnnotation);
  if (node.type === 'TSTypeLiteral') return node.members ?? [];
  if (node.type === 'TSInterfaceBody') return typeMembers(node.body);
  return [];
};

const cellDirectoryFor = (filePath) => {
  const normalized = path.resolve(filePath);
  const segments = normalized.split(path.sep);
  const cellsIndex = segments.lastIndexOf('cells');
  if (cellsIndex < 0 || cellsIndex >= segments.length - 2) return null;

  let directory = path.dirname(normalized);
  const cellsRoot =
    segments.slice(0, cellsIndex + 1).join(path.sep) || path.sep;
  while (directory !== cellsRoot && isWithin(directory, cellsRoot)) {
    if (existsSync(path.join(directory, 'cell.ts'))) return directory;
    directory = path.dirname(directory);
  }

  return path.dirname(normalized);
};

export const makePresslyLanguagePlugin = ({ repositoryRoot }) => {
  const surfaces = explicitSourceSurfaces(repositoryRoot);
  const ownedSourceRoots = sourceRoots(repositoryRoot);
  const targetRootPattern =
    /^(?:experiences|generated|hosts|platform|systems|topology)\//;

  return Object.freeze({
    rules: Object.freeze({
      'mapper-role': Object.freeze({
        meta: Object.freeze({
          type: 'problem',
          schema: Object.freeze([]),
          messages: Object.freeze({
            asynchronous:
              'Qualified mappers are synchronous transformations. Move asynchronous effects to an executor or adapter.',
            unqualified:
              'Mapper files must name the crossed boundary with .contract.mapper, .persistence.mapper, or .projection.mapper.',
          }),
        }),
        create(context) {
          const filename = path.basename(context.filename);
          if (!/\.mapper\.[cm]?[jt]sx?$/.test(filename)) return {};
          if (
            !/\.(?:contract|persistence|projection)\.mapper\.[cm]?[jt]sx?$/.test(
              filename,
            )
          )
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
      }),
      'no-non-null-assertion': Object.freeze({
        meta: Object.freeze({
          type: 'problem',
          schema: Object.freeze([]),
          messages: Object.freeze({
            unsafe:
              'Live source cannot use a non-null assertion. Narrow the value or fail through its typed or invariant rail.',
          }),
        }),
        create(context) {
          return {
            TSNonNullExpression(node) {
              context.report({ node, messageId: 'unsafe' });
            },
          };
        },
      }),
      'no-double-unknown-assertion': Object.freeze({
        meta: Object.freeze({
          type: 'problem',
          schema: Object.freeze([]),
          messages: Object.freeze({
            unsafe:
              'Live source cannot coerce through unknown. Decode at the owning boundary or use a reviewed generic mechanism exception.',
          }),
        }),
        create(context) {
          const reportsUnknownBridge = (node) => {
            const expression = node.expression;
            if (
              (expression?.type === 'TSAsExpression' ||
                expression?.type === 'TSTypeAssertion') &&
              expression.typeAnnotation?.type === 'TSUnknownKeyword'
            )
              context.report({ node, messageId: 'unsafe' });
          };

          return {
            TSAsExpression: reportsUnknownBridge,
            TSTypeAssertion: reportsUnknownBridge,
          };
        },
      }),
      'host-domain-neutrality': Object.freeze({
        meta: Object.freeze({
          type: 'problem',
          schema: Object.freeze([]),
          messages: Object.freeze({
            businessLiteral:
              'Host source cannot own business provider tokens, operation ids, job labels, command selections, or business identities. Read them from generated topology data.',
          }),
        }),
        create(context) {
          const inspect = (node, value) => {
            if (typeof value === 'string' && isHostDomainLiteral(value))
              context.report({ node, messageId: 'businessLiteral' });
          };
          return {
            Literal(node) {
              inspect(node, node.value);
            },
            TemplateElement(node) {
              inspect(node, node.value?.cooked);
            },
          };
        },
      }),
      'experience-effect-ownership': Object.freeze({
        meta: Object.freeze({
          type: 'problem',
          schema: Object.freeze([]),
          messages: Object.freeze({
            ambientClock:
              'Experience source receives the current time from an injected capability; it cannot acquire ambient time.',
            ambientEnvironment:
              'Experience source receives configuration from its host; it cannot read import.meta.env.',
            ambientRandom:
              'Experience source receives identifiers or randomness from an injected capability.',
          }),
        }),
        create(context) {
          return {
            "CallExpression[callee.object.name='Date'][callee.property.name='now']"(
              node,
            ) {
              context.report({ node, messageId: 'ambientClock' });
            },
            "CallExpression[callee.object.name='Math'][callee.property.name='random']"(
              node,
            ) {
              context.report({ node, messageId: 'ambientRandom' });
            },
            "MemberExpression[object.type='MetaProperty'][property.name='env']"(
              node,
            ) {
              context.report({ node, messageId: 'ambientEnvironment' });
            },
            "NewExpression[callee.name='Date'][arguments.length=0]"(node) {
              context.report({ node, messageId: 'ambientClock' });
            },
          };
        },
      }),
      'production-peer-schema-isolation': Object.freeze({
        meta: Object.freeze({
          type: 'problem',
          schema: Object.freeze([]),
          messages: Object.freeze({
            peerSchema:
              'Production source and verification cannot declare, query, or access Access- or Orders-owned SQL schema. Use Production-local facts and an explicit public-capability test double.',
          }),
        }),
        create(context) {
          const postgresTableFactories = new Set();
          const sqlTags = new Set();
          const report = (node) =>
            context.report({ node, messageId: 'peerSchema' });
          const containsPeerTable = (value) =>
            typeof value === 'string' && productionPeerTablePattern.test(value);

          return {
            ImportDeclaration(node) {
              const source = staticString(node.source);
              if (
                source !== null &&
                productionPeerSchemaImportPattern.test(source)
              )
                report(node);

              if (source !== 'drizzle-orm' && source !== 'drizzle-orm/pg-core')
                return;
              for (const specifier of node.specifiers ?? []) {
                if (specifier.type !== 'ImportSpecifier') continue;
                const imported = identifierName(specifier.imported);
                const local = identifierName(specifier.local);
                if (local === null) continue;
                if (source === 'drizzle-orm/pg-core' && imported === 'pgTable')
                  postgresTableFactories.add(local);
                if (source === 'drizzle-orm' && imported === 'sql')
                  sqlTags.add(local);
              }
            },
            CallExpression(node) {
              if (
                node.callee?.type === 'Identifier' &&
                postgresTableFactories.has(node.callee.name) &&
                productionPeerTableNameSet.has(
                  staticString(node.arguments?.[0]),
                )
              )
                report(node);

              if (
                node.callee?.type === 'MemberExpression' &&
                node.callee.object?.type === 'Identifier' &&
                sqlTags.has(node.callee.object.name) &&
                memberPropertyName(node.callee) === 'raw' &&
                containsPeerTable(staticString(node.arguments?.[0]))
              )
                report(node);
            },
            TaggedTemplateExpression(node) {
              if (
                node.tag?.type !== 'Identifier' ||
                !sqlTags.has(node.tag.name)
              )
                return;
              const sqlText = node.quasi?.quasis
                ?.map((quasi) => quasi.value?.cooked ?? '')
                .join('');
              if (containsPeerTable(sqlText)) report(node);
            },
            MemberExpression(node) {
              const property = memberPropertyName(node);
              if (
                property !== null &&
                productionPeerSchemaMemberNames.has(property)
              ) {
                report(node);
                return;
              }
              if (property !== 'orders') return;
              if (
                memberObjectNames(node.object).some((name) =>
                  /schema/iu.test(name),
                )
              )
                report(node);
            },
          };
        },
      }),
      'system-testing-owner-schema': Object.freeze({
        meta: Object.freeze({
          type: 'problem',
          schema: Object.freeze([]),
          messages: Object.freeze({
            standaloneTable:
              'System test support cannot declare a standalone pgTable schema. Consume the owning System schema factory so tests cannot recreate peer-owned tables.',
          }),
        }),
        create(context) {
          const tableFactories = new Set();
          const namespaces = new Set();
          const report = (node) =>
            context.report({ node, messageId: 'standaloneTable' });

          return {
            ImportDeclaration(node) {
              if (staticString(node.source) !== 'drizzle-orm/pg-core') return;
              for (const specifier of node.specifiers ?? []) {
                const local = identifierName(specifier.local);
                if (local === null) continue;
                if (specifier.type === 'ImportNamespaceSpecifier')
                  namespaces.add(local);
                if (
                  specifier.type === 'ImportSpecifier' &&
                  identifierName(specifier.imported) === 'pgTable'
                )
                  tableFactories.add(local);
              }
            },
            CallExpression(node) {
              if (
                node.callee?.type === 'Identifier' &&
                tableFactories.has(node.callee.name)
              )
                report(node);
              if (
                node.callee?.type === 'MemberExpression' &&
                node.callee.object?.type === 'Identifier' &&
                namespaces.has(node.callee.object.name) &&
                memberPropertyName(node.callee) === 'pgTable'
              )
                report(node);
            },
          };
        },
      }),
      'symbol-ownership': Object.freeze({
        meta: Object.freeze({
          type: 'problem',
          schema: Object.freeze([]),
          messages: Object.freeze({
            aliasedSurface:
              'Public surfaces cannot rename "{{local}}" to "{{exported}}". Publish the canonical owner name.',
            directRelay:
              'Internal files cannot re-export from "{{target}}". Import from the semantic owner at each consumer.',
            exportAll:
              'Target public surfaces must enumerate every exported value and type; export-star hides surface growth.',
            identityAlias:
              'Export "{{name}}" is an identity alias of "{{source}}". Name the owned definition canonically or use the semantic owner directly.',
            importedRelay:
              'Internal files cannot re-export imported symbol "{{name}}".',
          }),
        }),
        create(context) {
          const absolutePath = path.resolve(context.filename);
          const isSurface = surfaces.has(absolutePath);
          const relativePath = path
            .relative(repositoryRoot, absolutePath)
            .replaceAll(path.sep, '/');
          const isTargetSurface =
            isSurface && targetRootPattern.test(relativePath);
          const isOwnedSource = ownedSourceRoots.some((root) =>
            isWithin(absolutePath, root),
          );

          if (!isOwnedSource && !isTargetSurface) return {};

          const identityReferenceName = (node) => {
            let candidate = node;
            while (
              candidate !== null &&
              candidate !== undefined &&
              [
                'ChainExpression',
                'TSAsExpression',
                'TSNonNullExpression',
                'TSSatisfiesExpression',
                'TSTypeAssertion',
              ].includes(candidate.type)
            )
              candidate = candidate.expression;
            return identifierName(candidate);
          };
          const importedMemberReferenceName = (node, importedNames) => {
            let candidate = node;
            const members = [];
            while (
              candidate !== null &&
              candidate !== undefined &&
              [
                'ChainExpression',
                'TSAsExpression',
                'TSNonNullExpression',
                'TSSatisfiesExpression',
                'TSTypeAssertion',
              ].includes(candidate.type)
            )
              candidate = candidate.expression;

            while (
              candidate?.type === 'MemberExpression' &&
              candidate.computed === false
            ) {
              const member = identifierName(candidate.property);
              if (member === null) return null;
              members.unshift(member);
              candidate = candidate.object;
            }

            const root = identifierName(candidate);
            if (
              root === null ||
              members.length === 0 ||
              !importedNames.has(root)
            )
              return null;
            return [root, ...members].join('.');
          };
          const reportIdentityAlias = (node, exported, source) =>
            context.report({
              node,
              messageId: 'identityAlias',
              data: { name: exported ?? 'anonymous', source },
            });
          const isFrameworkContractBinding = (name) =>
            ((name === 'metadata' || name === 'viewport') &&
              /\/(?:layout|page)\.[cm]?[jt]sx?$/.test(
                absolutePath.replaceAll(path.sep, '/'),
              )) ||
            (name === 'onRouterTransitionStart' &&
              /\/instrumentation-client\.[cm]?[jt]s$/.test(
                absolutePath.replaceAll(path.sep, '/'),
              ));
          const inspectIdentityDeclaration = (
            declaration,
            importedNames = new Set(),
          ) => {
            if (declaration === null || declaration === undefined) return;

            if (
              declaration.type === 'TSTypeAliasDeclaration' &&
              declaration.typeAnnotation?.type === 'TSTypeReference' &&
              (declaration.typeAnnotation.typeArguments?.params?.length ??
                0) === 0
            ) {
              const source = identityReferenceName(
                declaration.typeAnnotation.typeName,
              );
              if (source !== null)
                reportIdentityAlias(
                  declaration,
                  identifierName(declaration.id),
                  source,
                );
              return;
            }

            if (declaration.type === 'VariableDeclaration') {
              for (const variable of declaration.declarations ?? []) {
                const source =
                  identityReferenceName(variable.init) ??
                  importedMemberReferenceName(variable.init, importedNames);
                const exported = identifierName(variable.id);
                if (
                  source !== null &&
                  exported !== null &&
                  !isFrameworkContractBinding(exported)
                )
                  reportIdentityAlias(variable, exported, source);
              }
              return;
            }

            if (
              declaration.type === 'TSInterfaceDeclaration' &&
              typeMembers(declaration.body).length === 0 &&
              declaration.extends?.length === 1
            ) {
              const source = identityReferenceName(
                declaration.extends[0]?.expression,
              );
              if (source !== null)
                reportIdentityAlias(
                  declaration,
                  identifierName(declaration.id),
                  source,
                );
            }
          };

          if (isTargetSurface)
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
                      messageId: 'aliasedSurface',
                      data: { local, exported },
                    });
                }
                inspectIdentityDeclaration(node.declaration);
              },
            };

          if (isSurface) return {};

          const importedNames = new Set();
          const identityAliases = new Map();

          return {
            ImportDeclaration(node) {
              for (const specifier of node.specifiers ?? []) {
                const local = identifierName(specifier.local);
                if (local !== null) importedNames.add(local);
              }
            },
            VariableDeclarator(node) {
              const name = identifierName(node.id);
              const source =
                identityReferenceName(node.init) ??
                importedMemberReferenceName(node.init, importedNames);
              if (
                name !== null &&
                source !== null &&
                !isFrameworkContractBinding(name)
              )
                identityAliases.set(name, source);
            },
            TSTypeAliasDeclaration(node) {
              if (
                node.typeAnnotation?.type !== 'TSTypeReference' ||
                (node.typeAnnotation.typeArguments?.params?.length ?? 0) !== 0
              )
                return;
              const name = identifierName(node.id);
              const source = identityReferenceName(
                node.typeAnnotation.typeName,
              );
              if (name !== null && source !== null)
                identityAliases.set(name, source);
            },
            TSInterfaceDeclaration(node) {
              if (
                typeMembers(node.body).length !== 0 ||
                node.extends?.length !== 1
              )
                return;
              const name = identifierName(node.id);
              const source = identityReferenceName(node.extends[0]?.expression);
              if (name !== null && source !== null)
                identityAliases.set(name, source);
            },
            ExportAllDeclaration(node) {
              context.report({
                node,
                messageId: 'directRelay',
                data: { target: node.source?.value ?? 'another module' },
              });
            },
            ExportNamedDeclaration(node) {
              if (node.source !== null && node.source !== undefined) {
                context.report({
                  node,
                  messageId: 'directRelay',
                  data: { target: node.source.value ?? 'another module' },
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
                else if (local !== null && identityAliases.has(local))
                  reportIdentityAlias(
                    specifier,
                    local,
                    identityAliases.get(local),
                  );
              }

              inspectIdentityDeclaration(node.declaration, importedNames);
            },
          };
        },
      }),
      'cell-isolation': Object.freeze({
        meta: Object.freeze({
          type: 'problem',
          schema: Object.freeze([]),
          messages: Object.freeze({
            ownerPersistence:
              'Cell decisions, contracts, executors, and protocol roles cannot reach owner schema or persistence directly. Use a local persistence adapter and inject its capability.',
            sibling:
              'A cell cannot import private source from sibling cell "{{target}}". Connect operations through owner assembly and a narrow capability.',
          }),
        }),
        create(context) {
          const importer = path.resolve(context.filename);
          const importerCell = cellDirectoryFor(importer);
          if (importerCell === null) return {};
          const enforcesPersistenceBoundary =
            /(?:^|[.])(?:contract|decide|decision|execute|http|job|surface|usecase)(?:[.]|$)/u.test(
              path.basename(importer).replace(/[.](?:c|m)?[jt]sx?$/u, ''),
            );

          const inspect = (node, source) => {
            if (typeof source !== 'string') return;
            if (
              enforcesPersistenceBoundary &&
              source.startsWith('@pressly/postgres')
            ) {
              context.report({ node, messageId: 'ownerPersistence' });
              return;
            }
            if (!source.startsWith('.')) return;
            const target = path.resolve(path.dirname(importer), source);
            const normalizedTarget = target.replaceAll(path.sep, '/');
            if (
              enforcesPersistenceBoundary &&
              /\/src\/(?:postgres|schema)\//u.test(normalizedTarget)
            ) {
              context.report({ node, messageId: 'ownerPersistence' });
              return;
            }
            const targetCell = cellDirectoryFor(target);
            if (targetCell === null || targetCell === importerCell) return;
            context.report({
              node,
              messageId: 'sibling',
              data: {
                target: path.relative(repositoryRoot, targetCell),
              },
            });
          };

          return {
            ImportDeclaration(node) {
              inspect(node, node.source?.value);
            },
            ExportAllDeclaration(node) {
              inspect(node, node.source?.value);
            },
            ExportNamedDeclaration(node) {
              inspect(node, node.source?.value);
            },
            ImportExpression(node) {
              inspect(node, node.source?.value);
            },
          };
        },
      }),
    }),
  });
};
