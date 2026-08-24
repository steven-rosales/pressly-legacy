import type {
  CellManifest,
  CliPresentation,
  CliProgramManifest,
  CliSurfaceManifest,
  EventStreamSurfaceManifest,
  HttpInvalidRequestDescriptor,
  HttpBoundaryProfile,
  HttpSurfaceManifest,
  JobSurfaceManifest,
  MessageContractDescriptor,
} from '@pressly/cells';
import type {
  CellSelection,
  CellSourceReference,
  ExperienceFeatureSelection,
  ExperienceFeatureSourceReference,
  TopologyDefinition,
} from './definition.ts';
import { selectClientHttpSurfaces } from './client-http-surfaces.ts';

export type TopologyViolationCode =
  | 'ambiguous_cli_command_name'
  | 'duplicate_cell_event'
  | 'duplicate_cell_source'
  | 'duplicate_event_identity'
  | 'duplicate_event_stream_type'
  | 'duplicate_context_requirement'
  | 'duplicate_cli_argument'
  | 'duplicate_cli_command_id'
  | 'duplicate_cli_command_name'
  | 'duplicate_cli_option'
  | 'duplicate_cli_requirement'
  | 'duplicate_experience_use'
  | 'duplicate_experience_feature_id'
  | 'duplicate_experience_feature_proof'
  | 'duplicate_experience_feature_source'
  | 'duplicate_experience_feature_use'
  | 'duplicate_http_boundary_profile'
  | 'duplicate_job_id'
  | 'duplicate_operation_id'
  | 'duplicate_owner_id'
  | 'duplicate_route'
  | 'ambiguous_http_boundary_profile'
  | 'ambiguous_client_http_surface'
  | 'ambiguous_client_event_stream_surface'
  | 'invalid_cell_contract'
  | 'invalid_cell_id'
  | 'invalid_cell_semantics'
  | 'invalid_cell_source'
  | 'invalid_cli_presentation'
  | 'invalid_cli_program'
  | 'invalid_cli_requirement'
  | 'invalid_cli_surface'
  | 'invalid_context_requirement'
  | 'invalid_event_identity'
  | 'invalid_event_stream'
  | 'invalid_experience_feature'
  | 'invalid_job'
  | 'invalid_http_boundary_profile'
  | 'invalid_owner_id'
  | 'invalid_request_descriptor'
  | 'invalid_route'
  | 'invalid_topology_id'
  | 'inconsistent_owner_assembly'
  | 'incompatible_http_boundary_profile'
  | 'undeclared_internal_event'
  | 'unknown_http_boundary_operation'
  | 'unknown_http_boundary_profile'
  | 'unknown_experience_feature_operation'
  | 'unknown_experience_operation';

export type TopologyViolation = Readonly<{
  code: TopologyViolationCode;
  subject: string;
  message: string;
}>;

export type CompiledCell = Readonly<{
  ownerKind: 'experience' | 'system';
  ownerId: string;
  source: CellSourceReference;
  manifest: CellManifest;
}>;

export type CompiledHttpRoute = Readonly<{
  operationId: string;
  ownerId: string;
  source: CellSourceReference;
  surface: HttpSurfaceManifest;
  boundaryProfile: HttpBoundaryProfile | null;
}>;

export type CompiledCliCommand = Readonly<{
  operationId: string;
  ownerId: string;
  source: CellSourceReference;
  surface: CliSurfaceManifest;
}>;

export type CompiledJob = Readonly<{
  operationId: string;
  ownerId: string;
  source: CellSourceReference;
  surface: JobSurfaceManifest;
}>;

export type CompiledEventStream = Readonly<{
  operationId: string;
  ownerId: string;
  source: CellSourceReference;
  surface: EventStreamSurfaceManifest;
}>;

export type CompiledEvent = Readonly<{
  contract: MessageContractDescriptor;
  producers: readonly string[];
}>;

export type CompiledExperience = Readonly<{
  id: string;
  /** Operations explicitly consumed by the Experience. */
  operationIds: readonly string[];
  /** Browser-visible consumed operations plus browser-visible owned cells. */
  clientOperationIds: readonly string[];
  features: readonly CompiledExperienceFeature[];
}>;

export type CompiledExperienceFeature = Readonly<{
  id: string;
  operationIds: readonly string[];
  stateProofs: readonly string[];
  componentProofs: readonly string[];
  source: ExperienceFeatureSourceReference;
}>;

export type CompiledTopology = Readonly<{
  id: string;
  cells: readonly CompiledCell[];
  cliCommands: readonly CompiledCliCommand[];
  eventStreams: readonly CompiledEventStream[];
  httpRoutes: readonly CompiledHttpRoute[];
  jobs: readonly CompiledJob[];
  events: readonly CompiledEvent[];
  experiences: readonly CompiledExperience[];
  cliProgram: CliProgramManifest | null;
  httpBoundaryProfiles: readonly HttpBoundaryProfile[];
}>;

export type TopologyCompilation =
  | Readonly<{ kind: 'compiled'; topology: CompiledTopology }>
  | Readonly<{ kind: 'invalid'; violations: readonly TopologyViolation[] }>;

const ownerIdPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const experienceFeatureIdPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const focusedStateProofPathPattern = /[.](?:spec|test)[.]tsx?$/u;
const focusedComponentProofPathPattern = /[.](?:spec|test)[.]tsx$/u;
const repositoryDirectory = (repositoryPath: string): string =>
  repositoryPath.slice(0, repositoryPath.lastIndexOf('/'));
const boundaryProviderTokenPattern = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const versionedIdentityPattern =
  /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+\.v[1-9][0-9]*$/;
const internalEventTypePattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const externalWireEventTypePattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const eventStreamTypePattern = /^[A-Za-z0-9_-]+$/;
const exportNamePattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const contentTypePattern = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const cliShortOptionPattern = /^[a-z0-9]$/;
const capabilityPattern = /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+$/;
const requestValidationLocations = new Set(['body', 'params', 'query']);
const validationStatuses = new Set([400, 413, 415, 422]);

const sorted = <Value>(
  values: readonly Value[],
  key: (value: Value) => string,
): readonly Value[] =>
  Object.freeze(
    [...values].sort((left, right) => {
      const leftKey = key(left);
      const rightKey = key(right);
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    }),
  );

const violation = (
  code: TopologyViolationCode,
  subject: string,
  message: string,
): TopologyViolation => Object.freeze({ code, subject, message });

const duplicateValues = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  }
  return Object.freeze([...duplicates].sort());
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const boundaryProviderValid = (value: unknown): value is string =>
  typeof value === 'string' && boundaryProviderTokenPattern.test(value);

const cliExitCodeValid = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255;

const validateCliPresentation = (
  surface: CliSurfaceManifest,
  operationId: string,
  violations: TopologyViolation[],
): void => {
  const presentation = surface.presentation as unknown;
  const subject = `${operationId}:${surface.id}`;
  if (!isRecord(presentation)) {
    violations.push(
      violation(
        'invalid_cli_presentation',
        subject,
        'CLI presentation policy must declare success, failure, and invalid-invocation behavior.',
      ),
    );
    return;
  }

  const streams = new Set(['none', 'stderr', 'stdout']);
  const outcomeValid = (
    value: unknown,
  ): value is Readonly<{ stream: unknown; exitCodes: readonly number[] }> =>
    isRecord(value) &&
    streams.has(String(value['stream'])) &&
    Array.isArray(value['exitCodes']) &&
    value['exitCodes'].length > 0 &&
    value['exitCodes'].every(cliExitCodeValid) &&
    duplicateValues(value['exitCodes'].map(String)).length === 0;
  const success = presentation['success'];
  const failure = presentation['failure'];
  const invalidInvocation = presentation['invalidInvocation'];
  if (
    !outcomeValid(success) ||
    !outcomeValid(failure) ||
    !isRecord(invalidInvocation) ||
    !streams.has(String(invalidInvocation['stream'])) ||
    !cliExitCodeValid(invalidInvocation['exitCode'])
  ) {
    violations.push(
      violation(
        'invalid_cli_presentation',
        subject,
        'CLI presentation streams must be stdout, stderr, or none and all declared exit codes must be unique integers from 0 through 255.',
      ),
    );
    return;
  }

  const overlapping = success['exitCodes'].filter((code) =>
    failure['exitCodes'].includes(code),
  );
  if (
    overlapping.length > 0 ||
    !success['exitCodes'].includes(0) ||
    failure['exitCodes'].includes(0) ||
    invalidInvocation['exitCode'] === 0
  )
    violations.push(
      violation(
        'invalid_cli_presentation',
        subject,
        overlapping.length > 0
          ? `CLI success and failure presentation cannot share exit code ${String(overlapping[0])}.`
          : 'CLI success presentation must admit zero, while failure and invalid-invocation presentation must use nonzero exit codes.',
      ),
    );
};

const staticCliPresentationValid = (value: unknown): value is CliPresentation =>
  isRecord(value) &&
  cliExitCodeValid(value['exitCode']) &&
  (value['stdout'] === undefined || typeof value['stdout'] === 'string') &&
  (value['stderr'] === undefined || typeof value['stderr'] === 'string') &&
  (value['stdout'] === undefined) !== (value['stderr'] === undefined);

const cliProgramUnknownPresentationValid = (
  value: unknown,
): value is CliProgramManifest['unknown'] =>
  isRecord(value) &&
  (value['stream'] === 'stderr' || value['stream'] === 'stdout') &&
  cliExitCodeValid(value['exitCode']) &&
  value['exitCode'] !== 0 &&
  typeof value['prefix'] === 'string' &&
  typeof value['suffix'] === 'string' &&
  (value['token'] === 'after-group' ||
    value['token'] === 'first' ||
    value['token'] === 'none') &&
  typeof value['appendHelp'] === 'boolean';

const validateCliProgram = (
  program: CliProgramManifest | null,
  violations: TopologyViolation[],
): void => {
  if (program === null) return;
  const candidate = program as unknown;
  let valid =
    isRecord(candidate) &&
    typeof candidate['id'] === 'string' &&
    versionedIdentityPattern.test(candidate['id']) &&
    Array.isArray(candidate['helpOptions']) &&
    candidate['helpOptions'].length > 0 &&
    candidate['helpOptions'].every(
      (option) =>
        typeof option === 'string' && /^--?[a-z0-9][a-z0-9-]*$/.test(option),
    ) &&
    duplicateValues(candidate['helpOptions'] as readonly string[]).length ===
      0 &&
    staticCliPresentationValid(candidate['help']) &&
    candidate['help'].exitCode === 0 &&
    cliProgramUnknownPresentationValid(candidate['unknown']) &&
    candidate['unknown'].token !== 'after-group' &&
    Array.isArray(candidate['groups']);

  const groupNames: readonly string[][] =
    isRecord(candidate) && Array.isArray(candidate['groups'])
      ? candidate['groups'].flatMap((group) =>
          isRecord(group) &&
          Array.isArray(group['name']) &&
          group['name'].length > 0 &&
          group['name'].every(
            (token) => typeof token === 'string' && ownerIdPattern.test(token),
          ) &&
          staticCliPresentationValid(group['help']) &&
          group['help'].exitCode === 0 &&
          cliProgramUnknownPresentationValid(group['unknown'])
            ? [group['name'] as string[]]
            : [],
        )
      : [];
  if (
    isRecord(candidate) &&
    Array.isArray(candidate['groups']) &&
    groupNames.length !== candidate['groups'].length
  )
    valid = false;

  const keys = groupNames.map((name) => name.join('\u0000'));
  if (duplicateValues(keys).length > 0) valid = false;
  for (let leftIndex = 0; leftIndex < groupNames.length; leftIndex += 1)
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < groupNames.length;
      rightIndex += 1
    ) {
      const left = groupNames[leftIndex];
      const right = groupNames[rightIndex];
      if (left === undefined || right === undefined) continue;
      const shorter = left.length <= right.length ? left : right;
      const longer = shorter === left ? right : left;
      if (
        shorter.length < longer.length &&
        shorter.every((token, index) => token === longer[index])
      )
        valid = false;
    }

  if (!valid)
    violations.push(
      violation(
        'invalid_cli_program',
        isRecord(candidate) && typeof candidate['id'] === 'string'
          ? candidate['id']
          : '<invalid-cli-program>',
        'CLI program data requires a versioned id, unique help options, exact help and unknown-command presentations, and unique non-overlapping command groups.',
      ),
    );
};

const validateCliSurface = (
  surface: CliSurfaceManifest,
  operationId: string,
  violations: TopologyViolation[],
): void => {
  const subject = `${operationId}:${surface.id}`;
  if (
    !versionedIdentityPattern.test(surface.id) ||
    !Array.isArray(surface.name) ||
    surface.name.length === 0 ||
    surface.name.some((token) => !ownerIdPattern.test(token))
  )
    violations.push(
      violation(
        'invalid_cli_surface',
        subject,
        'CLI command ids must be versioned dotted identities and names must contain one or more lower-case kebab tokens.',
      ),
    );

  const argumentNames = surface.arguments.map((argument) => argument.name);
  for (const name of duplicateValues(argumentNames))
    violations.push(
      violation(
        'duplicate_cli_argument',
        subject,
        `CLI command repeats positional argument "${name}".`,
      ),
    );

  let optionalSeen = false;
  for (const [index, argument] of surface.arguments.entries()) {
    if (
      !ownerIdPattern.test(argument.name) ||
      typeof argument.required !== 'boolean' ||
      typeof argument.variadic !== 'boolean' ||
      (argument.variadic && index !== surface.arguments.length - 1) ||
      (optionalSeen && argument.required)
    )
      violations.push(
        violation(
          'invalid_cli_surface',
          subject,
          'CLI positional arguments require unique lower-case kebab names, at most one final variadic argument, and no required argument after an optional argument.',
        ),
      );
    if (!argument.required) optionalSeen = true;
  }

  for (const name of duplicateValues(
    surface.options.map((option) => option.name),
  ))
    violations.push(
      violation(
        'duplicate_cli_option',
        subject,
        `CLI command repeats option "--${name}".`,
      ),
    );
  for (const short of duplicateValues(
    surface.options.flatMap((option) =>
      option.short === null ? [] : [option.short],
    ),
  ))
    violations.push(
      violation(
        'duplicate_cli_option',
        subject,
        `CLI command repeats short option "-${short}".`,
      ),
    );
  for (const option of surface.options)
    if (
      !ownerIdPattern.test(option.name) ||
      (option.short !== null && !cliShortOptionPattern.test(option.short)) ||
      (option.value !== 'boolean' && option.value !== 'string') ||
      typeof option.required !== 'boolean' ||
      typeof option.repeatable !== 'boolean'
    )
      violations.push(
        violation(
          'invalid_cli_surface',
          subject,
          'CLI options require unique lower-case kebab names, optional unique one-character short names, declared boolean or string values, and explicit required/repeatable policy.',
        ),
      );

  const stdin = surface.stdin as unknown;
  if (
    !isRecord(stdin) ||
    (stdin['mode'] !== 'none' &&
      stdin['mode'] !== 'optional' &&
      stdin['mode'] !== 'required') ||
    stdin['encoding'] !== 'utf8' ||
    (stdin['tty'] !== 'allow' &&
      stdin['tty'] !== 'forbid' &&
      stdin['tty'] !== 'require') ||
    (stdin['mode'] === 'none'
      ? stdin['maxBytes'] !== null || stdin['tty'] !== 'allow'
      : stdin['maxBytes'] !== null &&
        (!Number.isInteger(stdin['maxBytes']) || Number(stdin['maxBytes']) < 1))
  )
    violations.push(
      violation(
        'invalid_cli_surface',
        subject,
        'CLI stdin policy must be none or explicitly bounded/unbounded UTF-8 text with optional/required and TTY behavior.',
      ),
    );

  const interactive = surface.interactive as unknown;
  if (
    interactive !== null &&
    (!isRecord(interactive) ||
      !Array.isArray(interactive['exitCodes']) ||
      interactive['exitCodes'].length === 0 ||
      !interactive['exitCodes'].every(cliExitCodeValid) ||
      duplicateValues(interactive['exitCodes'].map(String)).length > 0)
  )
    violations.push(
      violation(
        'invalid_cli_surface',
        subject,
        'Interactive CLI surfaces must declare one or more unique exit codes from 0 through 255.',
      ),
    );

  if (surface.prompt !== 'allowed' && surface.prompt !== 'none')
    violations.push(
      violation(
        'invalid_cli_surface',
        subject,
        'CLI prompt policy must be allowed or none.',
      ),
    );

  const requirements = [
    ...surface.contextRequirements.map((value) => `context:${value}`),
    ...surface.capabilityRequirements.map((value) => `capability:${value}`),
  ];
  for (const requirement of duplicateValues(requirements))
    violations.push(
      violation(
        'duplicate_cli_requirement',
        subject,
        `CLI command repeats requirement "${requirement}".`,
      ),
    );
  for (const requirement of surface.contextRequirements)
    if (!ownerIdPattern.test(requirement))
      violations.push(
        violation(
          'invalid_cli_requirement',
          subject,
          `CLI requirement "${requirement}" must be a nonempty lower-case kebab token.`,
        ),
      );
  for (const requirement of surface.capabilityRequirements)
    if (!capabilityPattern.test(requirement))
      violations.push(
        violation(
          'invalid_cli_requirement',
          subject,
          `CLI capability "${requirement}" must be a lower-case colon-delimited identity.`,
        ),
      );

  validateCliPresentation(surface, operationId, violations);
};

const validateHttpBoundaryProfile = (
  value: HttpBoundaryProfile,
  violations: TopologyViolation[],
): void => {
  const profile = value as unknown;
  const subject =
    isRecord(profile) && typeof profile['id'] === 'string'
      ? profile['id']
      : '<invalid-http-boundary-profile>';
  const invalid = (message: string): void => {
    violations.push(
      violation('invalid_http_boundary_profile', subject, message),
    );
  };

  if (!isRecord(profile)) {
    invalid('HTTP boundary profiles must be immutable record-shaped data.');
    return;
  }

  const keys = [
    'authentication',
    'authorization',
    'contextProviders',
    'csrf',
    'exactOrigin',
    'expectedFailureObservation',
    'id',
    'identityRateLimit',
    'inputValidationPhase',
    'noStore',
    'requestRateLimit',
    'requestBody',
  ] as const;
  if (
    Object.keys(profile).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(profile, key))
  )
    invalid(
      'HTTP boundary profiles must declare exactly authentication, request body, input validation phase, exact origin, CSRF, request and identity rate limits, no-store, context providers, authorization, and expected-failure observation.',
    );

  if (typeof profile['id'] !== 'string' || !ownerIdPattern.test(profile['id']))
    invalid('HTTP boundary profile ids must be lower-case kebab tokens.');

  const authentication = profile['authentication'];
  if (
    authentication !== null &&
    (!isRecord(authentication) ||
      Object.keys(authentication).length !== 2 ||
      !Object.hasOwn(authentication, 'provider') ||
      !Object.hasOwn(authentication, 'required') ||
      !boundaryProviderValid(authentication['provider']) ||
      typeof authentication['required'] !== 'boolean')
  )
    invalid(
      'Authentication must be null or declare one opaque provider and whether identity is required.',
    );

  const requestBody = profile['requestBody'];
  if (requestBody !== null) {
    const requestBodyKeys = [
      'acceptedContentTypes',
      'contentType',
      'parser',
      'phase',
    ] as const;
    if (
      !isRecord(requestBody) ||
      Object.keys(requestBody).length < requestBodyKeys.length ||
      Object.keys(requestBody).length > requestBodyKeys.length + 1 ||
      requestBodyKeys.some((key) => !Object.hasOwn(requestBody, key)) ||
      Object.keys(requestBody).some(
        (key) =>
          !requestBodyKeys.includes(key as (typeof requestBodyKeys)[number]) &&
          key !== 'unsupportedContentType',
      )
    )
      invalid(
        'Request body policy must declare accepted content types, required or parse-if-matching semantics, one parser provider, one parser phase, and only optional unsupported-content-type presentation.',
      );
    else {
      const accepted = requestBody['acceptedContentTypes'];
      if (
        !Array.isArray(accepted) ||
        accepted.length === 0 ||
        accepted.some(
          (contentType) =>
            typeof contentType !== 'string' ||
            !contentTypePattern.test(contentType),
        ) ||
        duplicateValues(
          accepted.filter(
            (contentType): contentType is string =>
              typeof contentType === 'string',
          ),
        ).length > 0
      )
        invalid(
          'Request body content types must be one or more unique lower-case media types.',
        );
      if (!boundaryProviderValid(requestBody['parser']))
        invalid(
          'Request body parser providers must be lower-case opaque tokens.',
        );
      if (
        requestBody['contentType'] !== 'required' &&
        requestBody['contentType'] !== 'parse-if-matching'
      )
        invalid(
          'Request body content-type policy must be required or parse-if-matching.',
        );
      const unsupportedContentType = requestBody['unsupportedContentType'];
      if (
        unsupportedContentType !== undefined &&
        (!isRecord(unsupportedContentType) ||
          Object.keys(unsupportedContentType).length !== 2 ||
          !Object.hasOwn(unsupportedContentType, 'code') ||
          !Object.hasOwn(unsupportedContentType, 'safeMessage') ||
          typeof unsupportedContentType['code'] !== 'string' ||
          unsupportedContentType['code'].trim() === '' ||
          typeof unsupportedContentType['safeMessage'] !== 'string' ||
          unsupportedContentType['safeMessage'].trim() === '')
      )
        invalid(
          'Unsupported-content-type presentation must declare nonempty code and safeMessage strings.',
        );
      if (
        unsupportedContentType !== undefined &&
        requestBody['contentType'] !== 'required'
      )
        invalid(
          'Unsupported-content-type presentation is valid only for required content types.',
        );
      if (
        requestBody['phase'] !== 'before-authentication' &&
        requestBody['phase'] !== 'after-authentication' &&
        requestBody['phase'] !== 'after-authorization'
      )
        invalid(
          'Request body parser phase must be before authentication, after authentication, or after authorization.',
        );
    }
  }

  if (
    profile['inputValidationPhase'] !== 'before-authentication' &&
    profile['inputValidationPhase'] !== 'after-authentication' &&
    profile['inputValidationPhase'] !== 'after-authorization'
  )
    invalid(
      'Input validation phase must be before authentication, after authentication, or after authorization.',
    );

  for (const field of [
    'exactOrigin',
    'csrf',
    'requestRateLimit',
    'identityRateLimit',
    'authorization',
    'expectedFailureObservation',
  ] as const) {
    const provider = profile[field];
    if (provider !== null && !boundaryProviderValid(provider))
      invalid(`${field} providers must be null or lower-case opaque tokens.`);
  }

  if (typeof profile['noStore'] !== 'boolean')
    invalid('No-store policy must be an explicit boolean.');

  const contextProviders = profile['contextProviders'];
  if (
    !Array.isArray(contextProviders) ||
    contextProviders.some((provider) => !boundaryProviderValid(provider)) ||
    duplicateValues(
      contextProviders.filter(
        (provider): provider is string => typeof provider === 'string',
      ),
    ).length > 0
  )
    invalid('Context providers must be unique lower-case opaque tokens.');

  if (profile['csrf'] !== null && profile['exactOrigin'] === null)
    invalid('CSRF enforcement requires an exact-origin provider.');
  if (
    profile['identityRateLimit'] !== null &&
    (!isRecord(profile['authentication']) ||
      profile['authentication']['required'] !== true)
  )
    invalid('Identity rate limiting requires authenticated identity.');
};

const validInvalidRequestDescriptor = (
  value: unknown,
): value is HttpInvalidRequestDescriptor => {
  if (!isRecord(value)) return false;

  const { code, message, safeMessage, status, location } = value;
  return (
    Object.keys(value).every((key) =>
      ['code', 'message', 'safeMessage', 'status', 'location'].includes(key),
    ) &&
    typeof code === 'string' &&
    code.trim().length > 0 &&
    !/\s/.test(code) &&
    typeof message === 'string' &&
    message.trim().length > 0 &&
    (safeMessage === undefined ||
      (typeof safeMessage === 'string' && safeMessage.trim().length > 0)) &&
    (status === undefined ||
      (typeof status === 'number' && validationStatuses.has(status))) &&
    typeof location === 'string' &&
    requestValidationLocations.has(location)
  );
};

const validInvalidRequestManifest = (value: unknown): boolean =>
  isRecord(value) &&
  Object.hasOwn(value, 'authorizationScope') &&
  Object.hasOwn(value, 'input') &&
  Object.keys(value).every(
    (key) => key === 'authorizationScope' || key === 'input',
  ) &&
  (value['authorizationScope'] === null ||
    validInvalidRequestDescriptor(value['authorizationScope'])) &&
  (value['input'] === null || validInvalidRequestDescriptor(value['input']));

const canonicalRoutePath = (path: string): string =>
  path.replace(/:[^/]+/g, ':parameter').replace(/\*[^/]*/g, '*wildcard');

const manifestSourceKey = (source: CellSourceReference): string =>
  `${source.moduleSpecifier}#${source.manifestExportName}`;

const assemblySourceKey = (source: CellSourceReference): string =>
  `${source.moduleSpecifier}#${source.assemblyExportName}`;

const runtimeCellSourceKey = (source: CellSourceReference): string =>
  `${assemblySourceKey(source)}.cells[${JSON.stringify(source.assemblyKey)}]`;

const cellKey = (cell: CompiledCell): string =>
  `${cell.manifest.id}|${cell.ownerKind}:${cell.ownerId}`;

const collectCells = (
  definition: TopologyDefinition,
): readonly CompiledCell[] =>
  sorted(
    [
      ...definition.systems.flatMap((system) =>
        system.cells.map((selection) =>
          Object.freeze({
            ownerKind: 'system' as const,
            ownerId: system.id,
            source: selection.source,
            manifest: selection.manifest,
          }),
        ),
      ),
      ...definition.experiences.flatMap((experience) =>
        experience.cells.map((selection) =>
          Object.freeze({
            ownerKind: 'experience' as const,
            ownerId: experience.id,
            source: selection.source,
            manifest: selection.manifest,
          }),
        ),
      ),
    ],
    cellKey,
  );

type ResolvedHttpBoundaryProfiles = Readonly<{
  profiles: readonly HttpBoundaryProfile[];
  byOperation: ReadonlyMap<string, HttpBoundaryProfile>;
}>;

const resolveHttpBoundaryProfiles = (
  definition: TopologyDefinition,
  cells: readonly CompiledCell[],
  violations: TopologyViolation[],
): ResolvedHttpBoundaryProfiles => {
  for (const profile of definition.httpBoundaryProfiles)
    validateHttpBoundaryProfile(profile, violations);

  const validProfiles = definition.httpBoundaryProfiles.filter(
    (profile) =>
      isRecord(profile) &&
      typeof profile.id === 'string' &&
      ownerIdPattern.test(profile.id),
  );
  for (const profileId of duplicateValues(
    validProfiles.map((profile) => profile.id),
  ))
    violations.push(
      violation(
        'duplicate_http_boundary_profile',
        profileId,
        `HTTP boundary profile "${profileId}" is declared more than once.`,
      ),
    );

  const profileById = new Map<string, HttpBoundaryProfile>();
  for (const profile of validProfiles)
    if (!profileById.has(profile.id)) profileById.set(profile.id, profile);

  const validBindings = definition.httpBoundaryBindings.filter((binding) => {
    const candidate = binding as unknown;
    if (
      isRecord(candidate) &&
      Object.keys(candidate).length === 2 &&
      typeof candidate['operationId'] === 'string' &&
      typeof candidate['profileId'] === 'string' &&
      Object.hasOwn(candidate, 'operationId') &&
      Object.hasOwn(candidate, 'profileId')
    )
      return true;

    violations.push(
      violation(
        'invalid_http_boundary_profile',
        '<invalid-http-boundary-binding>',
        'HTTP boundary bindings must declare exactly one operation id and one profile id.',
      ),
    );
    return false;
  });

  const ambiguousOperations = new Set(
    duplicateValues(validBindings.map((binding) => binding.operationId)),
  );
  for (const operationId of ambiguousOperations)
    violations.push(
      violation(
        'ambiguous_http_boundary_profile',
        operationId,
        `HTTP operation "${operationId}" is bound to more than one boundary profile.`,
      ),
    );

  const cellById = new Map(
    cells.map((compiled) => [compiled.manifest.id, compiled]),
  );
  const byOperation = new Map<string, HttpBoundaryProfile>();
  for (const binding of validBindings) {
    const compiled = cellById.get(binding.operationId);
    if (
      compiled === undefined ||
      !compiled.manifest.surfaces.some((surface) => surface.kind === 'http')
    ) {
      violations.push(
        violation(
          'unknown_http_boundary_operation',
          binding.operationId,
          `HTTP boundary binding references unknown HTTP operation "${binding.operationId}".`,
        ),
      );
      continue;
    }

    const profile = profileById.get(binding.profileId);
    if (profile === undefined) {
      violations.push(
        violation(
          'unknown_http_boundary_profile',
          `${binding.operationId}:${binding.profileId}`,
          `HTTP boundary binding references unknown profile "${binding.profileId}".`,
        ),
      );
      continue;
    }

    if (ambiguousOperations.has(binding.operationId)) continue;

    const requiresAuthentication = profile.authentication?.required === true;
    if (
      (compiled.manifest.authentication === 'required') !==
      requiresAuthentication
    )
      violations.push(
        violation(
          'incompatible_http_boundary_profile',
          `${binding.operationId}:${binding.profileId}`,
          `HTTP boundary profile "${binding.profileId}" authentication does not match operation "${binding.operationId}".`,
        ),
      );

    if (
      (compiled.manifest.authorization === null) !==
      (profile.authorization === null)
    )
      violations.push(
        violation(
          'incompatible_http_boundary_profile',
          `${binding.operationId}:${binding.profileId}`,
          `Operation "${binding.operationId}" and HTTP boundary profile "${binding.profileId}" must either both declare authorization or both omit it.`,
        ),
      );

    if (
      profile.requestBody?.phase === 'after-authorization' &&
      compiled.manifest.authorization?.timing !== 'before-input'
    )
      violations.push(
        violation(
          'incompatible_http_boundary_profile',
          `${binding.operationId}:${binding.profileId}`,
          'After-authorization parsing requires before-input authorization so authorization never depends on an unparsed body.',
        ),
      );

    const phaseOrder = {
      'before-authentication': 0,
      'after-authentication': 1,
      'after-authorization': 2,
    } as const;
    if (
      profile.requestBody !== null &&
      phaseOrder[profile.requestBody.phase] >
        phaseOrder[profile.inputValidationPhase]
    )
      violations.push(
        violation(
          'incompatible_http_boundary_profile',
          `${binding.operationId}:${binding.profileId}`,
          `HTTP boundary profile "${binding.profileId}" cannot validate input before its declared request parser has run.`,
        ),
      );

    if (
      profile.inputValidationPhase === 'after-authorization' &&
      compiled.manifest.authorization?.timing !== 'before-input'
    )
      violations.push(
        violation(
          'incompatible_http_boundary_profile',
          `${binding.operationId}:${binding.profileId}`,
          'After-authorization input validation requires before-input authorization.',
        ),
      );

    const contextRequirements = compiled.manifest.surfaces.flatMap((surface) =>
      surface.kind === 'http' ? surface.contextRequirements : [],
    );
    if (contextRequirements.length > 0 && profile.contextProviders.length === 0)
      violations.push(
        violation(
          'incompatible_http_boundary_profile',
          `${binding.operationId}:${binding.profileId}`,
          `Context-bearing operation "${binding.operationId}" requires at least one profile context provider.`,
        ),
      );

    byOperation.set(binding.operationId, profile);
  }

  return Object.freeze({
    profiles: sorted(validProfiles, (profile) => profile.id),
    byOperation,
  });
};

const validateSource = (
  selection: CellSelection,
  violations: TopologyViolation[],
): void => {
  const {
    moduleSpecifier,
    manifestExportName,
    assemblyExportName,
    assemblyKey,
  } = selection.source;
  if (
    moduleSpecifier.trim().length === 0 ||
    /\s/.test(moduleSpecifier) ||
    !exportNamePattern.test(manifestExportName) ||
    !exportNamePattern.test(assemblyExportName) ||
    !exportNamePattern.test(assemblyKey)
  )
    violations.push(
      violation(
        'invalid_cell_source',
        selection.manifest.id,
        `Cell source must name a nonempty module plus manifest, assembly, and assembly-cell export identifiers; received "${manifestSourceKey(selection.source)}" and "${runtimeCellSourceKey(selection.source)}".`,
      ),
    );
};

const validateExperienceFeature = (
  experienceId: string,
  selection: ExperienceFeatureSelection,
  violations: TopologyViolation[],
): void => {
  const { manifest, source } = selection;
  const featureDirectory = repositoryDirectory(source.repositoryPath);
  if (
    !experienceFeatureIdPattern.test(manifest.id) ||
    !manifest.id.startsWith(`${experienceId}.`)
  )
    violations.push(
      violation(
        'invalid_experience_feature',
        manifest.id,
        `Experience feature ids must be dotted lower-case identities owned by "${experienceId}".`,
      ),
    );
  if (
    source.moduleSpecifier.trim().length === 0 ||
    /\s/.test(source.moduleSpecifier) ||
    !exportNamePattern.test(source.manifestExportName) ||
    source.repositoryPath !== source.repositoryPath.trim() ||
    !source.repositoryPath.startsWith(`experiences/${experienceId}/`) ||
    !source.repositoryPath.endsWith('/feature.ts')
  )
    violations.push(
      violation(
        'invalid_experience_feature',
        manifest.id,
        'Experience feature source must name a public export and an owner-local feature.ts repository path.',
      ),
    );
  if (manifest.componentProofs.length === 0)
    violations.push(
      violation(
        'invalid_experience_feature',
        manifest.id,
        'Experience features must declare at least one focused component proof.',
      ),
    );
  for (const proof of manifest.stateProofs)
    if (
      proof !== proof.trim() ||
      !proof.startsWith(`experiences/${experienceId}/`) ||
      repositoryDirectory(proof) !== featureDirectory ||
      !focusedStateProofPathPattern.test(proof)
    )
      violations.push(
        violation(
          'invalid_experience_feature',
          `${manifest.id}:${proof}`,
          'State proof references must be focused .test/.spec TypeScript files colocated with their feature.ts declaration.',
        ),
      );
  for (const proof of manifest.componentProofs)
    if (
      proof !== proof.trim() ||
      !proof.startsWith(`experiences/${experienceId}/`) ||
      repositoryDirectory(proof) !== featureDirectory ||
      !focusedComponentProofPathPattern.test(proof)
    )
      violations.push(
        violation(
          'invalid_experience_feature',
          `${manifest.id}:${proof}`,
          'Component proof references must be focused .test/.spec TSX files colocated with their feature.ts declaration.',
        ),
      );
};

const validateCell = (
  compiled: CompiledCell,
  violations: TopologyViolation[],
): void => {
  const { manifest } = compiled;
  if (!versionedIdentityPattern.test(manifest.id))
    violations.push(
      violation(
        'invalid_cell_id',
        manifest.id,
        'Cell ids must be lower-case dotted identities ending in .v<positive integer>.',
      ),
    );

  if (
    (manifest.authentication !== 'none' &&
      manifest.authentication !== 'required') ||
    (manifest.authorization !== null && manifest.authentication !== 'required')
  )
    violations.push(
      violation(
        'invalid_cell_semantics',
        manifest.id,
        'Authentication must be none or required, and every authorized cell must require authentication.',
      ),
    );

  const contracts = [
    manifest.contract.input,
    manifest.contract.output,
    manifest.contract.failure,
    ...(manifest.kind === 'subscription' && 'event' in manifest.contract
      ? [manifest.contract.event]
      : []),
  ];
  for (const contract of contracts)
    if (
      !isRecord(contract) ||
      !Number.isInteger(contract['version']) ||
      Number(contract['version']) < 1
    )
      violations.push(
        violation(
          'invalid_cell_contract',
          manifest.id,
          'Cell input, output, event when present, and failure contract versions must be positive integers.',
        ),
      );

  if (manifest.kind === 'query') {
    if (
      manifest.emits.length > 0 ||
      manifest.consumes.length > 0 ||
      manifest.idempotency.required ||
      manifest.retry !== null ||
      manifest.surfaces.some(
        (surface) => surface.kind !== 'cli' && surface.kind !== 'http',
      )
    )
      violations.push(
        violation(
          'invalid_cell_semantics',
          manifest.id,
          'Query cells cannot emit or consume messages, require idempotency, declare retry policy, or expose surfaces other than CLI and HTTP.',
        ),
      );
  }

  if (
    manifest.kind === 'reaction' &&
    (manifest.consumes.length === 0 ||
      manifest.retry === null ||
      manifest.surfaces.length === 0 ||
      manifest.surfaces.some((surface) => surface.kind !== 'job'))
  )
    violations.push(
      violation(
        'invalid_cell_semantics',
        manifest.id,
        'Reaction cells require a consumed message, retry policy, and one or more job-only surfaces.',
      ),
    );

  if (
    manifest.kind === 'process' &&
    (manifest.surfaces.length === 0 ||
      manifest.surfaces.some((surface) => surface.kind !== 'job'))
  )
    violations.push(
      violation(
        'invalid_cell_semantics',
        manifest.id,
        'Process cells require one or more job-only surfaces.',
      ),
    );

  if (
    manifest.kind === 'subscription' &&
    (manifest.surfaces.length === 0 ||
      manifest.surfaces.some((surface) => surface.kind !== 'event-stream') ||
      manifest.consistency.transaction !== 'none' ||
      manifest.consistency.concurrency !== 'none' ||
      manifest.idempotency.required ||
      manifest.emits.length > 0 ||
      manifest.consumes.length > 0 ||
      manifest.retry !== null ||
      manifest.timeoutMs !== null ||
      !('event' in manifest.contract))
  )
    violations.push(
      violation(
        'invalid_cell_semantics',
        manifest.id,
        'Subscription cells require one or more event-stream-only surfaces and an event contract, with no transaction, concurrency, idempotency, messages, retry policy, or timeout.',
      ),
    );

  if (
    manifest.kind !== 'subscription' &&
    manifest.surfaces.some((surface) => surface.kind === 'event-stream')
  )
    violations.push(
      violation(
        'invalid_cell_semantics',
        manifest.id,
        'Only subscription cells may expose event-stream surfaces.',
      ),
    );

  if (manifest.timeoutMs !== null && manifest.timeoutMs < 1)
    violations.push(
      violation(
        'invalid_cell_semantics',
        manifest.id,
        'Cell timeout must be a positive number of milliseconds.',
      ),
    );

  const requestSurfaces = manifest.surfaces.filter(
    (surface): surface is HttpSurfaceManifest | EventStreamSurfaceManifest =>
      surface.kind === 'http' || surface.kind === 'event-stream',
  );
  if (
    manifest.authorization?.timing === 'before-input' &&
    (manifest.surfaces.every(
      (surface) =>
        surface.kind !== 'cli' &&
        surface.kind !== 'event-stream' &&
        surface.kind !== 'http',
    ) ||
      requestSurfaces.some((surface) => surface.authorization !== 'staged'))
  )
    violations.push(
      violation(
        'invalid_cell_semantics',
        manifest.id,
        'Before-input authorization requires a CLI, HTTP, or event-stream surface, and every request surface must decode a validated authorization scope before full input decoding.',
      ),
    );
  if (
    manifest.authorization === null &&
    requestSurfaces.some((surface) => surface.authorization === 'staged')
  )
    violations.push(
      violation(
        'invalid_cell_semantics',
        manifest.id,
        'A staged HTTP or event-stream authorization decoder requires a cell authorization declaration.',
      ),
    );
  if (
    manifest.authorization?.timing === 'after-input' &&
    requestSurfaces.some(
      (surface) =>
        surface.kind === 'event-stream' && surface.authorization === 'staged',
    )
  )
    violations.push(
      violation(
        'invalid_cell_semantics',
        manifest.id,
        'After-input staged authorization is supported only for finite HTTP surfaces.',
      ),
    );

  const duplicateEvents = duplicateValues([
    ...manifest.emits.map((event) => `emits:${event.id}`),
    ...manifest.consumes.map((event) => `consumes:${event.id}`),
  ]);
  for (const event of duplicateEvents)
    violations.push(
      violation(
        'duplicate_cell_event',
        manifest.id,
        `Cell repeats message declaration "${event}".`,
      ),
    );

  for (const event of [...manifest.emits, ...manifest.consumes])
    if (
      !(
        event.scope === 'external'
          ? externalWireEventTypePattern
          : internalEventTypePattern
      ).test(event.type) ||
      !Number.isInteger(event.version) ||
      event.version < 1 ||
      event.id !== `${event.type}.v${event.version}`
    )
      violations.push(
        violation(
          'invalid_event_identity',
          `${manifest.id}:${event.id}`,
          'Internal message types must be lower-case dotted names; external message types may use bounded lower-case wire tokens. Every message requires a positive integer version and an exact <type>.v<version> identity.',
        ),
      );

  for (const surface of manifest.surfaces) {
    if (surface.kind === 'http' || surface.kind === 'event-stream') {
      if (!surface.path.startsWith('/') || /\s/.test(surface.path))
        violations.push(
          violation(
            'invalid_route',
            `${manifest.id}:${surface.method} ${surface.path}`,
            'HTTP and event-stream paths must be absolute and contain no whitespace.',
          ),
        );
      if (!validInvalidRequestManifest(surface.invalidRequest))
        violations.push(
          violation(
            'invalid_request_descriptor',
            `${manifest.id}:${surface.method} ${surface.path}`,
            'HTTP and event-stream invalid-request declarations must contain null or valid authorization-scope and input descriptors with a code, private message, public request location, and optional safe message or validation status.',
          ),
        );

      if (surface.kind === 'http') {
        for (const requirement of duplicateValues(surface.contextRequirements))
          violations.push(
            violation(
              'duplicate_context_requirement',
              `${manifest.id}:${surface.method} ${surface.path}`,
              `HTTP surface repeats context requirement "${requirement}".`,
            ),
          );
        for (const requirement of surface.contextRequirements)
          if (!ownerIdPattern.test(requirement))
            violations.push(
              violation(
                'invalid_context_requirement',
                `${manifest.id}:${surface.method} ${surface.path}`,
                `HTTP context requirement "${requirement}" must be a nonempty lower-case kebab token.`,
              ),
            );
      }

      if (surface.kind === 'event-stream') {
        for (const type of duplicateValues(surface.eventTypes))
          violations.push(
            violation(
              'duplicate_event_stream_type',
              `${manifest.id}:${surface.method} ${surface.path}`,
              `Event-stream surface repeats event type "${type}".`,
            ),
          );

        if (
          surface.method !== 'GET' ||
          !Number.isFinite(surface.retryMs) ||
          surface.retryMs <= 0 ||
          surface.eventTypes.length === 0 ||
          surface.eventTypes.some(
            (eventType) => !eventStreamTypePattern.test(eventType),
          )
        )
          violations.push(
            violation(
              'invalid_event_stream',
              `${manifest.id}:${surface.method} ${surface.path}`,
              'Event-stream surfaces require GET, a positive retry interval, and one or more unique event types containing only letters, numbers, underscores, or hyphens.',
            ),
          );
      }
    } else if (surface.kind === 'cli') {
      validateCliSurface(surface, manifest.id, violations);
      if (
        manifest.authorization !== null &&
        !surface.capabilityRequirements.includes(
          manifest.authorization.capability,
        )
      )
        violations.push(
          violation(
            'invalid_cell_semantics',
            `${manifest.id}:${surface.id}`,
            `CLI surfaces must declare the cell authorization capability "${manifest.authorization.capability}" as a capability requirement.`,
          ),
        );
      if (
        manifest.authentication === 'required' &&
        surface.contextRequirements.length === 0 &&
        surface.capabilityRequirements.length === 0
      )
        violations.push(
          violation(
            'invalid_cell_semantics',
            `${manifest.id}:${surface.id}`,
            'An authenticated CLI surface must declare at least one context or capability requirement for the host to resolve.',
          ),
        );
    } else if (
      !versionedIdentityPattern.test(surface.id) ||
      (surface.timeoutMs !== null && surface.timeoutMs < 1)
    )
      violations.push(
        violation(
          'invalid_job',
          `${manifest.id}:${surface.id}`,
          'Job ids must be versioned dotted identities and timeouts must be positive.',
        ),
      );
  }
};

export const compileTopology = (
  definition: TopologyDefinition,
): TopologyCompilation => {
  const violations: TopologyViolation[] = [];
  validateCliProgram(definition.cliProgram, violations);
  if (!ownerIdPattern.test(definition.id))
    violations.push(
      violation(
        'invalid_topology_id',
        definition.id,
        'Topology id must be a lower-case kebab identifier.',
      ),
    );

  const owners = [
    ...definition.systems.map((owner) => `system:${owner.id}`),
    ...definition.experiences.map((owner) => `experience:${owner.id}`),
  ];
  for (const owner of [...definition.systems, ...definition.experiences])
    if (!ownerIdPattern.test(owner.id))
      violations.push(
        violation(
          'invalid_owner_id',
          `${owner.kind}:${owner.id}`,
          'Owner id must be a lower-case kebab identifier.',
        ),
      );
  for (const owner of duplicateValues(owners))
    violations.push(
      violation(
        'duplicate_owner_id',
        owner,
        `Topology declares owner "${owner}" more than once.`,
      ),
    );

  const featureSelections = definition.experiences.flatMap((experience) =>
    experience.features.map((feature) => ({ experience, feature })),
  );
  for (const featureId of duplicateValues(
    featureSelections.map(({ feature }) => feature.manifest.id),
  ))
    violations.push(
      violation(
        'duplicate_experience_feature_id',
        featureId,
        `Experience feature id "${featureId}" is selected more than once.`,
      ),
    );
  for (const source of duplicateValues(
    featureSelections.flatMap(({ feature }) => [
      feature.source.repositoryPath,
      `${feature.source.moduleSpecifier}#${feature.source.manifestExportName}`,
    ]),
  ))
    violations.push(
      violation(
        'duplicate_experience_feature_source',
        source,
        `Experience feature source "${source}" is selected more than once.`,
      ),
    );
  for (const { experience, feature } of featureSelections) {
    validateExperienceFeature(experience.id, feature, violations);
    for (const used of duplicateValues(feature.manifest.uses))
      violations.push(
        violation(
          'duplicate_experience_feature_use',
          `${feature.manifest.id}:${used}`,
          `Experience feature "${feature.manifest.id}" repeats operation "${used}".`,
        ),
      );
    for (const proof of duplicateValues(feature.manifest.componentProofs))
      violations.push(
        violation(
          'duplicate_experience_feature_proof',
          `${feature.manifest.id}:${proof}`,
          `Experience feature "${feature.manifest.id}" repeats component proof "${proof}".`,
        ),
      );
    for (const proof of duplicateValues(feature.manifest.stateProofs))
      violations.push(
        violation(
          'duplicate_experience_feature_proof',
          `${feature.manifest.id}:${proof}`,
          `Experience feature "${feature.manifest.id}" repeats state proof "${proof}".`,
        ),
      );
  }

  for (const owner of [...definition.systems, ...definition.experiences])
    for (const selection of owner.cells) validateSource(selection, violations);

  const catalogSurfaceKinds = ['cli', 'event-stream', 'http', 'job'] as const;
  for (const owner of [...definition.systems, ...definition.experiences])
    for (const surfaceKind of catalogSurfaceKinds) {
      const assemblies = new Set(
        owner.cells.flatMap((selection) =>
          selection.manifest.surfaces.some(
            (surface) => surface.kind === surfaceKind,
          )
            ? [assemblySourceKey(selection.source)]
            : [],
        ),
      );
      if (assemblies.size > 1)
        violations.push(
          violation(
            'inconsistent_owner_assembly',
            `${owner.kind}:${owner.id}:${surfaceKind}`,
            `Owner cells selected into the same ${surfaceKind} catalog must be exposed by one public assembly factory; found ${[
              ...assemblies,
            ]
              .sort()
              .join(
                ', ',
              )}. Headless cells and cells selected into other catalogs may use a narrower public assembly.`,
          ),
        );
    }

  const cells = collectCells(definition);
  const httpBoundaries = resolveHttpBoundaryProfiles(
    definition,
    cells,
    violations,
  );
  for (const cell of cells) validateCell(cell, violations);

  for (const operationId of duplicateValues(
    cells.map((compiled) => compiled.manifest.id),
  ))
    violations.push(
      violation(
        'duplicate_operation_id',
        operationId,
        `Operation id "${operationId}" is selected more than once.`,
      ),
    );

  for (const source of duplicateValues([
    ...cells.map((cell) => manifestSourceKey(cell.source)),
    ...cells.map((cell) => runtimeCellSourceKey(cell.source)),
  ]))
    violations.push(
      violation(
        'duplicate_cell_source',
        source,
        `Public cell source "${source}" is selected more than once.`,
      ),
    );

  const httpRoutes = sorted(
    cells.flatMap((compiled) =>
      compiled.manifest.surfaces.flatMap((surface) =>
        surface.kind === 'http'
          ? [
              Object.freeze({
                operationId: compiled.manifest.id,
                ownerId: compiled.ownerId,
                source: compiled.source,
                surface,
                boundaryProfile:
                  httpBoundaries.byOperation.get(compiled.manifest.id) ?? null,
              }),
            ]
          : [],
      ),
    ),
    (route) =>
      `${route.surface.method} ${canonicalRoutePath(route.surface.path)} ${route.operationId}`,
  );

  const cliCommands = sorted(
    cells.flatMap((compiled) =>
      compiled.manifest.surfaces.flatMap((surface) =>
        surface.kind === 'cli'
          ? [
              Object.freeze({
                operationId: compiled.manifest.id,
                ownerId: compiled.ownerId,
                source: compiled.source,
                surface,
              }),
            ]
          : [],
      ),
    ),
    (entry) =>
      `${entry.surface.name.join('\u0000')} ${entry.surface.id} ${entry.operationId}`,
  );
  for (const commandId of duplicateValues(
    cliCommands.map((entry) => entry.surface.id),
  ))
    violations.push(
      violation(
        'duplicate_cli_command_id',
        commandId,
        `CLI command identity "${commandId}" is declared more than once.`,
      ),
    );

  const cliNameKey = (surface: CliSurfaceManifest): string =>
    surface.name.join(' ');
  for (const name of duplicateValues(
    cliCommands.map((entry) => cliNameKey(entry.surface)),
  ))
    violations.push(
      violation(
        'duplicate_cli_command_name',
        name,
        `CLI command name "${name}" is declared more than once.`,
      ),
    );

  const commandNames = [
    ...new Map(
      cliCommands.map((entry) => [
        cliNameKey(entry.surface),
        entry.surface.name,
      ]),
    ).values(),
  ].sort((left, right) => {
    const leftKey = left.join('\u0000');
    const rightKey = right.join('\u0000');
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  for (let leftIndex = 0; leftIndex < commandNames.length; leftIndex += 1)
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < commandNames.length;
      rightIndex += 1
    ) {
      const left = commandNames[leftIndex];
      const right = commandNames[rightIndex];
      if (left === undefined || right === undefined) continue;
      const shorter = left.length <= right.length ? left : right;
      const longer = shorter === left ? right : left;
      if (
        shorter.length < longer.length &&
        shorter.every((token, index) => token === longer[index])
      )
        violations.push(
          violation(
            'ambiguous_cli_command_name',
            `${shorter.join(' ')}|${longer.join(' ')}`,
            `CLI command names "${shorter.join(' ')}" and "${longer.join(' ')}" are prefix-ambiguous.`,
          ),
        );
    }

  if (definition.cliProgram !== null)
    for (const group of definition.cliProgram.groups)
      if (
        !cliCommands.some(
          (entry) =>
            group.name.length <= entry.surface.name.length &&
            group.name.every(
              (token, index) => entry.surface.name[index] === token,
            ),
        )
      )
        violations.push(
          violation(
            'invalid_cli_program',
            `${definition.cliProgram.id}:${group.name.join(' ')}`,
            `CLI program group "${group.name.join(' ')}" does not own any selected command.`,
          ),
        );

  const eventStreams = sorted(
    cells.flatMap((compiled) =>
      compiled.manifest.surfaces.flatMap((surface) =>
        surface.kind === 'event-stream'
          ? [
              Object.freeze({
                operationId: compiled.manifest.id,
                ownerId: compiled.ownerId,
                source: compiled.source,
                surface,
              }),
            ]
          : [],
      ),
    ),
    (stream) =>
      `${stream.surface.method} ${canonicalRoutePath(stream.surface.path)} ${stream.operationId}`,
  );

  type CompiledRequestRoute = CompiledHttpRoute | CompiledEventStream;
  const routesByKey = new Map<string, CompiledRequestRoute[]>();
  for (const route of [...httpRoutes, ...eventStreams]) {
    const key = `${route.surface.method} ${canonicalRoutePath(route.surface.path)}`;
    const current = routesByKey.get(key) ?? [];
    current.push(route);
    routesByKey.set(key, current);
  }
  for (const [key, routes] of routesByKey)
    if (routes.length > 1)
      violations.push(
        violation(
          'duplicate_route',
          key,
          `Request route "${key}" is declared by ${routes
            .map((route) => route.operationId)
            .sort()
            .join(', ')}.`,
        ),
      );

  const jobs = sorted(
    cells.flatMap((compiled) =>
      compiled.manifest.surfaces.flatMap((surface) =>
        surface.kind === 'job'
          ? [
              Object.freeze({
                operationId: compiled.manifest.id,
                ownerId: compiled.ownerId,
                source: compiled.source,
                surface,
              }),
            ]
          : [],
      ),
    ),
    (entry) => `${entry.surface.id} ${entry.operationId}`,
  );
  for (const jobId of duplicateValues(jobs.map((entry) => entry.surface.id)))
    violations.push(
      violation(
        'duplicate_job_id',
        jobId,
        `Job id "${jobId}" is declared more than once.`,
      ),
    );

  const eventsById = new Map<
    string,
    { contract: MessageContractDescriptor; producers: Set<string> }
  >();
  for (const compiled of cells)
    for (const event of compiled.manifest.emits) {
      const current = eventsById.get(event.id);
      if (current === undefined)
        eventsById.set(event.id, {
          contract: event,
          producers: new Set([compiled.manifest.id]),
        });
      else if (current.contract !== event)
        violations.push(
          violation(
            'duplicate_event_identity',
            event.id,
            `Message identity "${event.id}" has more than one contract declaration. Reuse the producer-owned contract object.`,
          ),
        );
      else current.producers.add(compiled.manifest.id);
    }

  for (const compiled of cells)
    for (const event of compiled.manifest.consumes)
      if (event.scope === 'internal' && !eventsById.has(event.id))
        violations.push(
          violation(
            'undeclared_internal_event',
            `${compiled.manifest.id}:${event.id}`,
            `Cell consumes internal message "${event.id}" but no selected producer emits it.`,
          ),
        );

  const operationIds = new Set(cells.map((compiled) => compiled.manifest.id));
  const experiences = sorted(
    definition.experiences.map((experience) => {
      for (const used of duplicateValues(experience.uses))
        violations.push(
          violation(
            'duplicate_experience_use',
            `${experience.id}:${used}`,
            `Experience "${experience.id}" repeats operation "${used}".`,
          ),
        );
      for (const used of experience.uses)
        if (!operationIds.has(used))
          violations.push(
            violation(
              'unknown_experience_operation',
              `${experience.id}:${used}`,
              `Experience "${experience.id}" uses unknown operation "${used}".`,
            ),
          );

      const features = Object.freeze(
        [...experience.features]
          .sort((left, right) =>
            left.manifest.id.localeCompare(right.manifest.id),
          )
          .map((feature) => {
            for (const used of feature.manifest.uses)
              if (!operationIds.has(used))
                violations.push(
                  violation(
                    'unknown_experience_feature_operation',
                    `${feature.manifest.id}:${used}`,
                    `Experience feature "${feature.manifest.id}" uses unknown operation "${used}".`,
                  ),
                );
            return Object.freeze({
              id: feature.manifest.id,
              operationIds: Object.freeze([...feature.manifest.uses].sort()),
              stateProofs: Object.freeze([...feature.manifest.stateProofs]),
              componentProofs: Object.freeze([
                ...feature.manifest.componentProofs,
              ]),
              source: feature.source,
            });
          }),
      );
      const consumedOperationIds = Object.freeze(
        [
          ...new Set([
            ...experience.uses,
            ...features.flatMap((feature) => feature.operationIds),
          ]),
        ].sort(),
      );

      const clientOperationIds = Object.freeze(
        [
          ...new Set([
            ...consumedOperationIds,
            ...experience.cells.flatMap((selection) =>
              selection.manifest.surfaces.some(
                (surface) =>
                  surface.kind === 'http' || surface.kind === 'event-stream',
              )
                ? [selection.manifest.id]
                : [],
            ),
          ]),
        ].sort(),
      );

      for (const clientOperationId of clientOperationIds) {
        const cell = cells.find(
          (compiled) => compiled.manifest.id === clientOperationId,
        );
        if (cell === undefined) continue;
        const selection = selectClientHttpSurfaces(
          cell.manifest.surfaces.filter(
            (surface): surface is HttpSurfaceManifest =>
              surface.kind === 'http',
          ),
        );
        if (selection.kind === 'ambiguous')
          violations.push(
            violation(
              'ambiguous_client_http_surface',
              `${experience.id}:${clientOperationId}`,
              `${selection.reason} Generated browser clients must select routes structurally.`,
            ),
          );

        const eventStreamCount = cell.manifest.surfaces.filter(
          (surface) => surface.kind === 'event-stream',
        ).length;
        if (eventStreamCount > 1)
          violations.push(
            violation(
              'ambiguous_client_event_stream_surface',
              `${experience.id}:${clientOperationId}`,
              `Generated browser clients require a single event-stream surface per consumed operation; found ${eventStreamCount}.`,
            ),
          );
      }

      return Object.freeze({
        id: experience.id,
        operationIds: consumedOperationIds,
        clientOperationIds,
        features,
      });
    }),
    (experience) => experience.id,
  );

  if (violations.length > 0)
    return Object.freeze({
      kind: 'invalid',
      violations: sorted(
        violations,
        (entry) => `${entry.code}|${entry.subject}|${entry.message}`,
      ),
    });

  const events = sorted(
    [...eventsById.values()].map((event) =>
      Object.freeze({
        contract: event.contract,
        producers: Object.freeze([...event.producers].sort()),
      }),
    ),
    (event) => event.contract.id,
  );

  return Object.freeze({
    kind: 'compiled',
    topology: Object.freeze({
      id: definition.id,
      cells,
      cliCommands,
      eventStreams,
      httpRoutes,
      jobs,
      events,
      experiences,
      cliProgram: definition.cliProgram,
      httpBoundaryProfiles: httpBoundaries.profiles,
    }),
  });
};
