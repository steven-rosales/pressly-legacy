import type { AccessExperienceOperations } from '@pressly/access-system/capabilities/experience-access-v1';

export type AccessCellName = keyof AccessExperienceOperations;

export type AccessExecute<Name extends AccessCellName> = Pick<
  AccessExperienceOperations[Name],
  'execute'
>;

export type AccessInput<Name extends AccessCellName> = Parameters<
  AccessExperienceOperations[Name]['execute']
>[0];

export type AccessOutcome<Name extends AccessCellName> = Awaited<
  ReturnType<AccessExperienceOperations[Name]['execute']>
>;

export type AccessSuccess<Name extends AccessCellName> = Extract<
  AccessOutcome<Name>,
  Readonly<{ kind: 'success' }>
>['value'];
