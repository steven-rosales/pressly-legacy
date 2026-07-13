import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

export const taskTypes = [
  'compound',
  'primitive',
  'verification',
  'human_gate',
  'human_action',
] as const;

export const taskStatuses = [
  'latent',
  'pending',
  'ready',
  'running',
  'proposed',
  'committed',
  'failed',
  'blocked',
  'invalidated',
] as const;

export const owners = ['agent', 'human'] as const;

export const surfaces = [
  'repo',
  'database',
  'aws',
  'github',
  'dns',
  'sentry',
  'local_secret_store',
  'memory',
  'other',
] as const;

export type TaskType = (typeof taskTypes)[number];
export type TaskStatus = (typeof taskStatuses)[number];
export type Owner = (typeof owners)[number];
export type Surface = (typeof surfaces)[number];

export type StateworksTask = Readonly<{
  id: string;
  title: string;
  type: TaskType;
  owner?: Owner;
  surface?: Surface;
  agent_can_verify?: boolean;
  deps?: readonly string[];
  reads?: readonly string[];
  writes?: readonly string[];
  human_instructions?: readonly string[];
  action?: string | readonly string[];
  expected_external_state?: readonly string[];
  verifier?: string | readonly string[];
  rollback?: string | readonly string[];
  secret_handling?: string;
  status?: TaskStatus;
  repair_attempts?: number;
  evidence?: readonly string[];
  destructive?: boolean;
}>;

export type StateworksNetwork = Readonly<{
  work_id: string;
  title: string;
  status?: string;
  goal: string | readonly string[];
  invariants?: readonly string[];
  max_repair_attempts?: number;
  stop_on?: readonly string[];
  tasks: readonly StateworksTask[];
}>;

export type StateworksState = Readonly<{
  tasks?: Readonly<
    Record<string, Partial<StateworksTask> & { evidence?: readonly string[] }>
  >;
}>;

export type ValidationIssue = Readonly<{
  level: 'error' | 'warning';
  message: string;
}>;

export type ValidationResult = Readonly<{
  errors: readonly ValidationIssue[];
  warnings: readonly ValidationIssue[];
}>;

const taskTypeSet = new Set<string>(taskTypes);
const taskStatusSet = new Set<string>(taskStatuses);
const ownerSet = new Set<string>(owners);
const surfaceSet = new Set<string>(surfaces);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const normalizeStatus = (task: StateworksTask): TaskStatus =>
  task.status ?? 'pending';

export const loadYamlFile = async <T>(filePath: string): Promise<T> => {
  const source = await readFile(filePath, 'utf8');
  return parse(source) as T;
};

export const loadNetworkFile = async (
  filePath: string,
): Promise<StateworksNetwork> => loadYamlFile<StateworksNetwork>(filePath);

export const loadStateFile = async (
  filePath: string | undefined,
): Promise<StateworksState> => {
  if (!filePath) {
    return {};
  }

  return loadYamlFile<StateworksState>(filePath);
};

export const applyState = (
  network: StateworksNetwork,
  state: StateworksState,
): StateworksNetwork => {
  if (!state.tasks) {
    return network;
  }

  return {
    ...network,
    tasks: network.tasks.map((task) => ({
      ...task,
      ...(state.tasks?.[task.id] ?? {}),
    })),
  };
};

export const validateNetwork = (network: unknown): ValidationResult => {
  const issues: ValidationIssue[] = [];
  const addError = (message: string) =>
    issues.push({ level: 'error', message });
  const addWarning = (message: string) =>
    issues.push({ level: 'warning', message });

  if (!isRecord(network)) {
    return {
      errors: [{ level: 'error', message: 'network must be an object' }],
      warnings: [],
    };
  }

  const workId = network['work_id'];
  const title = network['title'];
  const goal = network['goal'];
  const maxRepairAttempts = network['max_repair_attempts'];
  const tasks = network['tasks'];

  if (typeof workId !== 'string' || workId.length === 0) {
    addError('network.work_id is required');
  }

  if (typeof title !== 'string' || title.length === 0) {
    addError('network.title is required');
  }

  if (typeof goal !== 'string' && !isStringArray(goal)) {
    addError('network.goal must be a string or string array');
  }

  if (
    maxRepairAttempts !== undefined &&
    (typeof maxRepairAttempts !== 'number' ||
      !Number.isInteger(maxRepairAttempts) ||
      maxRepairAttempts < 0)
  ) {
    addError('network.max_repair_attempts must be a non-negative integer');
  }

  if (!Array.isArray(tasks)) {
    addError('network.tasks must be an array');
    return splitIssues(issues);
  }

  if (tasks.length === 0) {
    addError('network.tasks must not be empty');
  }

  const ids = new Set<string>();
  const duplicateIds = new Set<string>();

  for (const [index, task] of tasks.entries()) {
    const label = `task[${index}]`;

    if (!isRecord(task)) {
      addError(`${label} must be an object`);
      continue;
    }

    const taskId = task['id'];
    const taskTitle = task['title'];
    const taskType = task['type'];
    const taskOwner = task['owner'];
    const taskSurface = task['surface'];
    const taskStatus = task['status'];
    const deps = task['deps'];
    const reads = task['reads'];
    const writes = task['writes'];
    const humanInstructions = task['human_instructions'];
    const action = task['action'];
    const verifier = task['verifier'];
    const rollback = task['rollback'];

    if (typeof taskId !== 'string' || taskId.length === 0) {
      addError(`${label}.id is required`);
    } else if (ids.has(taskId)) {
      duplicateIds.add(taskId);
    } else {
      ids.add(taskId);
    }

    if (typeof taskTitle !== 'string' || taskTitle.length === 0) {
      addError(`${label}.title is required`);
    }

    if (typeof taskType !== 'string' || !taskTypeSet.has(taskType)) {
      addError(`${label}.type must be one of ${taskTypes.join(', ')}`);
    }

    if (
      taskOwner !== undefined &&
      (typeof taskOwner !== 'string' || !ownerSet.has(taskOwner))
    ) {
      addError(`${label}.owner must be one of ${owners.join(', ')}`);
    }

    if (
      taskSurface !== undefined &&
      (typeof taskSurface !== 'string' || !surfaceSet.has(taskSurface))
    ) {
      addError(`${label}.surface must be one of ${surfaces.join(', ')}`);
    }

    if (
      taskStatus !== undefined &&
      (typeof taskStatus !== 'string' || !taskStatusSet.has(taskStatus))
    ) {
      addError(`${label}.status must be one of ${taskStatuses.join(', ')}`);
    }

    if (deps !== undefined && !isStringArray(deps)) {
      addError(`${label}.deps must be a string array`);
    }

    if (reads !== undefined && !isStringArray(reads)) {
      addError(`${label}.reads must be a string array`);
    }

    if (writes !== undefined && !isStringArray(writes)) {
      addError(`${label}.writes must be a string array`);
    }

    if (taskType === 'human_action' && taskOwner !== 'human') {
      addError(`${label} is a human_action and must have owner: human`);
    }

    if (taskType === 'human_gate' && taskOwner !== 'human') {
      addError(`${label} is a human_gate and must have owner: human`);
    }

    if (taskType === 'human_action' && !isStringArray(humanInstructions)) {
      addError(`${label} is a human_action and needs human_instructions`);
    }

    if (
      (taskType === 'primitive' || taskType === 'verification') &&
      taskOwner !== 'human' &&
      action === undefined
    ) {
      addWarning(`${label} has no action`);
    }

    if (verifier === undefined) {
      addWarning(`${label} has no verifier`);
    }

    if (rollback === undefined) {
      addWarning(`${label} has no rollback or compensation note`);
    }
  }

  for (const duplicateId of duplicateIds) {
    addError(`duplicate task id: ${duplicateId}`);
  }

  for (const task of tasks) {
    if (!isRecord(task) || typeof task['id'] !== 'string') {
      continue;
    }

    const taskId = task['id'];
    const deps = isStringArray(task['deps']) ? task['deps'] : [];

    for (const dep of deps) {
      if (!ids.has(dep)) {
        addError(`task ${taskId} depends on missing task ${dep}`);
      }

      if (dep === taskId) {
        addError(`task ${taskId} depends on itself`);
      }
    }
  }

  for (const cycle of findCycles(tasks as StateworksTask[])) {
    addError(`dependency cycle: ${cycle.join(' -> ')}`);
  }

  return splitIssues(issues);
};

export const findNextBatch = (
  network: StateworksNetwork,
): readonly StateworksTask[] => {
  const statusById = new Map(
    network.tasks.map((task) => [task.id, normalizeStatus(task)]),
  );

  const readyTasks = network.tasks.filter((task) => {
    const status = normalizeStatus(task);

    if (status !== 'pending' && status !== 'ready') {
      return false;
    }

    return (task.deps ?? []).every(
      (dep) => statusById.get(dep) === 'committed',
    );
  });

  const batch: StateworksTask[] = [];

  for (const task of readyTasks) {
    if (batch.every((existing) => areCompatible(existing, task))) {
      batch.push(task);
    }
  }

  return batch;
};

export const verifyLifecycle = (
  network: StateworksNetwork,
): Readonly<{
  done: boolean;
  stopReasons: readonly string[];
  humanBlockedTasks: readonly StateworksTask[];
  repeatedFailures: readonly StateworksTask[];
  invalidatedTasks: readonly StateworksTask[];
  destructiveTasks: readonly StateworksTask[];
}> => {
  const maxAttempts = network.max_repair_attempts ?? 3;
  const nextBatch = findNextBatch(network);
  const humanBlockedTasks = nextBatch.filter(
    (task) => task.owner === 'human' || task.type === 'human_action',
  );
  const repeatedFailures = network.tasks.filter(
    (task) =>
      normalizeStatus(task) === 'failed' &&
      (task.repair_attempts ?? 0) >= maxAttempts,
  );
  const invalidatedTasks = network.tasks.filter(
    (task) => normalizeStatus(task) === 'invalidated',
  );
  const destructiveTasks = nextBatch.filter(
    (task) => task.destructive === true,
  );
  const stopReasons: string[] = [];

  if (humanBlockedTasks.length > 0) {
    stopReasons.push('human_action_required');
  }

  if (destructiveTasks.length > 0) {
    stopReasons.push('destructive_change_required');
  }

  if (repeatedFailures.length > 0) {
    stopReasons.push('repeated_verifier_failure');
  }

  if (invalidatedTasks.length > 0) {
    stopReasons.push('invariant_violation');
  }

  return {
    done: network.tasks.every((task) => normalizeStatus(task) === 'committed'),
    stopReasons,
    humanBlockedTasks,
    repeatedFailures,
    invalidatedTasks,
    destructiveTasks,
  };
};

export const formatIssues = (result: ValidationResult): string => {
  const lines: string[] = [];

  for (const issue of [...result.errors, ...result.warnings]) {
    lines.push(`${issue.level.toUpperCase()}: ${issue.message}`);
  }

  return lines.join('\n');
};

const splitIssues = (issues: readonly ValidationIssue[]): ValidationResult => ({
  errors: issues.filter((issue) => issue.level === 'error'),
  warnings: issues.filter((issue) => issue.level === 'warning'),
});

const findCycles = (tasks: readonly StateworksTask[]): readonly string[][] => {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[][] = [];

  const visit = (id: string, path: readonly string[]) => {
    if (visiting.has(id)) {
      const cycleStart = path.indexOf(id);
      cycles.push([...path.slice(cycleStart), id]);
      return;
    }

    if (visited.has(id)) {
      return;
    }

    const task = byId.get(id);

    if (!task) {
      return;
    }

    visiting.add(id);

    for (const dep of task.deps ?? []) {
      visit(dep, [...path, dep]);
    }

    visiting.delete(id);
    visited.add(id);
  };

  for (const task of tasks) {
    visit(task.id, [task.id]);
  }

  return cycles;
};

const areCompatible = (
  left: StateworksTask,
  right: StateworksTask,
): boolean => {
  const leftWrites = new Set(left.writes ?? []);
  const rightWrites = new Set(right.writes ?? []);
  const leftReads = new Set(left.reads ?? []);
  const rightReads = new Set(right.reads ?? []);

  if (intersects(leftWrites, union(rightReads, rightWrites))) {
    return false;
  }

  if (intersects(rightWrites, leftReads)) {
    return false;
  }

  if (
    left.surface !== undefined &&
    right.surface !== undefined &&
    left.surface === right.surface &&
    left.surface !== 'repo' &&
    left.surface !== 'other' &&
    (leftWrites.size > 0 || rightWrites.size > 0)
  ) {
    return false;
  }

  return true;
};

const intersects = <T>(
  left: ReadonlySet<T>,
  right: ReadonlySet<T>,
): boolean => {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }

  return false;
};

const union = <T>(
  left: ReadonlySet<T>,
  right: ReadonlySet<T>,
): ReadonlySet<T> => new Set([...left, ...right]);
