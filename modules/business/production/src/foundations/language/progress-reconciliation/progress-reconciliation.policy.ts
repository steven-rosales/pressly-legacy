import { result, type CodedFailure, type Result } from '@pressly/kernel';

export const floorProgressStageKinds = [
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
] as const;

export type FloorProgressStageKind = (typeof floorProgressStageKinds)[number];
export type FloorProgressStageState = 'planned' | 'started' | 'completed';
export type FloorProgressMilestone =
  | 'waiting_to_sort'
  | 'sorting_started'
  | 'sorting_completed'
  | 'washing_started'
  | 'washing_completed'
  | 'drying_started'
  | 'drying_completed'
  | 'folding_packaging_started'
  | 'finished';
export type FloorProgressTarget = Exclude<
  FloorProgressMilestone,
  'waiting_to_sort'
>;

export type FloorProgressReconciliationInput = Readonly<{
  runStatus: string;
  batchStatus: string;
  stages: readonly Readonly<{
    stageRunId: string;
    stage: string;
    status: string;
  }>[];
  target: FloorProgressTarget;
  sameKindAlreadyActive: boolean;
  assignedMachineIds: readonly string[];
  overlappingMachineIds: readonly string[];
}>;

export type FloorProgressReconciliationDecision = Readonly<{
  currentMilestone: FloorProgressMilestone;
  targetMilestone: FloorProgressTarget;
  batchStatus:
    | 'sorting'
    | 'washing'
    | 'drying'
    | 'folding_packaging'
    | 'finished';
  completedStages: readonly FloorProgressStageKind[];
  activeStage: FloorProgressStageKind | null;
  stages: readonly Readonly<{
    stageRunId: string;
    stage: FloorProgressStageKind;
    currentStatus: FloorProgressStageState;
    nextStatus: FloorProgressStageState;
  }>[];
}>;

const milestones: readonly FloorProgressMilestone[] = [
  'waiting_to_sort',
  'sorting_started',
  'sorting_completed',
  'washing_started',
  'washing_completed',
  'drying_started',
  'drying_completed',
  'folding_packaging_started',
  'finished',
];

const rejection = (code: string, message: string): CodedFailure => ({
  code,
  message,
});

const statesAt = (milestoneIndex: number): readonly FloorProgressStageState[] =>
  floorProgressStageKinds.map((_, stageIndex) => {
    const startedAt = stageIndex * 2 + 1;
    const completedAt = startedAt + 1;
    if (milestoneIndex >= completedAt) return 'completed';
    if (milestoneIndex === startedAt) return 'started';
    return 'planned';
  });

const batchStatusAt = (
  milestoneIndex: number,
): 'queued' | FloorProgressReconciliationDecision['batchStatus'] => {
  if (milestoneIndex === 0) return 'queued';
  if (milestoneIndex <= 2) return 'sorting';
  if (milestoneIndex <= 4) return 'washing';
  if (milestoneIndex <= 6) return 'drying';
  if (milestoneIndex === 7) return 'folding_packaging';
  return 'finished';
};

const canonicalStages = (
  input: FloorProgressReconciliationInput,
):
  | readonly Readonly<{
      stageRunId: string;
      stage: FloorProgressStageKind;
      status: FloorProgressStageState;
    }>[]
  | null => {
  if (input.stages.length !== floorProgressStageKinds.length) return null;
  const byKind = new Map(input.stages.map((stage) => [stage.stage, stage]));
  if (byKind.size !== floorProgressStageKinds.length) return null;

  return floorProgressStageKinds.flatMap((kind) => {
    const stage = byKind.get(kind);
    if (
      stage === undefined ||
      !['planned', 'started', 'completed'].includes(stage.status)
    )
      return [];
    return [
      {
        stageRunId: stage.stageRunId,
        stage: kind,
        status: stage.status as FloorProgressStageState,
      },
    ];
  });
};

export const evaluateFloorProgressReconciliation = (
  input: FloorProgressReconciliationInput,
): Result<FloorProgressReconciliationDecision, CodedFailure> => {
  if (input.runStatus !== 'started')
    return result.err(
      rejection(
        'PRODUCTION_RUN_NOT_STARTED',
        'Floor progress can only be recorded on a started production run.',
      ),
    );

  const stages = canonicalStages(input);
  if (stages === null || stages.length !== floorProgressStageKinds.length)
    return result.err(
      rejection(
        'BATCH_STAGE_GRAPH_INVALID',
        'The production batch does not have one valid stage of each kind.',
      ),
    );

  const currentIndex = milestones.findIndex((_, index) =>
    statesAt(index).every(
      (status, stageIndex) => stages[stageIndex]?.status === status,
    ),
  );
  if (currentIndex < 0)
    return result.err(
      rejection(
        'BATCH_STAGE_SEQUENCE_INVALID',
        'The recorded stages are not a completed prefix with at most one active stage.',
      ),
    );
  if (batchStatusAt(currentIndex) !== input.batchStatus)
    return result.err(
      rejection(
        'BATCH_STATUS_INCONSISTENT',
        'The batch status does not match its recorded stage progress.',
      ),
    );

  const targetIndex = milestones.indexOf(input.target);
  if (targetIndex <= currentIndex)
    return result.err(
      rejection(
        'FLOOR_PROGRESS_NOT_FORWARD',
        'Floor progress must move the batch to a later milestone.',
      ),
    );

  const desiredStates = statesAt(targetIndex);
  const activeStageIndex = desiredStates.indexOf('started');
  const activeStage =
    activeStageIndex < 0
      ? null
      : (floorProgressStageKinds[activeStageIndex] ?? null);
  if (activeStage !== null && input.sameKindAlreadyActive)
    return result.err(
      rejection(
        'STAGE_KIND_ALREADY_ACTIVE',
        'Another batch is active in this stage kind.',
      ),
    );

  const machinesRequired =
    activeStage === 'washing' || activeStage === 'drying';
  if (machinesRequired && input.assignedMachineIds.length === 0)
    return result.err(
      rejection(
        'MACHINE_ASSIGNMENT_REQUIRED',
        'An active washing or drying stage requires a machine assignment.',
      ),
    );
  if (machinesRequired && input.overlappingMachineIds.length > 0)
    return result.err(
      rejection(
        'MACHINE_ASSIGNMENT_OVERLAPS',
        'A selected machine is already occupied by another active stage.',
      ),
    );

  return result.ok({
    currentMilestone: milestones[currentIndex] ?? 'waiting_to_sort',
    targetMilestone: input.target,
    batchStatus: batchStatusAt(
      targetIndex,
    ) as FloorProgressReconciliationDecision['batchStatus'],
    completedStages: floorProgressStageKinds.filter(
      (_, index) => desiredStates[index] === 'completed',
    ),
    activeStage,
    stages: stages.map((stage, index) => ({
      stageRunId: stage.stageRunId,
      stage: stage.stage,
      currentStatus: stage.status,
      nextStatus: desiredStates[index] ?? 'planned',
    })),
  });
};
