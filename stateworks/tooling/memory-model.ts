import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { toolingError } from '@pressly/errors/tooling-error';

export const memoryStatuses = [
  'draft',
  'active',
  'deprecated',
  'archived',
] as const;

export const memoryEntryStatuses = [
  'active',
  'proposed',
  'deprecated',
  'conflicted',
] as const;

export const memoryKinds = [
  'actor',
  'external_system',
  'object',
  'workflow',
  'invariant',
  'policy',
  'decision',
  'assumption',
  'open_question',
] as const;

export const memoryDeltaOps = ['assert', 'update', 'deprecate'] as const;
export const memoryDeltaStatuses = [
  'proposed',
  'accepted',
  'applied',
  'rejected',
] as const;

export type MemoryStatus = (typeof memoryStatuses)[number];
export type MemoryEntryStatus = (typeof memoryEntryStatuses)[number];
export type MemoryKind = (typeof memoryKinds)[number];
export type MemoryDeltaOp = (typeof memoryDeltaOps)[number];
export type MemoryDeltaStatus = (typeof memoryDeltaStatuses)[number];

export type ValidationIssue = Readonly<{
  level: 'error' | 'warning';
  message: string;
}>;

export type ValidationResult = Readonly<{
  errors: readonly ValidationIssue[];
  warnings: readonly ValidationIssue[];
}>;

export type SourceEntry = {
  id: string;
  path: string;
  type?: string;
};

export type DescribedEntry = {
  id: string;
  description: string;
  status?: MemoryEntryStatus;
  sources?: string[];
};

export type StatementEntry = {
  id: string;
  statement: string;
  status?: MemoryEntryStatus;
  sources: string[];
  confidence?: 'low' | 'medium' | 'high';
};

export type QuestionEntry = {
  id: string;
  question: string;
  status?: MemoryEntryStatus;
  sources: string[];
};

export type WorkflowEntry = {
  id: string;
  steps: string[];
  status?: MemoryEntryStatus;
  sources: string[];
};

export type StateworksDomainMemory = {
  domain_id: string;
  name: string;
  version: number;
  status: MemoryStatus;
  summary?: string;
  actors?: DescribedEntry[];
  external_systems?: DescribedEntry[];
  objects?: DescribedEntry[];
  states?: Record<string, string[]>;
  workflows?: WorkflowEntry[];
  invariants?: StatementEntry[];
  policies?: StatementEntry[];
  decisions?: StatementEntry[];
  assumptions?: StatementEntry[];
  open_questions?: QuestionEntry[];
  sources?: SourceEntry[];
};

export type StateworksMemoryIndex = {
  domains?: Array<{
    id: string;
    path: string;
    default_context_pack?: string;
  }>;
  context_budget?: {
    max_tokens?: number;
    priority_order?: string[];
  };
};

export type MemoryDelta = {
  id: string;
  domain_id: string;
  source: {
    type: string;
    path: string;
  };
  changes: MemoryDeltaChange[];
  verification: string[];
  status: MemoryDeltaStatus;
};

export type MemoryDeltaChange = {
  op: MemoryDeltaOp;
  kind: MemoryKind;
  id: string;
  statement?: string;
  description?: string;
  question?: string;
  steps?: string[];
  confidence?: 'low' | 'medium' | 'high';
};

type IssueCollector = {
  addError: (message: string) => void;
  addWarning: (message: string) => void;
};

const memoryStatusSet = new Set<string>(memoryStatuses);
const memoryEntryStatusSet = new Set<string>(memoryEntryStatuses);
const memoryKindSet = new Set<string>(memoryKinds);
const memoryDeltaOpSet = new Set<string>(memoryDeltaOps);
const memoryDeltaStatusSet = new Set<string>(memoryDeltaStatuses);

const statementSections = [
  'invariants',
  'policies',
  'decisions',
  'assumptions',
] as const;

const describedSections = ['actors', 'external_systems', 'objects'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

export const loadYamlFile = async <T>(filePath: string): Promise<T> => {
  const source = await readFile(filePath, 'utf8');
  return parse(source) as T;
};

export const writeYamlFile = async (
  filePath: string,
  value: unknown,
): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, stringify(value), 'utf8');
};

export const loadDomainMemory = async (
  filePath: string,
): Promise<StateworksDomainMemory> =>
  loadYamlFile<StateworksDomainMemory>(filePath);

export const loadMemoryDelta = async (filePath: string): Promise<MemoryDelta> =>
  loadYamlFile<MemoryDelta>(filePath);

export const loadMemoryIndex = async (
  memoryRoot = 'stateworks/memory',
): Promise<StateworksMemoryIndex> =>
  loadYamlFile<StateworksMemoryIndex>(join(memoryRoot, 'index.yaml'));

export const resolveDomainMemoryPaths = async (
  domainId: string,
  memoryRoot = 'stateworks/memory',
): Promise<{ memoryPath: string; contextPackPath?: string }> => {
  const index = await loadMemoryIndex(memoryRoot);
  const domain = index.domains?.find((entry) => entry.id === domainId);

  if (!domain) {
    throw toolingError({
      code: 'memory_domain_not_found',
      message: `memory domain not found: ${domainId}`,
    });
  }

  const result: { memoryPath: string; contextPackPath?: string } = {
    memoryPath: join(memoryRoot, domain.path),
  };

  if (domain.default_context_pack) {
    result.contextPackPath = join(memoryRoot, domain.default_context_pack);
  }

  return result;
};

export const validateDomainMemory = (memory: unknown): ValidationResult => {
  const issues: ValidationIssue[] = [];
  const collector = createCollector(issues);

  if (!isRecord(memory)) {
    return {
      errors: [{ level: 'error', message: 'memory must be an object' }],
      warnings: [],
    };
  }

  requireString(memory, 'domain_id', 'memory', collector);
  requireString(memory, 'name', 'memory', collector);

  const version = memory['version'];
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    collector.addError('memory.version must be a positive integer');
  }

  const status = memory['status'];
  if (typeof status !== 'string' || !memoryStatusSet.has(status)) {
    collector.addError(
      `memory.status must be one of ${memoryStatuses.join(', ')}`,
    );
  }

  const sourceIds = validateSources(memory['sources'], collector);

  for (const section of describedSections) {
    validateDescribedEntries(section, memory[section], sourceIds, collector);
  }

  validateStates(memory['states'], collector);
  validateWorkflowEntries(memory['workflows'], sourceIds, collector);

  for (const section of statementSections) {
    validateStatementEntries(section, memory[section], sourceIds, collector);
  }

  validateQuestionEntries(memory['open_questions'], sourceIds, collector);

  return splitIssues(issues);
};

export const validateMemoryDelta = (delta: unknown): ValidationResult => {
  const issues: ValidationIssue[] = [];
  const collector = createCollector(issues);

  if (!isRecord(delta)) {
    return {
      errors: [{ level: 'error', message: 'memory delta must be an object' }],
      warnings: [],
    };
  }

  requireString(delta, 'id', 'delta', collector);
  requireString(delta, 'domain_id', 'delta', collector);
  validateDeltaSource(delta['source'], collector);

  const changes = delta['changes'];
  if (!Array.isArray(changes) || changes.length === 0) {
    collector.addError('delta.changes must be a non-empty array');
  } else {
    changes.forEach((change, index) =>
      validateDeltaChange(change, `delta.changes[${index}]`, collector),
    );
  }

  if (
    !isStringArray(delta['verification']) ||
    delta['verification'].length === 0
  ) {
    collector.addError('delta.verification must be a non-empty string array');
  }

  const status = delta['status'];
  if (typeof status !== 'string' || !memoryDeltaStatusSet.has(status)) {
    collector.addError(
      `delta.status must be one of ${memoryDeltaStatuses.join(', ')}`,
    );
  }

  return splitIssues(issues);
};

export const buildContextPack = (memory: StateworksDomainMemory): string => {
  const lines: string[] = [
    `# ${memory.name} Context Pack`,
    '',
    '## Domain',
    '',
    `${memory.name} (\`${memory.domain_id}\`)`,
    '',
    '## Summary',
    '',
    memory.summary?.trim() || 'No summary recorded.',
    '',
  ];

  appendStatementSection(lines, 'Invariants', memory.invariants);
  appendStatementSection(lines, 'Policies', memory.policies);
  appendStatementSection(lines, 'Decisions', memory.decisions);
  appendWorkflowSection(lines, memory.workflows);
  appendVocabularySection(lines, memory);
  appendStatementSection(lines, 'Assumptions', memory.assumptions);
  appendQuestionSection(lines, memory.open_questions);

  return `${lines.join('\n').trimEnd()}\n`;
};

export const applyAcceptedMemoryDelta = (
  memory: StateworksDomainMemory,
  delta: MemoryDelta,
): StateworksDomainMemory => {
  if (delta.domain_id !== memory.domain_id) {
    throw toolingError({
      code: 'memory_delta_domain_mismatch',
      message: `delta domain ${delta.domain_id} does not match memory domain ${memory.domain_id}`,
    });
  }

  if (delta.status !== 'accepted') {
    throw toolingError({
      code: 'memory_delta_not_accepted',
      message: 'only accepted memory deltas can be applied',
    });
  }

  const next = cloneMemory(memory);
  const sourceId = delta.id;
  const sources = [...(next.sources ?? [])];

  if (!sources.some((source) => source.id === sourceId)) {
    sources.push({
      id: sourceId,
      path: delta.source.path,
      type: delta.source.type,
    });
  }

  next.sources = sources;

  for (const change of delta.changes) {
    applyDeltaChange(next, change, sourceId);
  }

  next.version += 1;
  return next;
};

export const formatIssues = (result: ValidationResult): string => {
  const lines: string[] = [];

  for (const issue of [...result.errors, ...result.warnings]) {
    lines.push(`${issue.level.toUpperCase()}: ${issue.message}`);
  }

  return lines.join('\n');
};

const createCollector = (issues: ValidationIssue[]): IssueCollector => ({
  addError: (message: string) => issues.push({ level: 'error', message }),
  addWarning: (message: string) => issues.push({ level: 'warning', message }),
});

const splitIssues = (issues: readonly ValidationIssue[]): ValidationResult => ({
  errors: issues.filter((issue) => issue.level === 'error'),
  warnings: issues.filter((issue) => issue.level === 'warning'),
});

const requireString = (
  record: Record<string, unknown>,
  key: string,
  label: string,
  collector: IssueCollector,
) => {
  const value = record[key];

  if (typeof value !== 'string' || value.length === 0) {
    collector.addError(`${label}.${key} is required`);
  }
};

const validateSources = (
  sources: unknown,
  collector: IssueCollector,
): ReadonlySet<string> => {
  const sourceIds = new Set<string>();

  if (sources === undefined) {
    return sourceIds;
  }

  if (!Array.isArray(sources)) {
    collector.addError('memory.sources must be an array');
    return sourceIds;
  }

  sources.forEach((source, index) => {
    const label = `memory.sources[${index}]`;

    if (!isRecord(source)) {
      collector.addError(`${label} must be an object`);
      return;
    }

    const id = source['id'];
    const path = source['path'];

    if (typeof id !== 'string' || id.length === 0) {
      collector.addError(`${label}.id is required`);
    } else {
      sourceIds.add(id);
    }

    if (typeof path !== 'string' || path.length === 0) {
      collector.addError(`${label}.path is required`);
    }
  });

  return sourceIds;
};

const validateDescribedEntries = (
  section: string,
  entries: unknown,
  sourceIds: ReadonlySet<string>,
  collector: IssueCollector,
) => {
  if (entries === undefined) {
    return;
  }

  if (!Array.isArray(entries)) {
    collector.addError(`memory.${section} must be an array`);
    return;
  }

  entries.forEach((entry, index) => {
    const label = `memory.${section}[${index}]`;

    if (!isRecord(entry)) {
      collector.addError(`${label} must be an object`);
      return;
    }

    requireString(entry, 'id', label, collector);
    requireString(entry, 'description', label, collector);
    validateEntryStatus(entry['status'], `${label}.status`, collector);
    validateSourceRefs(entry['sources'], label, sourceIds, collector, false);
  });
};

const validateStates = (states: unknown, collector: IssueCollector) => {
  if (states === undefined) {
    return;
  }

  if (!isRecord(states)) {
    collector.addError('memory.states must be an object');
    return;
  }

  for (const [key, value] of Object.entries(states)) {
    if (!isStringArray(value)) {
      collector.addError(`memory.states.${key} must be a string array`);
    }
  }
};

const validateWorkflowEntries = (
  entries: unknown,
  sourceIds: ReadonlySet<string>,
  collector: IssueCollector,
) => {
  if (entries === undefined) {
    return;
  }

  if (!Array.isArray(entries)) {
    collector.addError('memory.workflows must be an array');
    return;
  }

  entries.forEach((entry, index) => {
    const label = `memory.workflows[${index}]`;

    if (!isRecord(entry)) {
      collector.addError(`${label} must be an object`);
      return;
    }

    requireString(entry, 'id', label, collector);

    if (!isStringArray(entry['steps']) || entry['steps'].length === 0) {
      collector.addError(`${label}.steps must be a non-empty string array`);
    }

    validateEntryStatus(entry['status'], `${label}.status`, collector);
    validateSourceRefs(entry['sources'], label, sourceIds, collector, true);
  });
};

const validateStatementEntries = (
  section: string,
  entries: unknown,
  sourceIds: ReadonlySet<string>,
  collector: IssueCollector,
) => {
  if (entries === undefined) {
    return;
  }

  if (!Array.isArray(entries)) {
    collector.addError(`memory.${section} must be an array`);
    return;
  }

  entries.forEach((entry, index) => {
    const label = `memory.${section}[${index}]`;

    if (!isRecord(entry)) {
      collector.addError(`${label} must be an object`);
      return;
    }

    requireString(entry, 'id', label, collector);
    requireString(entry, 'statement', label, collector);
    validateEntryStatus(entry['status'], `${label}.status`, collector);
    validateSourceRefs(entry['sources'], label, sourceIds, collector, true);
  });
};

const validateQuestionEntries = (
  entries: unknown,
  sourceIds: ReadonlySet<string>,
  collector: IssueCollector,
) => {
  if (entries === undefined) {
    return;
  }

  if (!Array.isArray(entries)) {
    collector.addError('memory.open_questions must be an array');
    return;
  }

  entries.forEach((entry, index) => {
    const label = `memory.open_questions[${index}]`;

    if (!isRecord(entry)) {
      collector.addError(`${label} must be an object`);
      return;
    }

    requireString(entry, 'id', label, collector);
    requireString(entry, 'question', label, collector);
    validateEntryStatus(entry['status'], `${label}.status`, collector);
    validateSourceRefs(entry['sources'], label, sourceIds, collector, true);
  });
};

const validateEntryStatus = (
  status: unknown,
  label: string,
  collector: IssueCollector,
) => {
  if (
    status !== undefined &&
    (typeof status !== 'string' || !memoryEntryStatusSet.has(status))
  ) {
    collector.addError(
      `${label} must be one of ${memoryEntryStatuses.join(', ')}`,
    );
  }
};

const validateSourceRefs = (
  sources: unknown,
  label: string,
  sourceIds: ReadonlySet<string>,
  collector: IssueCollector,
  required: boolean,
) => {
  if (sources === undefined) {
    if (required) {
      collector.addError(`${label}.sources is required`);
    }

    return;
  }

  if (!isStringArray(sources) || (required && sources.length === 0)) {
    collector.addError(`${label}.sources must be a non-empty string array`);
    return;
  }

  for (const source of sources) {
    if (!sourceIds.has(source)) {
      collector.addError(
        `${label}.sources references missing source ${source}`,
      );
    }
  }
};

const validateDeltaSource = (source: unknown, collector: IssueCollector) => {
  if (!isRecord(source)) {
    collector.addError('delta.source must be an object');
    return;
  }

  requireString(source, 'type', 'delta.source', collector);
  requireString(source, 'path', 'delta.source', collector);
};

const validateDeltaChange = (
  change: unknown,
  label: string,
  collector: IssueCollector,
) => {
  if (!isRecord(change)) {
    collector.addError(`${label} must be an object`);
    return;
  }

  const op = change['op'];
  const kind = change['kind'];

  if (typeof op !== 'string' || !memoryDeltaOpSet.has(op)) {
    collector.addError(
      `${label}.op must be one of ${memoryDeltaOps.join(', ')}`,
    );
  }

  if (typeof kind !== 'string' || !memoryKindSet.has(kind)) {
    collector.addError(
      `${label}.kind must be one of ${memoryKinds.join(', ')}`,
    );
  }

  requireString(change, 'id', label, collector);

  if (op === 'deprecate') {
    return;
  }

  if (
    kind === 'invariant' ||
    kind === 'policy' ||
    kind === 'decision' ||
    kind === 'assumption'
  ) {
    requireString(change, 'statement', label, collector);
  } else if (
    kind === 'actor' ||
    kind === 'external_system' ||
    kind === 'object'
  ) {
    requireString(change, 'description', label, collector);
  } else if (kind === 'open_question') {
    requireString(change, 'question', label, collector);
  } else if (kind === 'workflow') {
    const steps = change['steps'];
    if (!isStringArray(steps) || steps.length === 0) {
      collector.addError(`${label}.steps must be a non-empty string array`);
    }
  }
};

const appendStatementSection = (
  lines: string[],
  title: string,
  entries: readonly StatementEntry[] | undefined,
) => {
  lines.push(`## ${title}`, '');

  const activeEntries = active(entries);

  if (activeEntries.length === 0) {
    lines.push('- None recorded.', '');
    return;
  }

  for (const entry of activeEntries) {
    lines.push(`- ${entry.id}: ${entry.statement}`);
  }

  lines.push('');
};

const appendQuestionSection = (
  lines: string[],
  entries: readonly QuestionEntry[] | undefined,
) => {
  lines.push('## Open Questions', '');

  const activeEntries = active(entries);

  if (activeEntries.length === 0) {
    lines.push('- None recorded.', '');
    return;
  }

  for (const entry of activeEntries) {
    lines.push(`- ${entry.id}: ${entry.question}`);
  }

  lines.push('');
};

const appendWorkflowSection = (
  lines: string[],
  entries: readonly WorkflowEntry[] | undefined,
) => {
  lines.push('## Workflows', '');

  const activeEntries = active(entries);

  if (activeEntries.length === 0) {
    lines.push('- None recorded.', '');
    return;
  }

  for (const entry of activeEntries) {
    lines.push(`- ${entry.id}: ${entry.steps.join(' -> ')}`);
  }

  lines.push('');
};

const appendVocabularySection = (
  lines: string[],
  memory: StateworksDomainMemory,
) => {
  lines.push('## Vocabulary', '');

  const vocabulary: string[] = [];

  for (const entry of active(memory.actors)) {
    vocabulary.push(`actor:${entry.id}: ${entry.description}`);
  }

  for (const entry of active(memory.external_systems)) {
    vocabulary.push(`external_system:${entry.id}: ${entry.description}`);
  }

  for (const entry of active(memory.objects)) {
    vocabulary.push(`object:${entry.id}: ${entry.description}`);
  }

  for (const [objectId, states] of Object.entries(memory.states ?? {})) {
    vocabulary.push(`states:${objectId}: ${states.join(', ')}`);
  }

  if (vocabulary.length === 0) {
    lines.push('- None recorded.', '');
    return;
  }

  for (const entry of vocabulary) {
    lines.push(`- ${entry}`);
  }

  lines.push('');
};

const active = <T extends { status?: MemoryEntryStatus }>(
  entries: readonly T[] | undefined,
): readonly T[] =>
  (entries ?? []).filter(
    (entry) => entry.status !== 'deprecated' && entry.status !== 'conflicted',
  );

const cloneMemory = (
  memory: StateworksDomainMemory,
): StateworksDomainMemory => {
  const next: StateworksDomainMemory = {
    domain_id: memory.domain_id,
    name: memory.name,
    version: memory.version,
    status: memory.status,
  };

  if (memory.summary !== undefined) {
    next.summary = memory.summary;
  }

  if (memory.actors) {
    next.actors = [...memory.actors];
  }

  if (memory.external_systems) {
    next.external_systems = [...memory.external_systems];
  }

  if (memory.objects) {
    next.objects = [...memory.objects];
  }

  if (memory.states) {
    next.states = { ...memory.states };
  }

  if (memory.workflows) {
    next.workflows = [...memory.workflows];
  }

  if (memory.invariants) {
    next.invariants = [...memory.invariants];
  }

  if (memory.policies) {
    next.policies = [...memory.policies];
  }

  if (memory.decisions) {
    next.decisions = [...memory.decisions];
  }

  if (memory.assumptions) {
    next.assumptions = [...memory.assumptions];
  }

  if (memory.open_questions) {
    next.open_questions = [...memory.open_questions];
  }

  if (memory.sources) {
    next.sources = [...memory.sources];
  }

  return next;
};

const applyDeltaChange = (
  memory: StateworksDomainMemory,
  change: MemoryDeltaChange,
  sourceId: string,
) => {
  if (change.kind === 'actor') {
    applyDescribedChange(memory, 'actors', change, sourceId);
  } else if (change.kind === 'external_system') {
    applyDescribedChange(memory, 'external_systems', change, sourceId);
  } else if (change.kind === 'object') {
    applyDescribedChange(memory, 'objects', change, sourceId);
  } else if (change.kind === 'workflow') {
    applyWorkflowChange(memory, change, sourceId);
  } else if (change.kind === 'open_question') {
    applyQuestionChange(memory, change, sourceId);
  } else {
    applyStatementChange(memory, change.kind, change, sourceId);
  }
};

const applyDescribedChange = (
  memory: StateworksDomainMemory,
  section: 'actors' | 'external_systems' | 'objects',
  change: MemoryDeltaChange,
  sourceId: string,
) => {
  const entries = [...(memory[section] ?? [])];
  const index = entries.findIndex((entry) => entry.id === change.id);

  if (change.op === 'deprecate') {
    deprecateEntry(entries, index, change.id);
    memory[section] = entries;
    return;
  }

  if (!change.description) {
    throw toolingError({
      code: 'memory_change_description_required',
      message: `${change.kind} change ${change.id} requires description`,
    });
  }

  const nextEntry: DescribedEntry = {
    id: change.id,
    description: change.description,
    status: 'active',
    sources: [sourceId],
  };

  upsertEntry(entries, index, nextEntry, change.op);
  memory[section] = entries;
};

const applyWorkflowChange = (
  memory: StateworksDomainMemory,
  change: MemoryDeltaChange,
  sourceId: string,
) => {
  const entries = [...(memory.workflows ?? [])];
  const index = entries.findIndex((entry) => entry.id === change.id);

  if (change.op === 'deprecate') {
    deprecateEntry(entries, index, change.id);
    memory.workflows = entries;
    return;
  }

  if (!change.steps || change.steps.length === 0) {
    throw toolingError({
      code: 'memory_workflow_steps_required',
      message: `workflow change ${change.id} requires steps`,
    });
  }

  const nextEntry: WorkflowEntry = {
    id: change.id,
    steps: change.steps,
    status: 'active',
    sources: [sourceId],
  };

  upsertEntry(entries, index, nextEntry, change.op);
  memory.workflows = entries;
};

const applyStatementChange = (
  memory: StateworksDomainMemory,
  kind: 'invariant' | 'policy' | 'decision' | 'assumption',
  change: MemoryDeltaChange,
  sourceId: string,
) => {
  const section = (kind === 'policy' ? 'policies' : `${kind}s`) as
    | 'invariants'
    | 'policies'
    | 'decisions'
    | 'assumptions';
  const entries = [...(memory[section] ?? [])];
  const index = entries.findIndex((entry) => entry.id === change.id);

  if (change.op === 'deprecate') {
    deprecateEntry(entries, index, change.id);
    memory[section] = entries;
    return;
  }

  if (!change.statement) {
    throw toolingError({
      code: 'memory_statement_required',
      message: `${kind} change ${change.id} requires statement`,
    });
  }

  const nextEntry: StatementEntry = {
    id: change.id,
    statement: change.statement,
    status: 'active',
    sources: [sourceId],
  };

  if (change.confidence) {
    nextEntry.confidence = change.confidence;
  }

  upsertEntry(entries, index, nextEntry, change.op);
  memory[section] = entries;
};

const applyQuestionChange = (
  memory: StateworksDomainMemory,
  change: MemoryDeltaChange,
  sourceId: string,
) => {
  const entries = [...(memory.open_questions ?? [])];
  const index = entries.findIndex((entry) => entry.id === change.id);

  if (change.op === 'deprecate') {
    deprecateEntry(entries, index, change.id);
    memory.open_questions = entries;
    return;
  }

  if (!change.question) {
    throw toolingError({
      code: 'memory_question_required',
      message: `open_question change ${change.id} requires question`,
    });
  }

  const nextEntry: QuestionEntry = {
    id: change.id,
    question: change.question,
    status: 'active',
    sources: [sourceId],
  };

  upsertEntry(entries, index, nextEntry, change.op);
  memory.open_questions = entries;
};

const deprecateEntry = <T extends { id: string; status?: MemoryEntryStatus }>(
  entries: T[],
  index: number,
  id: string,
) => {
  const existing = entries[index];

  if (!existing) {
    throw toolingError({
      code: 'memory_entry_missing_for_deprecation',
      message: `cannot deprecate missing memory entry ${id}`,
    });
  }

  entries[index] = { ...existing, status: 'deprecated' };
};

const upsertEntry = <T extends { id: string; sources?: string[] }>(
  entries: T[],
  index: number,
  nextEntry: T,
  op: MemoryDeltaOp,
) => {
  const existing = entries[index];

  if (!existing) {
    entries.push(nextEntry);
    return;
  }

  if (
    op === 'assert' &&
    JSON.stringify(existing) !== JSON.stringify(nextEntry)
  ) {
    throw toolingError({
      code: 'memory_entry_assert_conflict',
      message: `memory entry ${nextEntry.id} already exists; use update or deprecate`,
    });
  }

  entries[index] = {
    ...existing,
    ...nextEntry,
    sources: Array.from(
      new Set([...(existing.sources ?? []), ...(nextEntry.sources ?? [])]),
    ),
  };
};
