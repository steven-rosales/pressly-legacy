export type Scope =
  | Readonly<{ kind: 'global'; id: '*' }>
  | Readonly<{ kind: 'business'; id: string }>
  | Readonly<{ kind: 'location'; id: string }>
  | Readonly<{ kind: 'resource'; type: string; id: string }>;

export const globalScope = (): Scope => ({
  kind: 'global',
  id: '*',
});

export const businessScope = (businessId: string): Scope => ({
  kind: 'business',
  id: businessId,
});

export const locationScope = (locationId: string): Scope => ({
  kind: 'location',
  id: locationId,
});

export const resourceScope = (type: string, id: string): Scope => ({
  kind: 'resource',
  type,
  id,
});

export const scopeKey = (scope: Scope): string => {
  if (scope.kind === 'resource')
    return `${scope.kind}:${scope.type}:${scope.id}`;
  return `${scope.kind}:${scope.id}`;
};

export const scopeCovers = (
  assignmentScope: Scope,
  resourceScope: Scope,
): boolean => {
  if (assignmentScope.kind === 'global') return true;

  if (assignmentScope.kind === 'business' && resourceScope.kind === 'business')
    return assignmentScope.id === resourceScope.id;

  if (assignmentScope.kind === 'location' && resourceScope.kind === 'location')
    return assignmentScope.id === resourceScope.id;

  if (assignmentScope.kind === 'resource' && resourceScope.kind === 'resource')
    return (
      assignmentScope.type === resourceScope.type &&
      assignmentScope.id === resourceScope.id
    );

  return false;
};
